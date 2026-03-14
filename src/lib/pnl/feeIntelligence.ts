import { rest } from '@/app/api/lib/supabase-persistence';

// Types
export interface LearnedRate {
  gateway: string;
  effective_rate: number;
  fixed_fee: number;
  sample_size: number;
  learned_at: string;
  confidence: number;
}

export interface FeeResult {
  amount: number;
  source: 'actual_transaction' | 'learned_rate' | 'user_configured' | 'cross_gateway_estimate' | 'no_data';
  confidence: number;
  effectiveRate: number;
  sampleSize?: number;
  warning?: string;
}

export interface FeeIntelligence {
  store_id: string;
  learned_rates: LearnedRate[];
  last_api_success: string | null;
  fee_variance: number;
  multi_gateway: boolean;
  computed_at: string;
}

// Linear regression: fee = amount * rate + fixed
function linearRegression(xs: number[], ys: number[]): { rate: number; fixed: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { rate: ys[0] && xs[0] ? ys[0] / xs[0] : 0, fixed: 0, r2: 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i]; sumY += ys[i]; sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i]; sumY2 += ys[i] * ys[i];
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { rate: 0, fixed: 0, r2: 0 };

  const rate = (n * sumXY - sumX * sumY) / denom;
  const fixed = (sumY - rate * sumX) / n;

  // R² goodness of fit
  const meanY = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - meanY) ** 2;
    ssRes += (ys[i] - (rate * xs[i] + fixed)) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { rate: Math.max(0, rate), fixed: Math.max(0, fixed), r2: Math.max(0, r2) };
}

