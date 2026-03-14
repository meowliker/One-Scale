import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  listPersistentStoreAdAccounts,
} from '@/app/api/lib/supabase-persistence';
import { calculatePnL } from '@/lib/pnl/universalCalculator';
import { daysAgoInTimezone } from '@/lib/timezone';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/recompute-pnl
 *
 * Deletes existing snapshots and recomputes P&L from scratch using
 * the universal calculator (which reads balance transactions directly).
 * No internal HTTP calls — bypasses middleware entirely.
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

  const results: Array<{ storeId: string; deleted: number; daysComputed: number; error?: string }> = [];

  for (const store of stores) {
    const storeId = store.id;
    console.log(`[RecomputePnL] Processing store: ${storeId}`);

    try {
      // Get store timezone
      let adAccounts: Array<{ timezone?: string | null }> = [];
      try {
        adAccounts = await listPersistentStoreAdAccounts(storeId);
      } catch { /* no ad accounts */ }
      const tz = adAccounts[0]?.timezone || 'America/New_York';

      // 1. Delete existing snapshots for the recompute window
      const sinceDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const sinceStr = sinceDate.toISOString().split('T')[0];

      let deletedCount = 0;
      try {
        const existingRows = await rest<Array<{ date: string }>>(
          `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}&select=date`
        );
        deletedCount = existingRows?.length ?? 0;
        if (deletedCount > 0) {
          await rest(
            `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}`,
            { method: 'DELETE' }
          );
        }
      } catch { /* table might not exist yet */ }

      // 2. Recompute each day using the universal calculator directly
      let daysComputed = 0;
      const dayErrors: string[] = [];
      for (let i = daysBack; i >= 0; i--) {
        const dateStr = daysAgoInTimezone(i, tz);
        try {
          const pnl = await calculatePnL(storeId, dateStr, dateStr, {
            includeProductBreakdown: false,
          });

          await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{
              store_id: storeId,
              date: dateStr,
              revenue: pnl.totalRevenue,
              order_count: pnl.orderCount,
              cogs: pnl.totalCogs,
              ad_spend: pnl.totalAdSpend,
              shipping_cost: pnl.totalShipping,
              transaction_fees: pnl.totalFees,
              refunds: pnl.totalRefunds,
              full_refund_count: 0,
              partial_refund_count: 0,
              full_refund_amount: 0,
              partial_refund_amount: 0,
              chargeback_loss: pnl.totalChargebackLoss,
              chargeback_won: pnl.totalChargebackWon,
              gross_revenue: pnl.grossRevenue ?? pnl.totalRevenue,
              settled_revenue: pnl.settledRevenue ?? 0,
              revenue_source: pnl.revenueSource ?? 'orders_api',
              net_profit: pnl.totalNetProfit,
              margin: pnl.totalMargin,
              fee_method: pnl.feeMethod,
              synced_at: new Date().toISOString(),
              shopify_synced: pnl.orderCount > 0,
              meta_synced: pnl.totalAdSpend > 0,
            }]),
          });

          daysComputed++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          dayErrors.push(`${dateStr}: ${msg}`);
          console.error(`[RecomputePnL] ${storeId} ${dateStr} failed:`, err);
        }
      }

      results.push({ storeId, deleted: deletedCount, daysComputed, tz, loopDays: daysBack + 1, ...(dayErrors.length > 0 ? { errors: dayErrors.slice(0, 5) } : {}) });
      console.log(`[RecomputePnL] ${storeId} — deleted ${deletedCount}, recomputed ${daysComputed}/${daysBack + 1} days, errors: ${dayErrors.length}`);
    } catch (err) {
      const msg = err instanceof Error ? `${err.message} | ${err.stack?.split('\n')[1] || ''}` : 'Unknown error';
      results.push({ storeId, deleted: 0, daysComputed: 0, error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    storesFound: stores.length,
    daysBack,
    results,
  });
}
