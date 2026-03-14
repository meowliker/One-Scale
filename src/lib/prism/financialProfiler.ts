/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 *
 * Financial Profiler — learns revenue, fee, refund, chargeback, and ad spend
 * baselines from each store's own 90-day history. All thresholds are store-specific.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

// ── Types ────────────────────────────────────────────────────

export interface StoreFinancialProfile {
  store_id: string;
  revenue: {
    daily_avg: number;
    daily_p25: number;
    daily_p75: number;
    daily_p95: number;
    daily_stddev: number;
    weekend_multiplier: number;
    monthly_growth_rate: number;
  };
  fees: {
    learned_rate: number;
    learned_fixed: number;
    rate_confidence: number;
  };
  refunds: {
    daily_avg: number;
    refund_rate: number;
    spike_threshold: number;
  };
  chargebacks: {
    monthly_avg: number;
    chargeback_rate: number;
    spike_threshold: number;
    risk_level: 'low' | 'medium' | 'high';
  };
  ad_spend: {
    avg_daily_spend: number;
    avg_roas: number;
    roas_p25: number;
    roas_p75: number;
    efficiency_trend: 'improving' | 'stable' | 'declining';
  };
  computed_from_days: number;
  last_computed_at: string;
}

interface SnapshotRow {
  date: string;
  revenue: number;
  order_count: number;
  ad_spend: number;
  transaction_fees: number;
  refunds: number;
  chargeback_loss: number;
}

// ── Main Builder ─────────────────────────────────────────────

