import { NextRequest, NextResponse } from 'next/server';
import { getAllStores, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
  prunePersistentStoreMetaDataToActiveAccounts,
} from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta, fetchMetaCampaigns, fetchMetaAdSets, fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { prunePersistentAdsSnapshotsToActiveAccounts, upsertPersistentMetaEndpointSnapshot } from '@/app/api/lib/supabase-tracking';
import { isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';
import { type MetaSetupCachePayload, refreshMetaSetupSnapshots } from '@/app/api/lib/meta-setup-cache';
import type { Ad, AdSet, Campaign } from '@/types/campaign';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const username = page.instagramUsername;
    if (username) out.set(page.instagramId, username);
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
      // Best effort only; ID is still useful without username.
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

/**
 * Cron endpoint — refresh campaign, adset, and ad data for all active stores.
 * Designed to be called by Vercel Cron or external scheduler every 10 minutes.
 * 
 * Syncs:
 * - All campaigns for active ad accounts
 * - All ad sets for ACTIVE campaigns
 * - All ads for ad sets in ACTIVE campaigns
 * 
 * Data is stored in Supabase snapshots and served from cache on subsequent requests.
 *
 * GET /api/sync/cron
 */
export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateRange = { since: today, until: today };
  const exactVariant = `range:since:${today}|until:${today}|strict:1`;
  const adSetVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
  const adsVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
  let synced = 0;
  let errors = 0;
  let adSetsSynced = 0;
  let adsSynced = 0;
  let prunedAds = 0;

  try {
    const useSupabase = isSupabasePersistenceEnabled();

    if (useSupabase) {
      const stores = await listPersistentStores();

      for (const store of stores) {
        try {
          const token = await getMetaToken(store.id);
          if (!token) continue;

          const activeAccounts = (store.adAccounts || []).filter((a) => Number(a.is_active) === 1);
          await prunePersistentStoreMetaDataToActiveAccounts(
            store.id,
            activeAccounts.map((a) => a.ad_account_id)
          );
          if (activeAccounts.length === 0) continue;

          const setupCache = await refreshMetaSetupSnapshots({
            accessToken: token.accessToken,
            adAccounts: activeAccounts,
            writeSnapshot: async (endpoint, scopeId, variantKey, payload) => {
              await upsertPersistentMetaEndpointSnapshot(store.id, endpoint, scopeId, variantKey, payload);
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
              campaigns: (await fetchMetaCampaigns(
                token.accessToken,
                account.ad_account_id,
                dateRange,
                { disableDateFallback: true }
              ).catch(() => [])).map((campaign) => ({
                ...campaign,
                ad_account_id: account.ad_account_id,
              })),
            }))
          );

          await Promise.all(
            allCampaigns.map((group) => Promise.all([
              upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', group.accountId, exactVariant, group.campaigns),
              upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', group.accountId, 'latest', group.campaigns),
            ]))
          );

          const campaignMap = new Map<string, Campaign>();
          for (const group of allCampaigns) {
            for (const campaign of group.campaigns) {
              campaignMap.set(campaign.id, {
                ...campaign,
                ad_account_id: group.accountId,
              } as Campaign);
            }
          }

          const mergedCampaigns = Array.from(campaignMap.values());
          const campaignContextById = buildCampaignContextById(mergedCampaigns);
          const scopeId = `accounts:${activeAccounts.map((a) => a.ad_account_id).sort().join(',')}`;

          await Promise.all([
            upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', scopeId, exactVariant, mergedCampaigns),
            upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', scopeId, 'latest', mergedCampaigns),
          ]);

          synced++;

          // Sync ad sets and ads for ACTIVE + PAUSED campaigns
          const activeCampaigns = mergedCampaigns.filter(shouldSyncHierarchyCampaign);
          
          for (const campaign of activeCampaigns) {
            if (isMetaCallBlocked(store.id)) {
              console.log(`[sync/cron] Rate limited, skipping remaining campaigns for ${store.id}`);
              break;
            }
            const campaignWithAccount = campaign as Campaign & { ad_account_id?: string };
            const campaignAccountId = campaignWithAccount.ad_account_id || '';
            if (!campaignAccountId) {
              console.warn(`[sync/cron] Missing ad_account_id for campaign ${campaign.id}, skipping hierarchy sync for this campaign.`);
              continue;
            }

            try {
              // Fetch ad sets for this campaign
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

              if (adSetsWithContext.length > 0) {
                await Promise.all([
                  upsertPersistentMetaEndpointSnapshot(store.id, 'adsets', campaign.id, adSetVariant, adSetsWithContext),
                  upsertPersistentMetaEndpointSnapshot(store.id, 'adsets', campaign.id, 'latest', adSetsWithContext),
                ]);
                adSetsSynced += adSetsWithContext.length;
              }

              // Small delay to avoid rate limiting
              await sleep(200);

              // Fetch ads for each ad set
              for (const adSet of adSetsWithContext) {
                if (isMetaCallBlocked(store.id)) break;

                try {
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

                  if (adsWithContext.length > 0) {
                    await Promise.all([
                      upsertPersistentMetaEndpointSnapshot(store.id, 'ads', adSet.id, adsVariant, adsWithContext),
                      upsertPersistentMetaEndpointSnapshot(store.id, 'ads', adSet.id, 'latest', adsWithContext),
                    ]);
                    adsSynced += adsWithContext.length;
                  }

                  // Delay between ad set requests
                  await sleep(150);
                } catch (adErr) {
                  if (adErr instanceof MetaRateLimitError) {
                    markMetaRateLimited(store.id, 60);
                    console.log(`[sync/cron] Rate limited fetching ads for adset ${adSet.id}`);
                    break;
                  }
                }
              }

              // Delay between campaign requests
              await sleep(300);
            } catch (adSetErr) {
              if (adSetErr instanceof MetaRateLimitError) {
                markMetaRateLimited(store.id, 60);
                console.log(`[sync/cron] Rate limited fetching adsets for campaign ${campaign.id}`);
                break;
              }
            }
          }

          const cleanup = await prunePersistentAdsSnapshotsToActiveAccounts(
            store.id,
            activeAccounts.map((a) => a.ad_account_id)
          );
          prunedAds += cleanup.removedAds;
        } catch {
          errors++;
        }
      }

      return NextResponse.json({ 
        synced, 
        errors, 
        storeCount: stores.length, 
        adSetsSynced,
        adsSynced,
        prunedAds,
        mode: 'supabase' 
      });
    }

    const stores = getAllStores();
    for (const store of stores) {
      try {
        const token = await getMetaToken(store.id);
        if (!token) continue;

        const accounts = getStoreAdAccounts(store.id).filter((a) => a.is_active);
        if (accounts.length === 0) continue;

        const setupCache = await refreshMetaSetupSnapshots({
          accessToken: token.accessToken,
          adAccounts: accounts,
          writeSnapshot: async (endpoint, scopeId, variantKey, payload) => {
            upsertMetaEndpointSnapshot(store.id, endpoint, scopeId, variantKey, payload);
          },
        });
        const pageNameById = buildPageNameById(setupCache);
        const instagramUsernameById = buildInstagramUsernameById(setupCache);
        const resolveInstagramUsername = buildInstagramUsernameResolver(
          token.accessToken,
          instagramUsernameById
        );

        const allCampaigns = await Promise.all(
          accounts.map(async (account) => ({
            accountId: account.ad_account_id,
            campaigns: (await fetchMetaCampaigns(
              token.accessToken,
              account.ad_account_id,
              dateRange,
              { disableDateFallback: true }
            ).catch(() => [])).map((campaign) => ({
              ...campaign,
              ad_account_id: account.ad_account_id,
            })),
          }))
        );

        for (const group of allCampaigns) {
          upsertMetaEndpointSnapshot(store.id, 'campaigns', group.accountId, exactVariant, group.campaigns);
          upsertMetaEndpointSnapshot(store.id, 'campaigns', group.accountId, 'latest', group.campaigns);
        }

        const campaignMap = new Map<string, Campaign>();
        for (const group of allCampaigns) {
          for (const campaign of group.campaigns) {
            campaignMap.set(campaign.id, {
              ...campaign,
              ad_account_id: group.accountId,
            } as Campaign);
          }
        }
        const mergedCampaigns = Array.from(campaignMap.values());
        const campaignContextById = buildCampaignContextById(mergedCampaigns);
        const scopeId = `accounts:${accounts.map((a) => a.ad_account_id).sort().join(',')}`;

        upsertMetaEndpointSnapshot(store.id, 'campaigns', scopeId, exactVariant, mergedCampaigns);
        upsertMetaEndpointSnapshot(store.id, 'campaigns', scopeId, 'latest', mergedCampaigns);

        synced++;

        // Sync ad sets and ads for ACTIVE + PAUSED campaigns (SQLite mode)
        const activeCampaigns = mergedCampaigns.filter(shouldSyncHierarchyCampaign);
        
        for (const campaign of activeCampaigns) {
          if (isMetaCallBlocked(store.id)) break;
          const campaignWithAccount = campaign as Campaign & { ad_account_id?: string };
          const campaignAccountId = campaignWithAccount.ad_account_id || '';
          if (!campaignAccountId) {
            console.warn(`[sync/cron] Missing ad_account_id for campaign ${campaign.id}, skipping hierarchy sync for this campaign.`);
            continue;
          }

          try {
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

            if (adSetsWithContext.length > 0) {
              upsertMetaEndpointSnapshot(store.id, 'adsets', campaign.id, adSetVariant, adSetsWithContext);
              upsertMetaEndpointSnapshot(store.id, 'adsets', campaign.id, 'latest', adSetsWithContext);
              adSetsSynced += adSetsWithContext.length;
            }

            await sleep(200);

            for (const adSet of adSetsWithContext) {
              if (isMetaCallBlocked(store.id)) break;

              try {
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

                if (adsWithContext.length > 0) {
                  upsertMetaEndpointSnapshot(store.id, 'ads', adSet.id, adsVariant, adsWithContext);
                  upsertMetaEndpointSnapshot(store.id, 'ads', adSet.id, 'latest', adsWithContext);
                  adsSynced += adsWithContext.length;
                }

                await sleep(150);
              } catch (adErr) {
                if (adErr instanceof MetaRateLimitError) {
                  markMetaRateLimited(store.id, 60);
                  break;
                }
              }
            }

            await sleep(300);
          } catch (adSetErr) {
            if (adSetErr instanceof MetaRateLimitError) {
              markMetaRateLimited(store.id, 60);
              break;
            }
          }
        }
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ 
      synced, 
      errors, 
      storeCount: stores.length, 
      adSetsSynced,
      adsSynced,
      mode: 'sqlite' 
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron sync failed';
    console.error('[sync/cron] Error:', message);
    return NextResponse.json({ error: message, synced, errors }, { status: 500 });
  }
}
