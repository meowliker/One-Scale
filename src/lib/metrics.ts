import type { MetricKey, MetricFormat } from '@/types/metrics';
import { formatCurrency, formatNumber, formatPercentage, formatRoas } from './utils';

const metricFormats: Record<MetricKey, MetricFormat> = {
  // Performance
  spend: 'currency',
  revenue: 'currency',
  roas: 'roas',
  netProfit: 'currency',
  aov: 'currency',
  // Delivery
  impressions: 'number',
  reach: 'number',
  frequency: 'multiplier',
  cpm: 'currency',
  cpc: 'currency',
  uniqueClicks: 'number',
  uniqueCTR: 'percentage',
  landingPageViews: 'number',
  costPerLandingPageView: 'currency',
  // Engagement
  clicks: 'number',
  ctr: 'percentage',
  linkClicks: 'number',
  linkCTR: 'percentage',
  costPerLinkClick: 'currency',
  postEngagement: 'number',
  postReactions: 'number',
  postComments: 'number',
  postShares: 'number',
  pageLikes: 'number',
  thumbstopRate: 'percentage',
  hookRate: 'percentage',
  holdRate: 'percentage',
  // Conversions
  results: 'number',
  costPerResult: 'currency',
  conversions: 'number',
  cvr: 'percentage',
  cpa: 'currency',
  purchases: 'number',
  purchaseValue: 'currency',
  appPixelResults: 'number',
  appPixelPurchases: 'number',
  appPixelPurchaseValue: 'currency',
  appPixelRoas: 'roas',
  appPixelCpa: 'currency',
  addToCart: 'number',
  addToCartValue: 'currency',
  initiateCheckout: 'number',
  leads: 'number',
  costPerLead: 'currency',
  // Video
  videoViews: 'number',
  videoThruPlays: 'number',
  videoAvgPctWatched: 'percentage',
  costPerThruPlay: 'currency',
  // Quality rankings
  qualityRanking: 'ranking',
  engagementRateRanking: 'ranking',
  conversionRateRanking: 'ranking',
};

/**
 * Format a ranking value (1=Above Average, 2=Average, 3+=Below Average)
 */
function formatRanking(value: number): string {
  if (value <= 0) return '-';
  if (value === 1) return 'Above Average';
  if (value === 2) return 'Average';
  if (value === 3) return 'Below Average (Bottom 35%)';
  if (value === 4) return 'Below Average (Bottom 20%)';
  if (value === 5) return 'Below Average (Bottom 10%)';
  return 'Below Average';
}

export function formatMetric(key: MetricKey, value: number): string {
  const safeValue = value ?? 0;
  const format = metricFormats[key];
  switch (format) {
    case 'currency':
      return formatCurrency(safeValue);
    case 'percentage':
      return formatPercentage(safeValue);
    case 'number':
      return formatNumber(safeValue);
    case 'roas':
      return formatRoas(safeValue);
    case 'multiplier':
      return `${safeValue.toFixed(2)}x`;
    case 'ranking':
      return formatRanking(safeValue);
    default:
      return safeValue.toString();
  }
}

export function getMetricFormat(key: MetricKey): MetricFormat {
  return metricFormats[key];
}

/**
 * Get the ranking color class for a ranking value
 */
export function getRankingColor(value: number): string {
  if (value <= 0) return 'text-gray-400';
  if (value === 1) return 'text-emerald-600';
  if (value === 2) return 'text-amber-600';
  return 'text-red-600';
}

/**
 * Safely get a metric value from a PerformanceMetrics-like object.
 * Returns 0 for metrics not present in the data (e.g., netProfit, thumbstopRate).
 */
export function getMetricValue(
  metrics: Record<string, number>,
  key: MetricKey
): number {
  return (metrics as Record<string, number>)[key] ?? 0;
}
