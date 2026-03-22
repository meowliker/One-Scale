import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns, fetchMetaAdSets, fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  upsertPersistentMetaEndpointSnapshot,
  upsertPersistentCreativeAssets,
} from '@/app/api/lib/supabase-tracking';
import { enqueueMetaSyncTask, isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import { refreshMetaSetupSnapshots } from '@/app/api/lib/meta-setup-cache';
import type { Campaign, AdSet, Ad, PerformanceMetrics } from '@/types/campaign';

interface RefreshRequestBody {
  storeId?: string;
  includeHierarchy?: boolean;
  force?: boolean;
}

function buildCampaignScopeId(adAccountIds: string[]): string {
  const sorted = [...new Set(adAccountIds)].sort();
  return `accounts:${sorted.join(',')}`;
}

function mapCampaignMetrics(campaigns: Campaign[]): Record<string, Partial<PerformanceMetrics>> {
  const out: Record<string, Partial<PerformanceMetrics>> = {};
  for (const campaign of campaigns) {
    out[campaign.id] = campaign.metrics || {};
  }
  return out;
}

function hasSignal(rows: Array<{ metrics?: Partial<PerformanceMetrics> }>): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.impressions || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

async function persistCampaignSnapshot(
  useSupabase: boolean,
  storeId: string,
  scopeId: string,
  exactVariant: string,
  campaigns: Campaign[]
) {
  if (useSupabase) {
    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, exactVariant, campaigns),
      upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest', campaigns),
      hasSignal(campaigns)
        ? upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest_nonzero', campaigns)
        : Promise.resolve(),
    ]);
    return;
  }

  upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, exactVariant, campaigns);
  upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest', campaigns);
  if (hasSignal(campaigns)) {
    upsertMetaEndpointSnapshot(storeId, 'campaigns', scopeId, 'latest_nonzero', campaigns);
  }
}

async function persistAdSetSnapshot(
  useSupabase: boolean,
  storeId: string,
  campaignId: string,
  exactVariant: string,
  adSets: AdSet[]
) {
  if (useSupabase) {
    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, exactVariant, adSets),
      upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'latest', adSets),
      hasSignal(adSets)
        ? upsertPersistentMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'mode:fast', adSets)
        : Promise.resolve(),
    ]);
    return;
  }
  upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, exactVariant, adSets);
  upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'latest', adSets);
  if (hasSignal(adSets)) {
    upsertMetaEndpointSnapshot(storeId, 'adsets', campaignId, 'mode:fast', adSets);
  }
}

async function persistAdSnapshot(
  useSupabase: boolean,
  storeId: string,
  adSetId: string,
  exactVariant: string,
  ads: Ad[]
) {
  if (useSupabase) {
    // Cache creative assets for instant loading - ONLY for ACTIVE ads
    const activeAds = ads.filter((ad) => ad.status === 'ACTIVE');
    const creativeAssets = activeAds.map((ad) => ({
      adId: ad.id,
      creativeType: ad.creative.type === 'video' ? 'video' as const : 'image' as const,
      mediaUrl: ad.creative.mediaUrl || null,
      thumbnailUrl: ad.creative.thumbnailUrl || null,
      videoId: ad.creative.videoId || null,
      headline: ad.creative.headline || null,
      body: ad.creative.body || null,
      ctaType: ad.creative.ctaType || null,
      destinationUrl: ad.creative.destinationUrl || null,
    }));

    await Promise.all([
      upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, exactVariant, ads),
      upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, 'latest', ads),
      hasSignal(ads)
        ? upsertPersistentMetaEndpointSnapshot(storeId, 'ads', adSetId, 'mode:fast', ads)
        : Promise.resolve(),
      creativeAssets.length > 0 ? upsertPersistentCreativeAssets(storeId, creativeAssets) : Promise.resolve(),
    ]);
    return;
  }
  upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, exactVariant, ads);
  upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, 'latest', ads);
  if (hasSignal(ads)) {
    upsertMetaEndpointSnapshot(storeId, 'ads', adSetId, 'mode:fast', ads);
  }
}

