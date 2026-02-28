import { NextResponse } from 'next/server';
import { getStoreAdAccounts } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns } from '@/app/api/lib/meta-client';
import { upsertMetaEndpointSnapshot } from '@/app/api/lib/db';

/**
 * Cron endpoint — refresh today's campaign data for all active stores.
 * Designed to be called by Vercel Cron or external scheduler every 15 minutes.
 *
 * GET /api/sync/cron
 */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const dateRange = { since: today, until: today };
  let synced = 0;
  let errors = 0;

  try {
    // Collect all unique store IDs from ad accounts
    const storeIds = new Set<string>();
    if (isSupabasePersistenceEnabled()) {
      // In Supabase mode we don't have a "list all stores" helper,
      // so this endpoint is best triggered per-store via the refresh route.
      return NextResponse.json({ message: 'Cron uses per-store refresh in Supabase mode', synced: 0, errors: 0 });
    }

    const allAccounts = getStoreAdAccounts('*');
    for (const acc of allAccounts) {
      if (acc.is_active) storeIds.add(acc.store_id);
    }

    for (const storeId of storeIds) {
      try {
        const token = await getMetaToken(storeId);
        if (!token) continue;

        const accounts = getStoreAdAccounts(storeId).filter((a) => a.is_active);
        for (const account of accounts) {
          const campaigns = await fetchMetaCampaigns(
            token.accessToken,
            account.ad_account_id,
            dateRange,
            { disableDateFallback: true }
          );
          // Cache the snapshot
          upsertMetaEndpointSnapshot(
            storeId,
            'campaigns',
            account.ad_account_id,
            `sync_${today}`,
            campaigns
          );
        }
        synced++;
      } catch {
        errors++;
      }
    }

    return NextResponse.json({ synced, errors, storeCount: storeIds.size });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron sync failed';
    console.error('[sync/cron] Error:', message);
    return NextResponse.json({ error: message, synced, errors }, { status: 500 });
  }
}
