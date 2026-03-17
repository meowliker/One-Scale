/**
 * GET /api/dashboard/consolidated?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Multi-store consolidated P&L view.
 * Shows total revenue, ad spend, profit across all stores.
 * Requires session auth (not CRON_SECRET).
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const stores = await listPersistentStores();

  interface StoreMetrics {
    store_id: string;
    store_name: string;
    revenue: number;
    ad_spend: number;
    fees: number;
    refunds: number;
    chargeback_loss: number;
    net_profit: number;
    order_count: number;
    days_with_data: number;
    currency: string;
  }

  const storeMetrics: StoreMetrics[] = [];
  let totalRevenue = 0, totalAdSpend = 0, totalFees = 0;
  let totalRefunds = 0, totalChargebacks = 0, totalNetProfit = 0;
  let totalOrders = 0;

  for (const store of stores) {
    const snapshots = await rest<Array<{
      revenue: number; ad_spend: number; transaction_fees: number;
      refunds: number; chargeback_loss: number; net_profit: number;
      order_count: number; currency: string;
    }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(store.id)}` +
      `&date=gte.${from}&date=lte.${to}` +
      `&select=revenue,ad_spend,transaction_fees,refunds,chargeback_loss,net_profit,order_count,currency`
    ).catch(() => []);

    if (snapshots.length === 0) continue;

    const revenue = snapshots.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
    const adSpend = snapshots.reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
    const fees = snapshots.reduce((s, r) => s + (Number(r.transaction_fees) || 0), 0);
    const refunds = snapshots.reduce((s, r) => s + (Number(r.refunds) || 0), 0);
    const cbLoss = snapshots.reduce((s, r) => s + (Number(r.chargeback_loss) || 0), 0);
    const netProfit = snapshots.reduce((s, r) => s + (Number(r.net_profit) || 0), 0);
    const orders = snapshots.reduce((s, r) => s + (Number(r.order_count) || 0), 0);

    storeMetrics.push({
      store_id: store.id,
      store_name: store.name,
      revenue: Math.round(revenue * 100) / 100,
      ad_spend: Math.round(adSpend * 100) / 100,
      fees: Math.round(fees * 100) / 100,
      refunds: Math.round(refunds * 100) / 100,
      chargeback_loss: Math.round(cbLoss * 100) / 100,
      net_profit: Math.round(netProfit * 100) / 100,
      order_count: orders,
      days_with_data: snapshots.length,
      currency: snapshots[0]?.currency || 'USD',
    });

    totalRevenue += revenue;
    totalAdSpend += adSpend;
    totalFees += fees;
    totalRefunds += refunds;
    totalChargebacks += cbLoss;
    totalNetProfit += netProfit;
    totalOrders += orders;
  }

  // Sort by revenue descending
  storeMetrics.sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({
    period: { from, to },
    totals: {
      revenue: Math.round(totalRevenue * 100) / 100,
      ad_spend: Math.round(totalAdSpend * 100) / 100,
      fees: Math.round(totalFees * 100) / 100,
      refunds: Math.round(totalRefunds * 100) / 100,
      chargeback_loss: Math.round(totalChargebacks * 100) / 100,
      net_profit: Math.round(totalNetProfit * 100) / 100,
      order_count: totalOrders,
      blended_roas: totalAdSpend > 0 ? Math.round(totalRevenue / totalAdSpend * 100) / 100 : 0,
    },
    stores: storeMetrics,
    best_performer: storeMetrics[0]?.store_name || null,
    worst_performer: storeMetrics.length > 1 ? storeMetrics[storeMetrics.length - 1].store_name : null,
  });
}