export async function POST(request: NextRequest) {
  let body: RefreshRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storeId, includeHierarchy = false, force = false } = body;
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const useSupabase = isSupabasePersistenceEnabled();

  const adAccounts = useSupabase
    ? await listPersistentStoreAdAccounts(storeId)
    : getStoreAdAccounts(storeId);

  const activeAccounts = adAccounts.filter((a) => a.is_active);

  // Use the ad account's timezone (not server UTC) to determine "today".
  // This ensures we fetch the correct day's data regardless of server location.
  const accountTz = activeAccounts.find((a) => a.timezone)?.timezone || 'America/New_York';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: accountTz }).format(new Date()); // YYYY-MM-DD
  const dateRange = { since: today, until: today };
  const exactVariant = `range:since:${today}|until:${today}|strict:1`;
  if (activeAccounts.length === 0) {
    return NextResponse.json({ data: {}, lastSyncedAt: new Date().toISOString(), queued: false });
  }

  const scopeId = buildCampaignScopeId(activeAccounts.map((a) => a.ad_account_id));

  const snapshot = useSupabase
    ? await getPersistentMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, exactVariant)
    : getMetaEndpointSnapshot<Campaign[]>(storeId, 'campaigns', scopeId, exactVariant);

  const snapshotData = snapshot?.data || [];
  const snapshotAgeMs = snapshot?.updatedAt ? Date.now() - Date.parse(snapshot.updatedAt) : Number.POSITIVE_INFINITY;

  const shouldQueue = force || includeHierarchy || snapshotAgeMs > 120_000;
  const taskKey = `sync:store:${storeId}:${includeHierarchy ? 'hierarchy' : 'campaigns'}`;

  const queued = shouldQueue
    ? enqueueMetaSyncTask(taskKey, force ? 0 : 60_000, async () => {
        if (isMetaCallBlocked(storeId)) return;

        const token = await getMetaToken(storeId);
        if (!token) return;

        try {
          await refreshMetaSetupSnapshots({
            accessToken: token.accessToken,
            adAccounts: activeAccounts,
            writeSnapshot: async (endpoint, cachedScopeId, variantKey, payload) => {
              if (useSupabase) {
                await upsertPersistentMetaEndpointSnapshot(storeId, endpoint, cachedScopeId, variantKey, payload);
              } else {
                upsertMetaEndpointSnapshot(storeId, endpoint, cachedScopeId, variantKey, payload);
              }
            },
          });

          const allCampaigns = await Promise.all(
            activeAccounts.map(async (account) => ({
              accountId: account.ad_account_id,
              campaigns: await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
                disableDateFallback: true,
              }).catch(() => []),
            }))
          );

          const campaignMap = new Map<string, Campaign>();
          for (const group of allCampaigns) {
            for (const campaign of group.campaigns) {
              if (!campaignMap.has(campaign.id)) {
                campaignMap.set(campaign.id, {
                  ...campaign,
                  ad_account_id: group.accountId,
                } as Campaign);
              }
            }
          }

          const campaigns = Array.from(campaignMap.values());
          await persistCampaignSnapshot(useSupabase, storeId, scopeId, exactVariant, campaigns);

          if (!includeHierarchy) return;

          const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE');
          for (const campaign of activeCampaigns) {
            const campaignWithAccount = campaign as Campaign & { ad_account_id?: string };
            const campaignAccountId = campaignWithAccount.ad_account_id || '';
            const adSets = await fetchMetaAdSets(token.accessToken, campaign.id, dateRange, {
              disableDateFallback: true,
              preferLightweight: true,
              basicOnly: false,
            });
            const adSetsWithContext = adSets.map((adSet) => ({
              ...adSet,
              campaign_id: campaign.id,
              ad_account_id: campaignAccountId,
            })) as AdSet[];

            const adSetVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
            await persistAdSetSnapshot(useSupabase, storeId, campaign.id, adSetVariant, adSetsWithContext);

            for (const adSet of adSetsWithContext) {
              const ads = await fetchMetaAds(token.accessToken, adSet.id, dateRange, {
                disableDateFallback: true,
                preferLightweight: true,
                basicOnly: false,
              });
              const adsWithContext = ads.map((ad) => ({
                ...ad,
                adset_id: adSet.id,
                campaign_id: campaign.id,
                ad_account_id: campaignAccountId,
              })) as Ad[];
              const adsVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
              await persistAdSnapshot(useSupabase, storeId, adSet.id, adsVariant, adsWithContext);
              await new Promise((resolve) => setTimeout(resolve, 120));
            }

            await new Promise((resolve) => setTimeout(resolve, 180));
          }
        } catch (err) {
          if (err instanceof MetaRateLimitError) {
            markMetaRateLimited(storeId, 60);
          }
        }
      })
    : false;

  if (snapshotData.length > 0) {
    return NextResponse.json({
      data: mapCampaignMetrics(snapshotData),
      lastSyncedAt: snapshot?.updatedAt || new Date().toISOString(),
      campaignCount: snapshotData.length,
      queued,
      cached: true,
    });
  }

  if (isMetaCallBlocked(storeId)) {
    return NextResponse.json(
      {
        data: {},
        lastSyncedAt: new Date().toISOString(),
        queued,
        rateLimited: true,
      },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    await refreshMetaSetupSnapshots({
      accessToken: token.accessToken,
      adAccounts: activeAccounts,
      writeSnapshot: async (endpoint, cachedScopeId, variantKey, payload) => {
        if (useSupabase) {
          await upsertPersistentMetaEndpointSnapshot(storeId, endpoint, cachedScopeId, variantKey, payload);
        } else {
          upsertMetaEndpointSnapshot(storeId, endpoint, cachedScopeId, variantKey, payload);
        }
      },
    });

    const allCampaigns = await Promise.all(
      activeAccounts.map(async (account) => ({
        accountId: account.ad_account_id,
        campaigns: await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
          disableDateFallback: true,
        }).catch(() => []),
      }))
    );

    const campaignMap = new Map<string, Campaign>();
    for (const group of allCampaigns) {
      for (const campaign of group.campaigns) {
        if (!campaignMap.has(campaign.id)) {
          campaignMap.set(campaign.id, {
            ...campaign,
            ad_account_id: group.accountId,
          } as Campaign);
        }
      }
    }

    const campaigns = Array.from(campaignMap.values());
    await persistCampaignSnapshot(useSupabase, storeId, scopeId, exactVariant, campaigns);

    return NextResponse.json({
      data: mapCampaignMetrics(campaigns),
      lastSyncedAt: new Date().toISOString(),
      campaignCount: campaigns.length,
      queued,
      cached: false,
    });
  } catch (err) {
    if (err instanceof MetaRateLimitError) {
      markMetaRateLimited(storeId, 60);
    }
    const message = err instanceof Error ? err.message : 'Sync refresh failed';
    console.error('[sync/refresh] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
