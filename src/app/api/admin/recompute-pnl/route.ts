import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getAppUrl } from '@/app/api/lib/url';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/recompute-pnl
 *
 * Triggers the P&L sync route (which fetches live from Shopify API)
 * for all stores. Does NOT delete existing snapshots — the sync
 * upserts so existing data is updated, not lost.
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
  const results: Array<{ storeId: string; syncOk: boolean; syncResult?: unknown; error?: string }> = [];

  // Step 1: Sync balance transactions for ALL stores first
  // This ensures fees, refunds, and chargebacks are fresh before P&L recompute
  console.log(`[RecomputePnL] Step 1: Syncing balance transactions for ${stores.length} stores`);
  try {
    const btRes = await fetch(`${baseUrl}/api/cron/sync-balance-transactions`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const btJson = await btRes.json().catch(() => null);
    console.log(`[RecomputePnL] Balance txn sync result:`, btJson?.ok ? 'success' : 'failed');
  } catch (err) {
    console.warn('[RecomputePnL] Balance txn sync failed:', err instanceof Error ? err.message : err);
  }

  // Step 2: Trigger P&L recompute for each store
  console.log(`[RecomputePnL] Step 2: Recomputing P&L for ${stores.length} stores, daysBack: ${daysBack}`);
  for (const store of stores) {
    const storeId = store.id;

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

      const syncJson = await syncRes.json().catch(() => null);
      results.push({ storeId, syncOk: syncRes.ok, syncResult: syncJson });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      results.push({ storeId, syncOk: false, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    storesFound: stores.length,
    daysBack,
    results,
  });
}

/**
 * DELETE /api/admin/recompute-pnl
 *
 * Deletes all daily_pnl_snapshots for all stores.
 * Use this to reset bad data so the dashboard falls back to live computation.
 */
export async function DELETE(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const stores = await listPersistentStores();
  let totalDeleted = 0;

  for (const store of stores) {
    try {
      const rows = await rest<Array<{ date: string }>>(
        `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(store.id)}&select=date`
      );
      if (rows && rows.length > 0) {
        await rest(
          `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(store.id)}`,
          { method: 'DELETE' }
        );
        totalDeleted += rows.length;
      }
    } catch { /* ignore */ }
  }

  return NextResponse.json({ ok: true, totalDeleted, storesCleared: stores.length });
}
