/**
 * GET /api/prism/trend-alerts?storeId=X
 *
 * GAP 4 — Multi-date trend alerts.
 * Compares last 7 days vs previous 7 days for key metrics.
 * Returns actionable alerts with severity.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const now = new Date();
  const d7ago = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
  const d14ago = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0];
  const yesterday = new Date(now.getTime() - 86400000).toISOString().split('T')[0];

  // Last 7 days
  const recent = await rest<Array<{
    date: string; revenue: number; ad_spend: number; refunds: number;
    transaction_fees: number; net_profit: number; order_count: number;
  }>>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&and=(date.gte.${d7ago},date.lte.${yesterday})&select=date,revenue,ad_spend,refunds,transaction_fees,net_profit,order_count`
  ).catch(() => []);

  // Previous 7 days
  const previous = await rest<Array<{
    date: string; revenue: number; ad_spend: number; refunds: number;
    transaction_fees: number; net_profit: number; order_count: number;
  }>>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&and=(date.gte.${d14ago},date.lt.${d7ago})&select=date,revenue,ad_spend,refunds,transaction_fees,net_profit,order_count`
  ).catch(() => []);

  if (recent.length === 0) {
    return NextResponse.json({ store_id: storeId, alerts: [], message: 'Not enough data for trend analysis' });
  }

  const sum = (arr: typeof recent, key: keyof typeof recent[0]) =>
    arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);

  const recentRev = sum(recent, 'revenue');
  const prevRev = sum(previous, 'revenue');
  const recentSpend = sum(recent, 'ad_spend');
  const prevSpend = sum(previous, 'ad_spend');
  const recentRefunds = sum(recent, 'refunds');
  const prevRefunds = sum(previous, 'refunds');
  const recentProfit = sum(recent, 'net_profit');
  const prevProfit = sum(previous, 'net_profit');
  const recentOrders = sum(recent, 'order_count');
  const prevOrders = sum(previous, 'order_count');

  const recentRoas = recentSpend > 0 ? recentRev / recentSpend : 0;
  const prevRoas = prevSpend > 0 ? prevRev / prevSpend : 0;
  const recentRefundRate = recentRev > 0 ? recentRefunds / recentRev * 100 : 0;
  const prevRefundRate = prevRev > 0 ? prevRefunds / prevRev * 100 : 0;

  const pctChange = (curr: number, prev: number) =>
    prev > 0 ? Math.round((curr - prev) / prev * 100) : (curr > 0 ? 100 : 0);

  const alerts: Array<{ type: string; severity: string; message: string; metric: string; change_pct: number }> = [];

  // Revenue trend
  const revChange = pctChange(recentRev, prevRev);
  if (revChange < -20) {
    alerts.push({ type: 'revenue_decline', severity: 'high', message: `Revenue down ${Math.abs(revChange)}% vs previous week`, metric: 'revenue', change_pct: revChange });
  } else if (revChange < -10) {
    alerts.push({ type: 'revenue_decline', severity: 'medium', message: `Revenue down ${Math.abs(revChange)}% vs previous week`, metric: 'revenue', change_pct: revChange });
  }

  // ROAS trend
  const roasChange = pctChange(recentRoas, prevRoas);
  if (recentSpend > 0 && roasChange < -15) {
    alerts.push({ type: 'roas_decline', severity: 'high', message: `ROAS dropped ${Math.abs(roasChange)}% (${prevRoas.toFixed(2)}x → ${recentRoas.toFixed(2)}x)`, metric: 'roas', change_pct: roasChange });
  }

  // Refund rate increase
  if (recentRefundRate > prevRefundRate + 2 && recentRefundRate > 3) {
    alerts.push({ type: 'refund_spike', severity: 'medium', message: `Refund rate increased to ${recentRefundRate.toFixed(1)}% (was ${prevRefundRate.toFixed(1)}%)`, metric: 'refund_rate', change_pct: Math.round(recentRefundRate - prevRefundRate) });
  }

  // Spend up but revenue flat
  const spendChange = pctChange(recentSpend, prevSpend);
  if (spendChange > 20 && revChange < 5 && recentSpend > 0) {
    alerts.push({ type: 'spend_inefficiency', severity: 'high', message: `Ad spend up ${spendChange}% but revenue only ${revChange > 0 ? '+' : ''}${revChange}%`, metric: 'efficiency', change_pct: spendChange });
  }

  // Profit turning negative
  if (recentProfit < 0 && prevProfit >= 0) {
    alerts.push({ type: 'profit_negative', severity: 'critical', message: `Turned unprofitable this week (profit: $${recentProfit.toFixed(0)})`, metric: 'profit', change_pct: pctChange(recentProfit, prevProfit) });
  }

  // Order volume decline
  const orderChange = pctChange(recentOrders, prevOrders);
  if (orderChange < -25) {
    alerts.push({ type: 'order_decline', severity: 'medium', message: `Orders down ${Math.abs(orderChange)}% vs previous week`, metric: 'orders', change_pct: orderChange });
  }

  // Save critical alerts to prism_alerts
  for (const alert of alerts.filter(a => a.severity === 'critical' || a.severity === 'high')) {
    await rest('/prism_alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id: storeId, alert_type: alert.type, severity: alert.severity,
        message: alert.message, details: { metric: alert.metric, change_pct: alert.change_pct },
      }),
    }).catch(() => null);
  }

  return NextResponse.json({
    store_id: storeId,
    period: { recent: `${d7ago} to ${yesterday}`, previous: `${d14ago} to ${d7ago}` },
    summary: {
      revenue: { recent: Math.round(recentRev), previous: Math.round(prevRev), change_pct: revChange },
      ad_spend: { recent: Math.round(recentSpend), previous: Math.round(prevSpend), change_pct: spendChange },
      roas: { recent: Math.round(recentRoas * 100) / 100, previous: Math.round(prevRoas * 100) / 100, change_pct: roasChange },
      refund_rate: { recent: Math.round(recentRefundRate * 10) / 10, previous: Math.round(prevRefundRate * 10) / 10 },
      orders: { recent: recentOrders, previous: prevOrders, change_pct: orderChange },
    },
    alerts,
    alert_count: alerts.length,
  });
}
