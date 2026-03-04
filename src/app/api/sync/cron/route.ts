import { NextRequest, NextResponse } from 'next/server';
import { getAllStores, getStoreAdAccounts, upsertMetaEndpointSnapshot } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns } from '@/app/api/lib/meta-client';
import { upsertPersistentMetaEndpointSnapshot } from '@/app/api/lib/supabase-tracking';

/**
 * Cron endpoint — refresh today's campaign data for all active stores.
 * Designed to be called by Vercel Cron or external scheduler every 15 minutes.
 *
 * GET /api/sync/cron
 */
export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET || '';
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const dateRange = { since: today, until: today };
  const exactVariant = `range:since:${today}|until:${today}|strict:1`;
  let synced = 0;
  let errors = 0;

  try {
    const useSupabase = isSupabasePersistenceEnabled();

    if (useSupabase) {
      const stores = await listPersistentStores();

      for (const store of stores) {
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
        } catch {
          errors++;
        }
      }

      return NextResponse.json({ synced, errors, storeCount: stores.length, mode: 'supabase' });
    }

    const stores = getAllStores();
    for (const store of stores) {
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
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ synced, errors, storeCount: stores.length, mode: 'sqlite' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron sync failed';
    console.error('[sync/cron] Error:', message);
    return NextResponse.json({ error: message, synced, errors }, { status: 500 });
  }
}
