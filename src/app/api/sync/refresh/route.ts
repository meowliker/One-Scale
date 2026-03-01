import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchMetaCampaigns } from '@/app/api/lib/meta-client';
import { getStoreAdAccounts } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import type { PerformanceMetrics } from '@/types/campaign';

/**
 * Refresh today's campaign metrics for a store.
 *
 * POST /api/sync/refresh
 * Body: { storeId }
 *
 * Returns fresh campaign metrics keyed by ID + lastSyncedAt timestamp.
 * Designed to be polled every 60s from the Ads Manager client.
 */
export async function POST(request: NextRequest) {
  let body: { storeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storeId } = body;
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    // Get today's date for the sync window
    const today = new Date().toISOString().slice(0, 10);
    const dateRange = { since: today, until: today };

    // Get all active ad accounts for this store
    const adAccounts = isSupabasePersistenceEnabled()
      ? await listPersistentStoreAdAccounts(storeId)
      : getStoreAdAccounts(storeId);

    const activeAccounts = adAccounts.filter((a) => a.is_active);
    if (activeAccounts.length === 0) {
      return NextResponse.json({ data: {}, lastSyncedAt: new Date().toISOString() });
    }

    // Fetch fresh campaign data from all accounts sequentially to avoid rate limits
    const campaignUpdates: Record<string, Partial<PerformanceMetrics>> = {};

    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i];
      try {
        const campaigns = await fetchMetaCampaigns(token.accessToken, account.ad_account_id, dateRange, {
          disableDateFallback: true,
        });
        for (const campaign of campaigns) {
          campaignUpdates[campaign.id] = campaign.metrics;
        }
      } catch (err) {
        console.warn(`[sync/refresh] Account ${account.ad_account_id} failed:`, err instanceof Error ? err.message : err);
      }
      // Small delay between accounts to avoid rate limits
      if (i < activeAccounts.length - 1) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const lastSyncedAt = new Date().toISOString();

    return NextResponse.json({
      data: campaignUpdates,
      lastSyncedAt,
      campaignCount: Object.keys(campaignUpdates).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync refresh failed';
    console.error('[sync/refresh] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