// Confidence decay based on age
function computeAgeDecay(learnedAt: string, halfLifeDays: number = 30): number {
  const ageDays = (Date.now() - new Date(learnedAt).getTime()) / 86400000;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

// Learn fee rates from real transaction history
export async function learnFeeRates(storeId: string): Promise<LearnedRate[]> {
  // Fetch all transactions from shopify_transaction_fees
  const transactions = await rest<Array<{
    gateway: string;
    amount: number;
    fee: number;
    transaction_type: string;
    processed_at: string;
  }>>(
    `/shopify_transaction_fees?store_id=eq.${encodeURIComponent(storeId)}&transaction_type=eq.charge&select=gateway,amount,fee,transaction_type,processed_at&order=processed_at.desc&limit=5000`
  ).catch(() => []);

  if (transactions.length === 0) return [];

  // Group by gateway
  const byGateway: Record<string, Array<{ amount: number; fee: number }>> = {};
  for (const txn of transactions) {
    const gw = txn.gateway || 'unknown';
    if (!byGateway[gw]) byGateway[gw] = [];
    if (txn.amount > 0) {
      byGateway[gw].push({ amount: txn.amount, fee: Math.abs(txn.fee) });
    }
  }

  const learnedRates: LearnedRate[] = [];
  for (const [gateway, samples] of Object.entries(byGateway)) {
    if (samples.length < 2) continue;

    const { rate, fixed, r2 } = linearRegression(
      samples.map(s => s.amount),
      samples.map(s => s.fee)
    );

    const confidence = Math.min(0.95, (Math.log(samples.length + 1) / Math.log(100)) * Math.max(r2, 0.5));

    learnedRates.push({
      gateway,
      effective_rate: Math.round(rate * 10000) / 100, // as percentage
      fixed_fee: Math.round(fixed * 100) / 100,
      sample_size: samples.length,
      learned_at: new Date().toISOString(),
      confidence: Math.round(confidence * 100) / 100,
    });
  }

  // Compute variance across gateways
  const rates = learnedRates.map(r => r.effective_rate);
  const meanRate = rates.length > 0 ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  const variance = rates.length > 1
    ? Math.sqrt(rates.reduce((s, r) => s + (r - meanRate) ** 2, 0) / rates.length)
    : 0;

  // Persist to fee_intelligence table
  await rest('/fee_intelligence?on_conflict=store_id', {
    method: 'POST',
    headers: { 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({
      store_id: storeId,
      learned_rates: learnedRates,
      last_api_success: new Date().toISOString(),
      fee_variance: Math.round(variance * 100) / 100,
      multi_gateway: learnedRates.length > 1,
      computed_at: new Date().toISOString(),
    }),
  }).catch(() => null);

  return learnedRates;
}

// Get stored fee intelligence
export async function getFeeIntelligence(storeId: string): Promise<FeeIntelligence | null> {
  const rows = await rest<FeeIntelligence[]>(
    `/fee_intelligence?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  ).catch(() => []);
  return rows[0] || null;
}

// Calculate fees for an order — fully adaptive priority cascade
export async function calculateOrderFees(
  storeId: string,
  gateway: string,
  revenue: number,
  orderCount: number
): Promise<FeeResult> {
  // Priority 1: Learned rate for this specific gateway
  const intelligence = await getFeeIntelligence(storeId);
  const gatewayRate = intelligence?.learned_rates?.find(r => r.gateway === gateway);

  if (gatewayRate && gatewayRate.confidence > 0.3) {
    const ageDecay = computeAgeDecay(gatewayRate.learned_at);
    const adjustedConfidence = gatewayRate.confidence * ageDecay;
    const amount = (revenue * gatewayRate.effective_rate / 100) + (gatewayRate.fixed_fee * orderCount);

    return {
      amount: Math.round(amount * 100) / 100,
      source: 'learned_rate',
      confidence: Math.round(adjustedConfidence * 100) / 100,
      effectiveRate: gatewayRate.effective_rate,
      sampleSize: gatewayRate.sample_size,
      warning: adjustedConfidence < 0.5
        ? `Estimated from ${gatewayRate.sample_size} transactions — actual may vary`
        : undefined,
    };
  }

  // Priority 2: User-configured rate
  const configuredRates = await rest<Array<{
    gateway_name: string;
    fee_percentage: number;
    fee_fixed: number;
    is_active: boolean;
  }>>(
    `/pnl_payment_fees?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.true&select=gateway_name,fee_percentage,fee_fixed,is_active`
  ).catch(() => []);

  const configured = configuredRates.find(r => r.gateway_name === gateway);
  if (configured) {
    const amount = (revenue * configured.fee_percentage / 100) + (configured.fee_fixed * orderCount);
    return {
      amount: Math.round(amount * 100) / 100,
      source: 'user_configured',
      confidence: 0.7,
      effectiveRate: configured.fee_percentage,
      warning: `Using manually configured rate for ${gateway}`,
    };
  }

  // Priority 3: Cross-gateway learned rate (best available from any gateway)
  if (intelligence?.learned_rates && intelligence.learned_rates.length > 0) {
    const best = [...intelligence.learned_rates]
      .filter(r => r.confidence > 0.2)
      .sort((a, b) => b.confidence - a.confidence)[0];

    if (best) {
      const ageDecay = computeAgeDecay(best.learned_at);
      const amount = (revenue * best.effective_rate / 100) + (best.fixed_fee * orderCount);
      return {
        amount: Math.round(amount * 100) / 100,
        source: 'cross_gateway_estimate',
        confidence: Math.round(best.confidence * ageDecay * 0.5 * 100) / 100,
        effectiveRate: best.effective_rate,
        sampleSize: best.sample_size,
        warning: `Estimated using ${best.gateway} rate — configure ${gateway} in Settings for accuracy`,
      };
    }
  }

  // Priority 4: No data — $0 with clear warning
  return {
    amount: 0,
    source: 'no_data',
    confidence: 0,
    effectiveRate: 0,
    warning: `No fee data for ${gateway} — add rates in Settings → P&L`,
  };
}

// Should we re-learn fee rates? Based on store's own sync rhythm
export async function shouldRelearn(storeId: string): Promise<boolean> {
  const intel = await getFeeIntelligence(storeId);
  if (!intel) return true;

  const ageDays = (Date.now() - new Date(intel.computed_at).getTime()) / 86400000;

  // Check store's sync frequency from cron_logs
  const recentLogs = await rest<Array<{ created_at: string }>>(
    `/cron_logs?store_id=eq.${encodeURIComponent(storeId)}&cron_name=eq.sync-fees&select=created_at&order=created_at.desc&limit=10`
  ).catch(() => []);

  if (recentLogs.length < 2) {
    // No history — re-learn if older than 7 days
    return ageDays > 7;
  }

  // Compute typical sync interval from this store's history
  const intervals: number[] = [];
  for (let i = 1; i < recentLogs.length; i++) {
    intervals.push(
      (new Date(recentLogs[i - 1].created_at).getTime() - new Date(recentLogs[i].created_at).getTime()) / 86400000
    );
  }
  const medianInterval = intervals.sort((a, b) => a - b)[Math.floor(intervals.length / 2)];

  // Re-learn at 80% of typical interval
  return ageDays > medianInterval * 0.8;
}
