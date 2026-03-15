/**
 * GET /api/prism/store-health?storeId=X
 *
 * GAP 7 — Store health score (0-100).
 * Single number showing overall store performance.
 *
 * Weights:
 * - ROAS vs break-even (40%)
 * - Refund rate (20%)
 * - Chargeback rate (20%)
 * - Revenue trend (20%)
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

  const d7ago = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const d14ago = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [recent, previous] = await Promise.all([
    rest<Array<{ revenue: number; ad_spend: number; refunds: number; chargeback_loss: number; transaction_fees: number }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&and=(date.gte.${d7ago},date.lte.${yesterday})&select=revenue,ad_spend,refunds,chargeback_loss,transaction_fees`
    ).catch(() => []),
    rest<Array<{ revenue: number; ad_spend: number }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&and=(date.gte.${d14ago},date.lt.${d7ago})&select=revenue,ad_spend`
    ).catch(() => []),
  ]);

  if (recent.length === 0) {
    return NextResponse.json({ store_id: storeId, score: 0, label: 'No data', breakdown: {} });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sum = (arr: any[], key: string) => arr.reduce((s: number, r: any) => s + (Number(r[key]) || 0), 0);

  const recentRev = sum(recent, 'revenue');
  const recentSpend = sum(recent, 'ad_spend');
  const recentRefunds = sum(recent, 'refunds');
  const recentCb = sum(recent, 'chargeback_loss');
  const recentFees = sum(recent, 'transaction_fees');
  const prevRev = sum(previous, 'revenue');

  // 1. ROAS score (40% weight)
  const contributionMargin = recentRev - recentFees - recentRefunds - recentCb;
  const breakEvenRoas = contributionMargin > 0 ? recentRev / contributionMargin : 999;
  const currentRoas = recentSpend > 0 ? recentRev / recentSpend : (recentRev > 0 ? 10 : 0);

  let roasScore: number;
  if (recentSpend === 0) {
    roasScore = 70; // No ads = neutral
  } else if (currentRoas >= breakEvenRoas * 1.5) {
    roasScore = 100;
  } else if (currentRoas >= breakEvenRoas) {
    roasScore = 60 + (currentRoas / breakEvenRoas - 1) * 80;
  } else {
    roasScore = Math.max(0, (currentRoas / breakEvenRoas) * 60);
  }
  roasScore = Math.min(100, Math.max(0, roasScore));

  // 2. Refund rate score (20% weight)
  const refundRate = recentRev > 0 ? recentRefunds / recentRev * 100 : 0;
  let refundScore: number;
  if (refundRate === 0) refundScore = 100;
  else if (refundRate < 2) refundScore = 90;
  else if (refundRate < 5) refundScore = 70;
  else if (refundRate < 10) refundScore = 40;
  else refundScore = 10;

  // 3. Chargeback rate score (20% weight)
  const cbRate = recentRev > 0 ? recentCb / recentRev * 100 : 0;
  let cbScore: number;
  if (cbRate === 0) cbScore = 100;
  else if (cbRate < 0.5) cbScore = 85;
  else if (cbRate < 1) cbScore = 60;
  else if (cbRate < 2) cbScore = 30;
  else cbScore = 0;

  // 4. Revenue trend score (20% weight)
  const revChange = prevRev > 0 ? (recentRev - prevRev) / prevRev * 100 : 0;
  let trendScore: number;
  if (revChange > 20) trendScore = 100;
  else if (revChange > 5) trendScore = 80;
  else if (revChange >= -5) trendScore = 60;
  else if (revChange >= -20) trendScore = 30;
  else trendScore = 10;

  // Weighted total
  const totalScore = Math.round(
    roasScore * 0.4 + refundScore * 0.2 + cbScore * 0.2 + trendScore * 0.2
  );

  let label: string;
  if (totalScore >= 80) label = 'Excellent — scale aggressively';
  else if (totalScore >= 60) label = 'Good — maintain and optimize';
  else if (totalScore >= 40) label = 'Warning — review and improve';
  else label = 'Critical — immediate action needed';

  return NextResponse.json({
    store_id: storeId,
    score: totalScore,
    label,
    breakdown: {
      roas: { score: Math.round(roasScore), weight: '40%', current: Math.round(currentRoas * 100) / 100, break_even: Math.round(breakEvenRoas * 100) / 100 },
      refund_rate: { score: Math.round(refundScore), weight: '20%', rate: Math.round(refundRate * 10) / 10 + '%' },
      chargeback_rate: { score: Math.round(cbScore), weight: '20%', rate: Math.round(cbRate * 10) / 10 + '%' },
      revenue_trend: { score: Math.round(trendScore), weight: '20%', change: revChange > 0 ? '+' + Math.round(revChange) + '%' : Math.round(revChange) + '%' },
    },
    period: `${d7ago} to ${yesterday}`,
  });
}
