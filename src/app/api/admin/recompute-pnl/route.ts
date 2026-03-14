import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getAppUrl } from '@/app/api/lib/url';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/recompute-pnl
 *
 * Invalidates all P&L cache and triggers re-sync from balance transactions.
 * Run once after deploying balance-transaction-based P&L.
 *
 * Auth: CRON_SECRET bearer token.
 *
 * Body (optional):
 *   { daysBack?: number }   — how many days to recompute (default 30)
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { daysBack?: number };
  const daysBack = body.daysBack ?? 30;

  const stores = await listPersistentStores();
  if (!stores || stores.length === 0) {
    return NextResponse.json({ ok: true, message: 'No stores found', storesFound: 0 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || getAppUrl(request);
  const results: Array<{ storeId: string; deleted: number; syncTriggered: boolean; error?: string }> = [];

  for (const store of stores) {
    const storeId = store.id;
    console.log(`[RecomputePnL] Processing store: ${storeId}`);

    try {
      // 1. Delete existing snapshots for the recompute window
      const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const sinceStr = sinceDate.toISOString().split('T')[0];

      // Count existing rows first
      let existingRows: Array<{ date: string }> = [];
      try {
        existingRows = await rest<Array<{ date: string }>>(
          `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}&select=date`
        );
      } catch { /* table might not exist yet */ }

      // Delete all snapshots in range to force recomputation
      if (existingRows.length > 0) {
        await rest(
          `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}`,
          { method: 'DELETE' }
        );
      }

      // 2. Trigger balance transaction sync first
      try {
        await fetch(`${baseUrl}/api/cron/sync-balance-transactions`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
        });
      } catch { /* non-blocking */ }

      // 3. Trigger P&L sync for all days
      let syncTriggered = false;
      try {
        const syncRes = await fetch(`${baseUrl}/api/pnl/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            secret: process.env.PNL_SYNC_SECRET,
            daysBack,
          }),
        });
        syncTriggered = syncRes.ok;
      } catch { /* non-blocking */ }

      results.push({
        storeId,
        deleted: existingRows.length,
        syncTriggered,
      });

      console.log(`[RecomputePnL] ${storeId} — deleted ${existingRows.length} snapshots, sync: ${syncTriggered}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      results.push({ storeId, deleted: 0, syncTriggered: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    storesFound: stores.length,
    daysBack,
    results,
  });
}
