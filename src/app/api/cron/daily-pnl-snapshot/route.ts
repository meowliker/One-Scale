import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  listPersistentStoreAdAccounts,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { daysAgoInTimezone } from '@/lib/timezone';
import { calculatePnL } from '@/lib/pnl/universalCalculator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function logCron(
  cronName: string,
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; date?: string; warnings?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Get store timezone from ad accounts
      const adAccounts = await listPersistentStoreAdAccounts(store.id);
      const tz = adAccounts[0]?.timezone || 'America/New_York';

      // Yesterday in store timezone
      const yesterday = daysAgoInTimezone(1, tz);

      // Use universal calculator — single source of truth
      const pnl = await calculatePnL(store.id, yesterday, yesterday, {
        includeProductBreakdown: true,
      });

      // Build product breakdown JSON for pnl_snapshots
      const productBreakdown: Record<string, { revenue: number; quantity: number; cogs: number }> = {};
      for (const p of pnl.products) {
        productBreakdown[p.productId] = {
          revenue: p.revenue,
          quantity: p.unitsSold,
          cogs: p.cogs,
        };
      }

      // Upsert into pnl_snapshots
      await rest('/pnl_snapshots', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: store.id,
          date: yesterday,
          revenue: pnl.totalRevenue,
          net_revenue: pnl.totalRevenue - pnl.totalRefunds,
          ad_spend: pnl.totalAdSpend,
          cogs: pnl.totalCogs,
          payment_fees: pnl.totalFees,
          handling_fees: 0,
          chargebacks: pnl.totalChargebackLoss,
          refunds: pnl.totalRefunds,
          net_profit: pnl.totalNetProfit,
          margin: Math.round(pnl.totalMargin * 100) / 100,
          order_count: pnl.orderCount,
          cancelled_count: 0,
          currency: 'USD',
          product_breakdown: JSON.stringify(productBreakdown),
          campaign_breakdown: '{}',
          computed_at: new Date().toISOString(),
        }),
      });

      // Also upsert into daily_pnl_snapshots (the table used by /api/pnl/sync GET)
      await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          store_id: store.id,
          date: yesterday,
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
          net_profit: pnl.totalNetProfit,
          margin: pnl.totalMargin,
          attribution_rate: 0,
          warnings: JSON.stringify(pnl.warnings),
          product_breakdown: JSON.stringify(pnl.products),
          fee_method: pnl.feeMethod,
          synced_at: new Date().toISOString(),
          shopify_synced: pnl.orderCount > 0,
          meta_synced: pnl.totalAdSpend > 0,
        }]),
      });

      const elapsed = Date.now() - start;
      await logCron('daily-pnl-snapshot', store.id, 'success', 1, null, elapsed);
      results.push({ storeId: store.id, status: 'success', date: yesterday, warnings: pnl.warnings.length });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('daily-pnl-snapshot', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_daily_pnl_snapshot', message);
      results.push({ storeId: store.id, status: 'error', error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'daily-pnl-snapshot',
    runAt: new Date().toISOString(),
    results,
  });
}
