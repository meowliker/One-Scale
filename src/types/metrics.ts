export type MetricKey =
  // Core performance
  | 'spend'
  | 'revenue'
  | 'roas'
  | 'ctr'
  | 'cpc'
  | 'cpm'
  | 'impressions'
  | 'reach'
  | 'clicks'
  | 'conversions'
  | 'aov'
  | 'frequency'
  | 'cvr'
  | 'cpa'
  | 'netProfit'
  // Engagement (existing)
  | 'thumbstopRate'
  | 'hookRate'
  | 'holdRate'
  // Conversion metrics (new)
  | 'results'
  | 'costPerResult'
  | 'purchases'
  | 'purchaseValue'
  | 'appPixelResults'
  | 'appPixelPurchases'
  | 'appPixelPurchaseValue'
  | 'appPixelRoas'
  | 'appPixelCpa'
  | 'addToCart'
  | 'addToCartValue'
  | 'initiateCheckout'
  | 'leads'
  | 'costPerLead'
  // Engagement metrics (new)
  | 'linkClicks'
  | 'linkCTR'
  | 'costPerLinkClick'
  | 'postEngagement'
  | 'postReactions'
  | 'postComments'
  | 'postShares'
  | 'pageLikes'
  // Video metrics (new)
  | 'videoViews'
  | 'videoThruPlays'
  | 'videoAvgPctWatched'
  | 'costPerThruPlay'
  // Quality & ranking (new)
  | 'qualityRanking'
  | 'engagementRateRanking'
  | 'conversionRateRanking'
  // Delivery metrics (new)
  | 'uniqueClicks'
  | 'uniqueCTR'
  | 'landingPageViews'
  | 'costPerLandingPageView';

export type MetricFormat = 'currency' | 'percentage' | 'number' | 'roas' | 'multiplier' | 'ranking';

export type RankingValue = 'above_average' | 'average' | 'below_average_10' | 'below_average_20' | 'below_average_35' | 'unknown';

export type MetricCategory =
  | 'performance'
  | 'delivery'
  | 'engagement'
  | 'conversions'
  | 'financial'
  | 'video'
  | 'quality';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  shortLabel: string;
  format: MetricFormat;
  description: string;
  category: MetricCategory;
}

export interface ColumnPreset {
  id: string;
  name: string;
  columns: MetricKey[];
  isDefault: boolean;
  isCustom: boolean;
}
