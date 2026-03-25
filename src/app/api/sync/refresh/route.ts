import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta, fetchMetaCampaigns, fetchMetaAdSets, fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts, getMetaEndpointSnapshot, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  listPersistentStoreAdAccounts,
  prunePersistentStoreMetaDataToActiveAccounts,
} from '@/app/api/lib/supabase-persistence';
import {
  getPersistentMetaEndpointSnapshot,
  prunePersistentAdsSnapshotsToActiveAccounts,
  upsertPersistentMetaEndpointSnapshot,
  upsertPersistentCreativeAssets,
} from '@/app/api/lib/supabase-tracking';
import { enqueueMetaSyncTask, isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import { type MetaSetupCachePayload, refreshMetaSetupSnapshots } from '@/app/api/lib/meta-setup-cache';
import {
  buildWarehouseDateRange,
  buildWarehouseVariantKey,
  materializeStoreMetaEntitiesFromSnapshots,
  syncWarehouseSnapshotsForStore,
} from '@/app/api/lib/meta-entity-warehouse';
import type { Campaign, AdSet, Ad, PerformanceMetrics } from '@/types/campaign';

interface RefreshRequestBody {
  storeId?: string;
  includeHierarchy?: boolean;
  force?: boolean;
  warehouseMode?: boolean;
}

export const maxDuration = 300;

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

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

type CampaignContext = {
  campaign_name: string | null;
  campaign_buying_type: string | null;
  campaign_daily_budget: number | null;
  campaign_bid_strategy: string | null;
};

function buildCampaignContextById(campaigns: Campaign[]): Map<string, CampaignContext> {
  const out = new Map<string, CampaignContext>();
  for (const campaign of campaigns) {
    out.set(campaign.id, {
      campaign_name: campaign.name || null,
      campaign_buying_type: asString(campaign.buying_type),
      campaign_daily_budget: typeof campaign.dailyBudget === 'number' && campaign.dailyBudget > 0
        ? campaign.dailyBudget
        : null,
      campaign_bid_strategy: asString(campaign.bidStrategy),
    });
  }
  return out;
}

function buildPageNameById(setupCache: MetaSetupCachePayload): Map<string, string> {
  const out = new Map<string, string>();
  for (const page of setupCache.pages || []) {
    if (!page?.id) continue;
    out.set(page.id, page.name || page.id);
  }
  return out;
}

function buildInstagramUsernameById(setupCache: MetaSetupCachePayload): Map<string, string> {
  const out = new Map<string, string>();
  for (const ig of setupCache.instagram || []) {
    if (!ig?.id) continue;
    const username = ig.username || ig.name || ig.id;
    if (username) out.set(ig.id, username);
  }
  for (const page of setupCache.pages || []) {
    if (!page?.instagramId) continue;
    if (page.instagramUsername) out.set(page.instagramId, page.instagramUsername);
  }
  return out;
}

function shouldSyncHierarchyCampaign(campaign: Campaign): boolean {
  return campaign.status === 'ACTIVE' || campaign.status === 'PAUSED';
}

function buildInstagramUsernameResolver(
  accessToken: string,
  usernameById: Map<string, string>
): (instagramUserId: string | null) => Promise<string | null> {
  const attempted = new Set<string>();
  return async (instagramUserId: string | null) => {
    if (!instagramUserId) return null;
    const cached = usernameById.get(instagramUserId);
    if (cached) return cached;
    if (attempted.has(instagramUserId)) return null;
    attempted.add(instagramUserId);
    try {
      const resolved = await fetchFromMeta<Record<string, unknown>>(
        accessToken,
        `/${instagramUserId}`,
        { fields: 'id,username' },
        8000,
        1
      );
      const username = asString(resolved.username);
      if (username) {
        usernameById.set(instagramUserId, username);
        return username;
      }
    } catch {
      // Best effort only.
    }
    return null;
  };
}

async function enrichAdsWithIdentity(params: {
  ads: Ad[];
  adSetId: string;
  campaignId: string;
  adAccountId: string;
  campaignContextById: Map<string, CampaignContext>;
  pageNameById: Map<string, string>;
  resolveInstagramUsername: (instagramUserId: string | null) => Promise<string | null>;
}): Promise<Ad[]> {
  const {
    ads,
    adSetId,
    campaignId,
    adAccountId,
    campaignContextById,
    pageNameById,
    resolveInstagramUsername,
  } = params;
  const out: Ad[] = [];
  const campaignContext = campaignContextById.get(campaignId);
  for (const ad of ads) {
    const raw = ad as unknown as Record<string, unknown>;
    const pageId = asString(raw.page_id);
    const instagramUserId = asString(raw.instagram_user_id);
    const instagramUsername = await resolveInstagramUsername(instagramUserId);

    out.push({
      ...ad,
      adset_id: adSetId,
      campaign_id: campaignId,
      ad_account_id: adAccountId,
      campaign_name: campaignContext?.campaign_name || null,
      campaign_buying_type: campaignContext?.campaign_buying_type || null,
      campaign_daily_budget: campaignContext?.campaign_daily_budget ?? null,
      campaign_bid_strategy: campaignContext?.campaign_bid_strategy || null,
      page_id: pageId,
      page_name: pageId ? (pageNameById.get(pageId) || null) : null,
      instagram_user_id: instagramUserId,
      instagram_username: instagramUsername,
    } as Ad);
  }
  return out;
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

async function persistCampaignSnapshotsPerAccount(
  useSupabase: boolean,
  storeId: string,
  exactVariant: string,
  campaignsByAccount: Array<{ accountId: string; campaigns: Campaign[] }>
) {
  if (useSupabase) {
    await Promise.all(
      campaignsByAccount.map((group) => Promise.all([
        upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, exactVariant, group.campaigns),
        upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, 'latest', group.campaigns),
        hasSignal(group.campaigns)
          ? upsertPersistentMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, 'latest_nonzero', group.campaigns)
          : Promise.resolve(),
      ]))
    );
    return;
  }

  for (const group of campaignsByAccount) {
    upsertMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, exactVariant, group.campaigns);
    upsertMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, 'latest', group.campaigns);
    if (hasSignal(group.campaigns)) {
      upsertMetaEndpointSnapshot(storeId, 'campaigns', group.accountId, 'latest_nonzero', group.campaigns);
    }
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

  if (useSupabase) {
    await prunePersistentStoreMetaDataToActiveAccounts(
      storeId,
      activeAccounts.map((a) => a.ad_account_id)
    );
    await prunePersistentAdsSnapshotsToActiveAccounts(
      storeId,
      activeAccounts.map((a) => a.ad_account_id)
    ).catch(() => {});
  }

  const warehouseMode = body.warehouseMode === true;

  if (warehouseMode) {
    const CRON_SECRET = process.env.CRON_SECRET;
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!useSupabase) {
      return NextResponse.json({ error: 'Warehouse mode requires Supabase persistence' }, { status: 400 });
    }
    if (activeAccounts.length === 0) {
      return NextResponse.json({
        ok: true,
        mode: 'warehouse_refresh',
        storeId,
        skipped: true,
        reason: 'no_active_meta_accounts',
      });
    }

    try {
      const accountTz = activeAccounts.find((a) => a.timezone)?.timezone || 'America/New_York';
      const { since, until } = buildWarehouseDateRange(accountTz);
      const variantKey = buildWarehouseVariantKey(since, until);

      const mappedAccounts = activeAccounts.map((a) => ({
        ad_account_id: a.ad_account_id,
        ad_account_name: a.ad_account_name,
        timezone: a.timezone,
      }));

      const synced = await syncWarehouseSnapshotsForStore({
        storeId,
        activeAccounts: mappedAccounts,
        since,
        until,
        variantKey,
      });

      const materialized = await materializeStoreMetaEntitiesFromSnapshots({
        storeId,
        activeAccounts: mappedAccounts,
        since,
        until,
        variantKey,
      });

      return NextResponse.json({
        ok: true,
        mode: 'warehouse_refresh',
        storeId,
        since,
        until,
        variantKey,
        syncedSnapshots: synced,
        materialized,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof MetaRateLimitError) {
        markMetaRateLimited(storeId, 90);
        return NextResponse.json(
          {
            ok: false,
            mode: 'warehouse_refresh',
            storeId,
            rateLimited: true,
            error: err.message,
          },
          { status: 429, headers: { 'Retry-After': '90' } }
        );
      }
      const message = err instanceof Error ? err.message : 'Warehouse refresh failed';
      console.error('[sync/refresh][warehouse] Error:', message);
      return NextResponse.json(
        {
          ok: false,
          mode: 'warehouse_refresh',
          storeId,
          error: message,
        },
        { status: 500 }
      );
    }
  }

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
          const setupCache = await refreshMetaSetupSnapshots({
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
          const pageNameById = buildPageNameById(setupCache);
          const instagramUsernameById = buildInstagramUsernameById(setupCache);
          const resolveInstagramUsername = buildInstagramUsernameResolver(
            token.accessToken,
            instagramUsernameById
          );

          const allCampaigns = await Promise.all(
            activeAccounts.map(async (account) => ({
              accountId: account.ad_account_id,
              campaigns: (await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
                disableDateFallback: true,
              }).catch(() => [])).map((campaign) => ({
                ...campaign,
                ad_account_id: account.ad_account_id,
              })),
            }))
          );
          await persistCampaignSnapshotsPerAccount(useSupabase, storeId, exactVariant, allCampaigns);

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
          const campaignContextById = buildCampaignContextById(campaigns);
          await persistCampaignSnapshot(useSupabase, storeId, scopeId, exactVariant, campaigns);

          if (!includeHierarchy) return;

          const activeCampaigns = campaigns.filter(shouldSyncHierarchyCampaign);
          for (const campaign of activeCampaigns) {
            const campaignWithAccount = campaign as Campaign & { ad_account_id?: string };
            const campaignAccountId = campaignWithAccount.ad_account_id || '';
            if (!campaignAccountId) continue;
            const adSets = await fetchMetaAdSets(token.accessToken, campaign.id, dateRange, {
              disableDateFallback: true,
              preferLightweight: true,
              basicOnly: false,
            });
            const adSetsWithContext = adSets.map((adSet) => ({
              ...adSet,
              campaign_id: campaign.id,
              ad_account_id: campaignAccountId,
              campaign_name: campaignContextById.get(campaign.id)?.campaign_name || null,
              campaign_buying_type: campaignContextById.get(campaign.id)?.campaign_buying_type || null,
              campaign_daily_budget: campaignContextById.get(campaign.id)?.campaign_daily_budget ?? null,
              campaign_bid_strategy: campaignContextById.get(campaign.id)?.campaign_bid_strategy || null,
            })) as AdSet[];

            const adSetVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
            await persistAdSetSnapshot(useSupabase, storeId, campaign.id, adSetVariant, adSetsWithContext);

            for (const adSet of adSetsWithContext) {
              const ads = await fetchMetaAds(token.accessToken, adSet.id, dateRange, {
                disableDateFallback: true,
                preferLightweight: true,
                basicOnly: false,
              });
              const adsWithContext = await enrichAdsWithIdentity({
                ads,
                adSetId: adSet.id,
                campaignId: campaign.id,
                adAccountId: campaignAccountId,
                campaignContextById,
                pageNameById,
                resolveInstagramUsername,
              });
              const adsVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
              await persistAdSnapshot(useSupabase, storeId, adSet.id, adsVariant, adsWithContext);
              await new Promise((resolve) => setTimeout(resolve, 120));
            }

            await new Promise((resolve) => setTimeout(resolve, 180));
          }

          if (useSupabase) {
            await prunePersistentAdsSnapshotsToActiveAccounts(
              storeId,
              activeAccounts.map((a) => a.ad_account_id)
            ).catch(() => {});
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
        campaigns: (await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
          disableDateFallback: true,
        }).catch(() => [])).map((campaign) => ({
          ...campaign,
          ad_account_id: account.ad_account_id,
        })),
      }))
    );
    await persistCampaignSnapshotsPerAccount(useSupabase, storeId, exactVariant, allCampaigns);

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
    if (useSupabase) {
      await prunePersistentAdsSnapshotsToActiveAccounts(
        storeId,
        activeAccounts.map((a) => a.ad_account_id)
      ).catch(() => {});
    }

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
