/**
 * PRISM Intelligence Layer — Cross-store learning + Anomaly detection + Guardrails
 *
 * Instead of connecting to the internet (security risk for finance data),
 * PRISM evolves by learning from ALL stores in the system:
 *
 * 1. Cross-Store Intelligence: aggregate learnings across stores → better defaults
 * 2. Anomaly Detection: flag when metrics shift abnormally → alert merchant
 * 3. Weight Guardrails: prevent learned weights from drifting to dangerous values
 * 4. Pattern Library: known patterns auto-applied to new stores
 *
 * Security: no external data ingestion. All intelligence comes from verified
 * internal data (orders, BT, product_config). Cannot be poisoned externally.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── 1. Cross-Store Intelligence ──────────────────────────
//
// Aggregate signal weights from all stores that have corrections.
// Stores with more corrections (more merchant feedback) are weighted higher.
// The result is a "global best" weight set that new stores start with.

interface StoreWeight {
  store_id: string;
  signal_name: string;
  weight: number;
  correct_count: number;
  wrong_count: number;
}

export async function computeGlobalWeights(): Promise<Record<string, number>> {
  const allWeights = await rest<StoreWeight[]>(
    `/store_signal_weights?select=store_id,signal_name,weight,correct_count,wrong_count`
  ).catch(() => []);

  if (allWeights.length === 0) return {};

  // Weight each store's contribution by its total corrections (more feedback = more trust)
  const signalAgg = new Map<string, { weightedSum: number; totalFeedback: number }>();

  for (const row of allWeights) {
    const feedback = (row.correct_count || 0) + (row.wrong_count || 0);
    if (feedback === 0) continue; // no feedback = no contribution

    const agg = signalAgg.get(row.signal_name) || { weightedSum: 0, totalFeedback: 0 };
    agg.weightedSum += row.weight * feedback;
    agg.totalFeedback += feedback;
    signalAgg.set(row.signal_name, agg);
  }

  const globalWeights: Record<string, number> = {};
  for (const [signal, agg] of Array.from(signalAgg)) {
    if (agg.totalFeedback > 0) {
      globalWeights[signal] = Math.round((agg.weightedSum / agg.totalFeedback) * 100) / 100;
    }
  }

  // Save to a special "global" store entry so new stores inherit it
  if (Object.keys(globalWeights).length > 0) {
    const rows = Object.entries(globalWeights).map(([signal, weight]) => ({
      store_id: '_global_',
      signal_name: signal,
      weight,
      correct_count: 0,
      wrong_count: 0,
      updated_at: new Date().toISOString(),
    }));

    await rest('/store_signal_weights?on_conflict=store_id,signal_name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    }).catch(() => null);
  }

  return globalWeights;
}

// ── 2. Anomaly Detection ─────────────────────────────────
//
// Compare today's metrics against the store's 30-day averages.
// Flag significant deviations so the merchant can investigate.

export interface Anomaly {
  metric: string;
  expected: number;
  actual: number;
  deviationPct: number;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export async function detectAnomalies(storeId: string, todayDate: string): Promise<Anomaly[]> {
  const anomalies: Anomaly[] = [];

  // Get last 30 days of snapshots
  const snapshots = await rest<Array<{
    date: string; revenue: number; ad_spend: number; transaction_fees: number;
    order_count: number; refunds: number; chargeback_loss: number;
  }>>(
    `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&date=lte.${todayDate}&select=date,revenue,ad_spend,transaction_fees,order_count,refunds,chargeback_loss&order=date.desc&limit=31`
  ).catch(() => []);

  if (snapshots.length < 7) return []; // not enough data for meaningful anomaly detection

  const today = snapshots.find(s => s.date === todayDate);
  const history = snapshots.filter(s => s.date !== todayDate).slice(0, 30);

  if (!today || history.length < 5) return [];

  // Calculate averages and standard deviations
  const metrics: Array<{ key: string; label: string; todayVal: number }> = [
    { key: 'revenue', label: 'Revenue', todayVal: today.revenue },
    { key: 'ad_spend', label: 'Ad Spend', todayVal: today.ad_spend },
    { key: 'order_count', label: 'Orders', todayVal: today.order_count },
    { key: 'transaction_fees', label: 'Fees', todayVal: today.transaction_fees },
    { key: 'refunds', label: 'Refunds', todayVal: today.refunds },
    { key: 'chargeback_loss', label: 'Chargeback Loss', todayVal: today.chargeback_loss },
  ];

  for (const metric of metrics) {
    const values = history.map(s => Number((s as Record<string, unknown>)[metric.key]) || 0);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);

    if (avg === 0 && metric.todayVal === 0) continue; // both zero = normal
    if (avg === 0 && metric.todayVal > 0) {
      anomalies.push({
        metric: metric.label, expected: 0, actual: metric.todayVal,
        deviationPct: 100,
        severity: 'warning',
        message: `${metric.label} appeared today ($${metric.todayVal.toFixed(2)}) but was $0 in recent history`,
      });
      continue;
    }

    const deviation = Math.abs(metric.todayVal - avg);
    const deviationPct = (deviation / avg) * 100;
    const zScore = stdDev > 0 ? deviation / stdDev : 0;

    // Only flag significant deviations (>2 standard deviations or >50% change)
    if (zScore < 2 && deviationPct < 50) continue;

    let severity: Anomaly['severity'] = 'info';
    if (zScore >= 3 || deviationPct >= 80) severity = 'critical';
    else if (zScore >= 2 || deviationPct >= 50) severity = 'warning';

    const direction = metric.todayVal > avg ? 'higher' : 'lower';

    anomalies.push({
      metric: metric.label,
      expected: Math.round(avg * 100) / 100,
      actual: metric.todayVal,
      deviationPct: Math.round(deviationPct),
      severity,
      message: `${metric.label} is ${deviationPct.toFixed(0)}% ${direction} than 30-day average ($${avg.toFixed(2)} → $${metric.todayVal.toFixed(2)})`,
    });
  }

  // Save anomalies to prism_alerts
  for (const anomaly of anomalies.filter(a => a.severity !== 'info')) {
    await rest('/prism_alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        alert_type: 'anomaly_' + anomaly.metric.toLowerCase().replace(/\s+/g, '_'),
        severity: anomaly.severity,
        message: anomaly.message,
        details: { expected: anomaly.expected, actual: anomaly.actual, deviation_pct: anomaly.deviationPct },
      }),
    }).catch(() => null);
  }

  return anomalies;
}

// ── 3. Weight Guardrails ─────────────────────────────────
//
// Prevent learned weights from drifting to extreme values.
// If a weight strays too far from the global average, clip it back.
// This prevents a single bad correction from corrupting the model.

export async function enforceWeightGuardrails(storeId: string): Promise<number> {
  const globalWeights = await computeGlobalWeights();
  if (Object.keys(globalWeights).length === 0) return 0;

  const storeWeights = await rest<Array<{ signal_name: string; weight: number }>>(
    `/store_signal_weights?store_id=eq.${enc(storeId)}&select=signal_name,weight`
  ).catch(() => []);

  let clipped = 0;

  for (const row of storeWeights) {
    const globalVal = globalWeights[row.signal_name];
    if (globalVal === undefined) continue;

    // Allow 3x deviation from global average, clip beyond that
    const maxAllowed = globalVal * 3;
    const minAllowed = globalVal / 3;

    if (row.weight > maxAllowed || row.weight < minAllowed) {
      const clippedWeight = Math.max(minAllowed, Math.min(maxAllowed, row.weight));
      await rest(`/store_signal_weights?store_id=eq.${enc(storeId)}&signal_name=eq.${enc(row.signal_name)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ weight: clippedWeight, updated_at: new Date().toISOString() }),
      }).catch(() => null);
      clipped++;
    }
  }

  if (clipped > 0) {
    console.log(`[PRISM:Guardrails] ${storeId}: clipped ${clipped} weights back to safe range`);
  }

  return clipped;
}

// ── 4. Pattern Library ───────────────────────────────────
//
// Known e-commerce patterns that PRISM auto-detects and applies.
// These are hardcoded from domain expertise, not from internet.
// They serve as a starting point for new stores before self-learning kicks in.

export const KNOWN_PATTERNS = {
  // Store model signatures
  free_plus_shipping: {
    description: 'Free entry product + paid upsells (funnel model)',
    signals: { freeItemRate: { min: 0.25 }, avgOrderValue: { max: 50 } },
    defaultWeights: { price_threshold: 15, alone_rate: 35, revenue_share: 20 },
  },
  high_ticket: {
    description: 'High-value products ($200+)',
    signals: { avgOrderValue: { min: 200 } },
    defaultWeights: { price_threshold: 30, alone_rate: 25, revenue_share: 30 },
  },
  subscription: {
    description: 'Recurring subscription products',
    signals: { subscriptionRate: { min: 0.3 } },
    defaultWeights: { price_threshold: 20, alone_rate: 20, first_purchase: 25 },
  },

  // Upsell detection patterns
  upsell_title_keywords: [
    'upgrade', 'upsell', 'bump', 'one time offer', 'oto',
    'lifetime access', 'bundle deal', 'impulse', 'add-on',
    'downsell', 'cross-sell', 'bonus', 'vip',
  ],

  // Product lifecycle patterns
  seasonal_product: { description: 'Active only during specific periods' },
  evergreen_product: { description: 'Active year-round, consistent orders' },
  declining_product: { description: 'Order rate decreasing over time' },
  new_launch: { description: 'Recently added, order rate increasing' },
} as const;

// ── 5. Daily Intelligence Run ────────────────────────────
//
// Called during auto-sync. Runs all intelligence layers.

export async function runPrismIntelligence(storeId: string, todayDate: string): Promise<{
  anomalies: Anomaly[];
  guardrailsClipped: number;
}> {
  // Run anomaly detection
  const anomalies = await detectAnomalies(storeId, todayDate);

  // Enforce weight guardrails
  const guardrailsClipped = await enforceWeightGuardrails(storeId);

  // Compute global weights (cross-store learning)
  await computeGlobalWeights();

  if (anomalies.length > 0 || guardrailsClipped > 0) {
    console.log(`[PRISM:Intelligence] ${storeId}: ${anomalies.length} anomalies, ${guardrailsClipped} weights clipped`);
  }

  return { anomalies, guardrailsClipped };
}