export async function buildStoreFinancialProfile(storeId: string): Promise<StoreFinancialProfile> {
  const enc = (v: string) => encodeURIComponent(v);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];

  const snapshots = await rest<SnapshotRow[]>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&date=gte.${ninetyDaysAgo}&select=date,revenue,order_count,ad_spend,transaction_fees,refunds,chargeback_loss&order=date.asc`
  ).catch(() => []);

  if (snapshots.length < 7) {
    return defaultProfile(storeId);
  }

  const revenues = snapshots.map(s => Number(s.revenue) || 0).filter(r => r > 0);
  const fees = snapshots.filter(s => Number(s.transaction_fees) > 0);
  const refunds = snapshots.map(s => Number(s.refunds) || 0);
  const chargebacks = snapshots.map(s => Number(s.chargeback_loss) || 0);
  const adSpends = snapshots.map(s => Number(s.ad_spend) || 0).filter(a => a > 0);

  const totalRevenue = revenues.reduce((s, r) => s + r, 0);
  const totalRefunds = refunds.reduce((s, r) => s + r, 0);
  const totalChargebacks = chargebacks.reduce((s, c) => s + c, 0);
  const chargebackRate = totalRevenue > 0 ? totalChargebacks / totalRevenue : 0;

  // Fee rate learned from actual transactions
  const totalFees = fees.reduce((s, f) => s + (Number(f.transaction_fees) || 0), 0);
  const totalFeeRevenue = fees.reduce((s, f) => s + (Number(f.revenue) || 0), 0);
  const learnedRate = totalFeeRevenue > 0 ? totalFees / totalFeeRevenue : 0;

  // ROAS
  const roas = snapshots
    .filter(s => Number(s.ad_spend) > 0)
    .map(s => (Number(s.revenue) || 0) / Number(s.ad_spend));

  const profile: StoreFinancialProfile = {
    store_id: storeId,
    revenue: {
      daily_avg: mean(revenues),
      daily_p25: percentile(revenues, 25),
      daily_p75: percentile(revenues, 75),
      daily_p95: percentile(revenues, 95),
      daily_stddev: stddev(revenues),
      weekend_multiplier: computeWeekendMultiplier(snapshots),
      monthly_growth_rate: computeGrowthRate(snapshots),
    },
    fees: {
      learned_rate: learnedRate,
      learned_fixed: 0,
      rate_confidence: Math.min(fees.length / 30, 1),
    },
    refunds: {
      daily_avg: mean(refunds),
      refund_rate: totalRevenue > 0 ? totalRefunds / totalRevenue : 0,
      spike_threshold: mean(refunds) + 2 * stddev(refunds),
    },
    chargebacks: {
      monthly_avg: mean(chargebacks) * 30,
      chargeback_rate: chargebackRate,
      spike_threshold: mean(chargebacks) + 2 * stddev(chargebacks),
      risk_level: chargebackRate < 0.001 ? 'low' : chargebackRate < 0.005 ? 'medium' : 'high',
    },
    ad_spend: {
      avg_daily_spend: mean(adSpends),
      avg_roas: mean(roas),
      roas_p25: percentile(roas, 25),
      roas_p75: percentile(roas, 75),
      efficiency_trend: computeRoasTrend(snapshots),
    },
    computed_from_days: snapshots.length,
    last_computed_at: new Date().toISOString(),
  };

  // Persist
  await rest('/store_financial_profiles?on_conflict=store_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      store_id: storeId,
      revenue: profile.revenue,
      fees: profile.fees,
      refunds: profile.refunds,
      chargebacks: profile.chargebacks,
      ad_spend: profile.ad_spend,
      computed_from_days: profile.computed_from_days,
      last_computed_at: profile.last_computed_at,
    }),
  }).catch(() => null);

  console.log(
    `[PRISM:Profile] ${storeId}: avg_rev=${profile.revenue.daily_avg.toFixed(0)}, ` +
    `fee=${(learnedRate * 100).toFixed(2)}%, cb_risk=${profile.chargebacks.risk_level}`
  );

  return profile;
}

export async function getOrBuildFinancialProfile(storeId: string): Promise<StoreFinancialProfile> {
  const enc = (v: string) => encodeURIComponent(v);
  const rows = await rest<Array<{
    store_id: string; revenue: StoreFinancialProfile['revenue'];
    fees: StoreFinancialProfile['fees']; refunds: StoreFinancialProfile['refunds'];
    chargebacks: StoreFinancialProfile['chargebacks']; ad_spend: StoreFinancialProfile['ad_spend'];
    computed_from_days: number; last_computed_at: string;
  }>>(
    `/store_financial_profiles?store_id=eq.${enc(storeId)}&select=*&limit=1`
  ).catch(() => []);

  if (rows.length > 0) {
    const r = rows[0];
    const hoursSinceComputed = (Date.now() - new Date(r.last_computed_at).getTime()) / 3600000;
    if (hoursSinceComputed < 24) {
      return { ...r } as StoreFinancialProfile;
    }
  }

  return buildStoreFinancialProfile(storeId);
}

// ── Helpers ──────────────────────────────────────────────────

function defaultProfile(storeId: string): StoreFinancialProfile {
  return {
    store_id: storeId,
    revenue: { daily_avg: 0, daily_p25: 0, daily_p75: 0, daily_p95: 0, daily_stddev: 0, weekend_multiplier: 1, monthly_growth_rate: 0 },
    fees: { learned_rate: 0, learned_fixed: 0, rate_confidence: 0 },
    refunds: { daily_avg: 0, refund_rate: 0, spike_threshold: 0 },
    chargebacks: { monthly_avg: 0, chargeback_rate: 0, spike_threshold: 0, risk_level: 'low' },
    ad_spend: { avg_daily_spend: 0, avg_roas: 0, roas_p25: 0, roas_p75: 0, efficiency_trend: 'stable' },
    computed_from_days: 0,
    last_computed_at: new Date().toISOString(),
  };
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(mean(values.map(v => Math.pow(v - avg, 2))));
}

function computeWeekendMultiplier(snapshots: SnapshotRow[]): number {
  const weekday = snapshots.filter(s => { const d = new Date(s.date).getDay(); return d >= 1 && d <= 5; }).map(s => Number(s.revenue) || 0);
  const weekend = snapshots.filter(s => { const d = new Date(s.date).getDay(); return d === 0 || d === 6; }).map(s => Number(s.revenue) || 0);
  const avgWd = mean(weekday);
  return avgWd > 0 ? mean(weekend) / avgWd : 1;
}

function computeGrowthRate(snapshots: SnapshotRow[]): number {
  if (snapshots.length < 30) return 0;
  const half = Math.floor(snapshots.length / 2);
  const firstAvg = mean(snapshots.slice(0, half).map(s => Number(s.revenue) || 0));
  const secondAvg = mean(snapshots.slice(half).map(s => Number(s.revenue) || 0));
  return firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
}

function computeRoasTrend(snapshots: SnapshotRow[]): 'improving' | 'stable' | 'declining' {
  if (snapshots.length < 14) return 'stable';
  const recent = snapshots.slice(-14).filter(s => Number(s.ad_spend) > 0);
  const older = snapshots.slice(-30, -14).filter(s => Number(s.ad_spend) > 0);
  if (recent.length === 0 || older.length === 0) return 'stable';
  const recentRoas = mean(recent.map(s => (Number(s.revenue) || 0) / Number(s.ad_spend)));
  const olderRoas = mean(older.map(s => (Number(s.revenue) || 0) / Number(s.ad_spend)));
  const change = olderRoas > 0 ? (recentRoas - olderRoas) / olderRoas : 0;
  if (change > 0.05) return 'improving';
  if (change < -0.05) return 'declining';
  return 'stable';
}
