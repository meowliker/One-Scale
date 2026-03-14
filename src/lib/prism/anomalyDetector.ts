/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 *
 * Anomaly Detector — flags deviations from a store's own financial baseline.
 * All thresholds are learned from the store's 90-day history.
 */

import type { StoreFinancialProfile } from './financialProfiler';

export interface Anomaly {
  metric: string;
  severity: 'info' | 'warning' | 'critical';
  actual: number;
  expected: number;
  deviation: number;
  message: string;
  action: string | null;
}

interface PnLInput {
  revenue: number;
  fees: number;
  refunds: number;
  chargebackLoss: number;
  adSpend: number;
  orderCount?: number;
}

export function detectFinancialAnomalies(
  pnl: PnLInput,
  profile: StoreFinancialProfile,
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (profile.computed_from_days < 7) return anomalies;

  // Revenue anomaly
  if (profile.revenue.daily_stddev > 0) {
    const dev = (pnl.revenue - profile.revenue.daily_avg) / profile.revenue.daily_stddev;
    if (dev < -2) {
      anomalies.push({
        metric: 'revenue', severity: dev < -3 ? 'critical' : 'warning',
        actual: pnl.revenue, expected: profile.revenue.daily_avg, deviation: dev,
        message: `Revenue is ${Math.abs(dev).toFixed(1)}σ below your average`,
        action: 'Check if ads are running and Shopify store is accessible',
      });
    } else if (dev > 3) {
      anomalies.push({
        metric: 'revenue', severity: 'info',
        actual: pnl.revenue, expected: profile.revenue.daily_avg, deviation: dev,
        message: `Revenue is ${dev.toFixed(1)}σ above your average — great day!`,
        action: null,
      });
    }
  }

  // Fee anomaly
  if (profile.fees.learned_rate > 0 && pnl.revenue > 0) {
    const expectedFees = pnl.revenue * profile.fees.learned_rate + profile.fees.learned_fixed * (pnl.orderCount ?? 0);
    const feeRatio = expectedFees > 0 ? pnl.fees / expectedFees : 0;
    if (feeRatio > 1.2) {
      anomalies.push({
        metric: 'fees', severity: 'warning',
        actual: pnl.fees, expected: expectedFees, deviation: feeRatio,
        message: `Fees are ${((feeRatio - 1) * 100).toFixed(1)}% higher than expected`,
        action: 'Check if payment gateway changed or new fee structure applied',
      });
    }
  }

  // Refund spike
  if (profile.refunds.spike_threshold > 0 && pnl.refunds > profile.refunds.spike_threshold) {
    const dev = profile.refunds.daily_avg > 0 ? (pnl.refunds - profile.refunds.daily_avg) / profile.refunds.daily_avg : 0;
    anomalies.push({
      metric: 'refunds', severity: pnl.refunds > profile.refunds.spike_threshold * 2 ? 'critical' : 'warning',
      actual: pnl.refunds, expected: profile.refunds.daily_avg, deviation: dev,
      message: `Refunds are ${(dev * 100).toFixed(0)}% above your normal level`,
      action: 'Check product quality issues or customer service tickets',
    });
  }

  // Chargeback spike
  if (profile.chargebacks.spike_threshold > 0 && pnl.chargebackLoss > profile.chargebacks.spike_threshold) {
    anomalies.push({
      metric: 'chargebacks', severity: 'critical',
      actual: pnl.chargebackLoss, expected: profile.chargebacks.monthly_avg / 30, deviation: 0,
      message: `Chargeback spike — $${pnl.chargebackLoss.toFixed(2)} lost today`,
      action: 'Review recent orders for fraud patterns',
    });
  }

  // Chargeback risk
  if (profile.chargebacks.risk_level === 'high') {
    anomalies.push({
      metric: 'chargeback_risk', severity: 'critical',
      actual: profile.chargebacks.chargeback_rate * 100, expected: 0.1, deviation: 0,
      message: `Chargeback rate ${(profile.chargebacks.chargeback_rate * 100).toFixed(2)}% — Shopify flags above 0.5%`,
      action: 'Review and dispute all chargebacks immediately',
    });
  }

  // ROAS declining
  if (profile.ad_spend.efficiency_trend === 'declining' && profile.ad_spend.avg_daily_spend > 100) {
    anomalies.push({
      metric: 'roas', severity: 'warning',
      actual: pnl.adSpend > 0 ? pnl.revenue / pnl.adSpend : 0,
      expected: profile.ad_spend.avg_roas, deviation: -1,
      message: 'Ad efficiency declining over last 14 days',
      action: 'Review ad creative performance and audience targeting',
    });
  }

  return anomalies;
}
