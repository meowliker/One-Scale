import type { MetricKey } from './metrics';

export interface TimeSeriesDataPoint {
  date: string;
  hour?: number;       // 0-23, present for hourly data
  hourLabel?: string;  // "12am", "1pm", etc.
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  aov: number;
}

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export interface DateRange {
  start: Date;
  end: Date;
  preset?: DateRangePreset;
}

export interface ComparisonData {
  current: TimeSeriesDataPoint[];
  previous: TimeSeriesDataPoint[];
  percentChange: Partial<Record<MetricKey, number>>;
}

export interface ShopifyFunnelData {
  sessions: number;
  productPageViews: number;
  addToCart: number;
  reachedCheckout: number;
  completedPurchase: number;
}

export interface BlendedFunnelData {
  linkClicks: number;
  landingPageViews: number;
  bounceRate: number;
  addToCart: number;
  checkoutInitiated: number;
  purchases: number;
}
