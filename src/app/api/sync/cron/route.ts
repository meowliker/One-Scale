import { NextRequest, NextResponse } from 'next/server';
import { getAllStores, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns, fetchMetaAdSets, fetchMetaAds, MetaRateLimitError } from '@/app/api/lib/meta-client';
import { upsertPersistentMetaEndpointSnapshot } from '@/app/api/lib/supabase-tracking';
import { isMetaCallBlocked, markMetaRateLimited } from '@/app/api/lib/meta-sync-queue';

export const maxDuration = 300;

const SLOT_MS = 10 * 60 * 1000; // 10 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentSlot(): number {
  return Math.floor(Date.now() / SLOT_MS);
}

function pickRoundRobinStoreId(storeIds: string[]): string | null {
  if (storeIds.length === 0) return null;
  return storeIds[currentSlot() % storeIds.length] || null;
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

  const params = request.nextUrl.searchParams;
  const requestedStoreId = (params.get('storeId') || params.get('store_id') || '').trim();
  const forceAll = params.get('full') === '1';
  const explicitAuto = params.get('auto') === '1';
  const isVercelCron = (request.headers.get('x-vercel-cron') || '').length > 0;
  const autoMode = !forceAll && (explicitAuto || (isVercelCron && requestedStoreId.length === 0));

  const today = new Date().toISOString().slice(0, 10);
  const dateRange = { since: today, until: today };
  const exactVariant = `range:since:${today}|until:${today}|strict:1`;
  const adSetVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
  const adsVariant = `mode:fast|since:${today}|until:${today}|strict:1`;
  let synced = 0;
  let errors = 0;
  let adSetsSynced = 0;
  let adsSynced = 0;

  try {
    const useSupabase = isSupabasePersistenceEnabled();

    if (useSupabase) {
      const stores = await listPersistentStores();
      const storesTotal = stores.length;
      let targetStores = requestedStoreId
        ? stores.filter((store) => store.id === requestedStoreId)
        : stores;

      if (autoMode) {
        const eligible = targetStores
          .filter((store) => (store.adAccounts || []).some((a) => Number(a.is_active) === 1))
          .map((store) => store.id)
          .sort();
        const pickedStoreId = pickRoundRobinStoreId(eligible);
        targetStores = pickedStoreId
          ? targetStores.filter((store) => store.id === pickedStoreId)
          : [];
      }

      for (const store of targetStores) {
        try {
          const token = await getMetaToken(store.id);
          if (!token) continue;

          const activeAccounts = (store.adAccounts || []).filter((a) => Number(a.is_active) === 1);
          if (activeAccounts.length === 0) continue;

          const allCampaigns = await Promise.all(
            activeAccounts.map((account) =>
              fetchMetaCampaigns(
                token.accessToken,
                account.ad_account_id,
                dateRange,
                { disableDateFallback: true }
              ).catch(() => [])
            )
          );

          const campaignMap = new Map<string, (typeof allCampaigns)[number][number]>();
          for (const campaigns of allCampaigns) {
            for (const campaign of campaigns) {
              campaignMap.set(campaign.id, campaign);
            }
          }

          const mergedCampaigns = Array.from(campaignMap.values());
          const scopeId = `accounts:${activeAccounts.map((a) => a.ad_account_id).sort().join(',')}`;

          await Promise.all([
            upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', scopeId, exactVariant, mergedCampaigns),
            upsertPersistentMetaEndpointSnapshot(store.id, 'campaigns', scopeId, 'latest', mergedCampaigns),
          ]);

          synced++;

          // Sync ad sets and ads for ACTIVE campaigns only
          const activeCampaigns = mergedCampaigns.filter((c) => c.status === 'ACTIVE');
          
          for (const campaign of activeCampaigns) {
            if (isMetaCallBlocked(store.id)) {
              console.log(`[sync/cron] Rate limited, skipping remaining campaigns for ${store.id}`);
              break;
            }

            try {
              // Fetch ad sets for this campaign
              const adSets = await fetchMetaAdSets(token.accessToken, campaign.id, dateRange, {
                disableDateFallback: true,
                preferLightweight: true,
                basicOnly: false,
              });

              if (adSets.length > 0) {
                await Promise.all([
                  upsertPersistentMetaEndpointSnapshot(store.id, 'adsets', campaign.id, adSetVariant, adSets),
                  upsertPersistentMetaEndpointSnapshot(store.id, 'adsets', campaign.id, 'latest', adSets),
                ]);
                adSetsSynced += adSets.length;
              }

              // Small delay to avoid rate limiting
              await sleep(200);

              // Fetch ads for each ad set
              for (const adSet of adSets) {
                if (isMetaCallBlocked(store.id)) break;

                try {
                  const ads = await fetchMetaAds(token.accessToken, adSet.id, dateRange, {
                    disableDateFallback: true,
                    preferLightweight: true,
                    basicOnly: false,
                  });

                  if (ads.length > 0) {
                    await Promise.all([
                      upsertPersistentMetaEndpointSnapshot(store.id, 'ads', adSet.id, adsVariant, ads),
                      upsertPersistentMetaEndpointSnapshot(store.id, 'ads', adSet.id, 'latest', ads),
                    ]);
                    adsSynced += ads.length;
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
        } catch {
          errors++;
        }
      }

      return NextResponse.json({ 
        synced, 
        errors, 
        storeCount: storesTotal,
        storesTargeted: targetStores.length,
        mode: autoMode ? 'single_store_auto' : requestedStoreId ? 'single_store_manual' : 'all_stores',
        adSetsSynced,
        adsSynced,
        storage: 'supabase',
      });
    }

    const stores = getAllStores();
    const storesTotal = stores.length;
    let targetStores = requestedStoreId
      ? stores.filter((store) => store.id === requestedStoreId)
      : stores;

    if (autoMode) {
      const eligible = targetStores
        .filter((store) => getStoreAdAccounts(store.id).some((a) => a.is_active))
        .map((store) => store.id)
        .sort();
      const pickedStoreId = pickRoundRobinStoreId(eligible);
      targetStores = pickedStoreId
        ? targetStores.filter((store) => store.id === pickedStoreId)
        : [];
    }

    for (const store of targetStores) {
      try {
        const token = await getMetaToken(store.id);
        if (!token) continue;

        const accounts = getStoreAdAccounts(store.id).filter((a) => a.is_active);
        if (accounts.length === 0) continue;

        const allCampaigns = await Promise.all(
          accounts.map((account) =>
            fetchMetaCampaigns(
              token.accessToken,
              account.ad_account_id,
              dateRange,
              { disableDateFallback: true }
            ).catch(() => [])
          )
        );

        const campaignMap = new Map<string, (typeof allCampaigns)[number][number]>();
        for (const campaigns of allCampaigns) {
          for (const campaign of campaigns) {
            campaignMap.set(campaign.id, campaign);
          }
        }
        const mergedCampaigns = Array.from(campaignMap.values());
        const scopeId = `accounts:${accounts.map((a) => a.ad_account_id).sort().join(',')}`;

        upsertMetaEndpointSnapshot(store.id, 'campaigns', scopeId, exactVariant, mergedCampaigns);
        upsertMetaEndpointSnapshot(store.id, 'campaigns', scopeId, 'latest', mergedCampaigns);

        synced++;

        // Sync ad sets and ads for ACTIVE campaigns only (SQLite mode)
        const activeCampaigns = mergedCampaigns.filter((c) => c.status === 'ACTIVE');
        
        for (const campaign of activeCampaigns) {
          if (isMetaCallBlocked(store.id)) break;

          try {
            const adSets = await fetchMetaAdSets(token.accessToken, campaign.id, dateRange, {
              disableDateFallback: true,
              preferLightweight: true,
              basicOnly: false,
            });

            if (adSets.length > 0) {
              upsertMetaEndpointSnapshot(store.id, 'adsets', campaign.id, adSetVariant, adSets);
              upsertMetaEndpointSnapshot(store.id, 'adsets', campaign.id, 'latest', adSets);
              adSetsSynced += adSets.length;
            }

            await sleep(200);

            for (const adSet of adSets) {
              if (isMetaCallBlocked(store.id)) break;

              try {
                const ads = await fetchMetaAds(token.accessToken, adSet.id, dateRange, {
                  disableDateFallback: true,
                  preferLightweight: true,
                  basicOnly: false,
                });

                if (ads.length > 0) {
                  upsertMetaEndpointSnapshot(store.id, 'ads', adSet.id, adsVariant, ads);
                  upsertMetaEndpointSnapshot(store.id, 'ads', adSet.id, 'latest', ads);
                  adsSynced += ads.length;
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
      storeCount: storesTotal,
      storesTargeted: targetStores.length,
      mode: autoMode ? 'single_store_auto' : requestedStoreId ? 'single_store_manual' : 'all_stores',
      adSetsSynced,
      adsSynced,
      storage: 'sqlite',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron sync failed';
    console.error('[sync/cron] Error:', message);
    return NextResponse.json({ error: message, synced, errors }, { status: 500 });
  }
}
