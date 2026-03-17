/**
 * GET /api/prism/break-even?storeId=X&days=30
 *
 * Break-even ROAS and scaling intelligence.
 * Tells merchants exactly how much they can spend on ads.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const days = parseInt(searchParams.get('days') || '30');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const dateTo = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const snapshots = await rest<Array<{
    date: string; revenue: number; transaction_fees: number;
    refunds: number; chargeback_loss: number; ad_spend: number;
    cogs: number; net_profit: number;
  }>>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}` +
    `&date=gte.${dateFrom}&date=lte.${dateTo}` +
    `&select=date,revenue,transaction_fees,refunds,chargeback_loss,ad_spend,cogs,net_profit` +
    `&order=date`
  ).catch(() => []);

  if (snapshots.length === 0) {
    return NextResponse.json({ error: 'No P&L data available', storeId });
  }

  const totalRevenue = snapshots.reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const totalFees = snapshots.reduce((s, r) => s + (Number(r.transaction_fees) || 0), 0);
  const totalRefunds = snapshots.reduce((s, r) => s + (Number(r.refunds) || 0), 0);
  const totalCbLoss = snapshots.reduce((s, r) => s + (Number(r.chargeback_loss) || 0), 0);
  const totalAdSpend = snapshots.reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
  const totalCogs = snapshots.reduce((s, r) => s + (Number(r.cogs) || 0), 0);
  const totalNetProfit = snapshots.reduce((s, r) => s + (Number(r.net_profit) || 0), 0);

  // Contribution margin = revenue after all costs except ad spend
  const contributionMargin = totalRevenue - totalFees - totalRefunds - totalCbLoss - totalCogs;

  // Break-even ROAS = revenue / contribution margin
  const breakEvenRoas = contributionMargin > 0 ? totalRevenue / contributionMargin : 0;

  // Current ROAS
  const currentRoas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

  // Daily averages
  const daysWithData = snapshots.length;
  const avgDailyRevenue = totalRevenue / daysWithData;
  const avgDailySpend = totalAdSpend / daysWithData;
  const avgDailyProfit = totalNetProfit / daysWithData;

  // Scaling headroom
  let scalingHeadroom = 0;
  let scalingAdvice = '';

  if (currentRoas > breakEvenRoas && breakEvenRoas > 0) {
    scalingHeadroom = totalAdSpend * (currentRoas / breakEvenRoas - 1);
    scalingAdvice = `You can increase ad spend by $${Math.round(scalingHeadroom)} over ${daysWithData} days before hitting break-even`;
  } else if (currentRoas > 0 && currentRoas < breakEvenRoas) {
    scalingAdvice = `Below break-even — reduce spend or improve conversion rate`;
  } else if (totalAdSpend === 0) {
    scalingAdvice = `No ad spend data — connect Meta Ads to see break-even analysis`;
  }

  // Trend: is ROAS improving?
  const halfPoint = Math.floor(snapshots.length / 2);
  const firstHalfRev = snapshots.slice(0, halfPoint).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const firstHalfSpend = snapshots.slice(0, halfPoint).reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
  const secondHalfRev = snapshots.slice(halfPoint).reduce((s, r) => s + (Number(r.revenue) || 0), 0);
  const secondHalfSpend = snapshots.slice(halfPoint).reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);

  const firstHalfRoas = firstHalfSpend > 0 ? firstHalfRev / firstHalfSpend : 0;
  const secondHalfRoas = secondHalfSpend > 0 ? secondHalfRev / secondHalfSpend : 0;
  const roasTrend = firstHalfRoas > 0 ? ((secondHalfRoas - firstHalfRoas) / firstHalfRoas * 100) : 0;

  return NextResponse.json({
    store_id: storeId,
    period: { from: dateFrom, to: dateTo, days: daysWithData },
    break_even_roas: Math.round(breakEvenRoas * 100) / 100,
    current_roas: Math.round(currentRoas * 100) / 100,
    is_profitable: currentRoas > breakEvenRoas,
    scaling_headroom: Math.round(scalingHeadroom * 100) / 100,
    scaling_advice: scalingAdvice,
    roas_trend_pct: Math.round(roasTrend * 10) / 10,
    roas_trend_direction: roasTrend > 5 ? 'improving' : roasTrend < -5 ? 'declining' : 'stable',
    metrics: {
      total_revenue: Math.round(totalRevenue * 100) / 100,
      total_ad_spend: Math.round(totalAdSpend * 100) / 100,
      total_fees: Math.round(totalFees * 100) / 100,
      total_refunds: Math.round(totalRefunds * 100) / 100,
      total_cogs: Math.round(totalCogs * 100) / 100,
      total_net_profit: Math.round(totalNetProfit * 100) / 100,
      contribution_margin: Math.round(contributionMargin * 100) / 100,
      avg_daily_revenue: Math.round(avgDailyRevenue * 100) / 100,
      avg_daily_spend: Math.round(avgDailySpend * 100) / 100,
      avg_daily_profit: Math.round(avgDailyProfit * 100) / 100,
    },
  });
}
