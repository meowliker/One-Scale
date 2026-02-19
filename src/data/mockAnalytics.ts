import type { TimeSeriesDataPoint, ShopifyFunnelData, BlendedFunnelData } from '@/types/analytics';
import { todayInTimezone, daysAgoInTimezone } from '@/lib/timezone';

// Helper to generate a date string N days ago in store timezone (YYYY-MM-DD)
function daysAgo(n: number): string {
  return daysAgoInTimezone(n);
}

// Seeded pseudo-random for reproducible data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const rand = seededRandom(42);

export const mockTimeSeries: TimeSeriesDataPoint[] = Array.from({ length: 30 }, (_, i) => {
  const dayIndex = 29 - i; // 29 days ago down to 0 (today)
  const date = daysAgo(dayIndex);

  // Add a slight weekly pattern: weekends have lower spend/higher ROAS
  const dayOfWeek = new Date(date).getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const weekendFactor = isWeekend ? 0.75 : 1.0;

  // Add an upward trend over the 30 days
  const trendFactor = 1 + (30 - dayIndex) * 0.005;

  const spend = round2(lerp(500, 1200, rand()) * weekendFactor * trendFactor);
  const roas = round2(lerp(1.5, 5.0, rand()));
  const revenue = round2(spend * roas);
  const impressions = Math.round(lerp(30000, 120000, rand()) * weekendFactor);
  const ctr = round2(lerp(1.0, 3.5, rand()));
  const clicks = Math.round(impressions * (ctr / 100));
  const cpc = round2(spend / clicks);
  const cpm = round2((spend / impressions) * 1000);
  const conversions = Math.round(lerp(15, 80, rand()) * trendFactor);
  const aov = round2(conversions > 0 ? revenue / conversions : 0);

  return {
    date,
    spend,
    revenue,
    roas,
    conversions,
    impressions,
    clicks,
    cpc,
    cpm,
    ctr,
    aov,
  };
});

// --- Hourly data generation for "today" / "yesterday" views ---

function formatHourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function getHourlyFactor(hour: number): number {
  // Night hours (0-6): very low activity
  if (hour >= 0 && hour <= 5) return 0.15 + (hour * 0.02);
  // Morning ramp-up (6-9)
  if (hour >= 6 && hour <= 9) return 0.4 + ((hour - 6) * 0.15);
  // Peak morning/midday (10-14)
  if (hour >= 10 && hour <= 14) return 0.9 + ((hour === 11 || hour === 12) ? 0.1 : 0);
  // Afternoon dip (15-17)
  if (hour >= 15 && hour <= 17) return 0.7 - ((hour - 15) * 0.05);
  // Evening peak (18-22)
  if (hour >= 18 && hour <= 21) return 0.75 + ((hour === 20 || hour === 21) ? 0.15 : 0.05);
  // Late night wind-down (22-23)
  return 0.4 - ((hour - 22) * 0.1);
}

const hourlyRand = seededRandom(99);

function generateHourlyData(dateStr: string): TimeSeriesDataPoint[] {
  // Use the last daily data point as a rough daily total baseline
  const dailySpend = lerp(600, 1000, hourlyRand());
  const dailyImpressions = Math.round(lerp(50000, 100000, hourlyRand()));

  return Array.from({ length: 24 }, (_, hour) => {
    const factor = getHourlyFactor(hour);
    const noise = 0.8 + hourlyRand() * 0.4; // 0.8 – 1.2 random noise
    const hourWeight = factor * noise;

    const spend = round2((dailySpend / 14) * hourWeight); // ~14 is sum of typical hourly factors
    const impressions = Math.round((dailyImpressions / 14) * hourWeight);
    const ctr = round2(lerp(1.2, 3.0, hourlyRand()));
    const clicks = Math.max(1, Math.round(impressions * (ctr / 100)));
    const cpc = round2(spend / clicks);
    const cpm = round2((spend / Math.max(impressions, 1)) * 1000);
    const roas = round2(lerp(1.5, 5.0, hourlyRand()));
    const revenue = round2(spend * roas);
    const conversions = Math.round(lerp(1, 8, hourlyRand()) * factor);
    const aov = round2(conversions > 0 ? revenue / conversions : 0);

    return {
      date: dateStr,
      hour,
      hourLabel: formatHourLabel(hour),
      spend,
      revenue,
      roas,
      conversions,
      impressions,
      clicks,
      cpc,
      cpm,
      ctr,
      aov,
    };
  });
}

const today = todayInTimezone();
export const mockHourlyTimeSeries: TimeSeriesDataPoint[] = generateHourlyData(today);

const yesterdayDate = daysAgoInTimezone(1);
export const mockYesterdayHourlyTimeSeries: TimeSeriesDataPoint[] = generateHourlyData(yesterdayDate);

// Blended / aggregated metrics across the full 30-day window
const totals = mockTimeSeries.reduce(
  (acc, dp) => {
    acc.spend += dp.spend;
    acc.revenue += dp.revenue;
    acc.conversions += dp.conversions;
    acc.impressions += dp.impressions;
    acc.clicks += dp.clicks;
    return acc;
  },
  { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 },
);

// NOTE: Shopify revenue / orders / AOV are NOT included in mockBlendedMetrics.
// The Summary page fetches real Shopify orders via getShopifyOrders() and computes
// these values from the actual order data, ensuring accuracy with the real store.

export const mockShopifyFunnel: ShopifyFunnelData = {
  sessions: 28450,
  productPageViews: 18200,
  addToCart: 4120,
  reachedCheckout: 2340,
  completedPurchase: 1680,
};

export const mockBlendedFunnel: BlendedFunnelData = {
  linkClicks: 12840,
  landingPageViews: 8750,
  bounceRate: 31.9,
  addToCart: 2180,
  checkoutInitiated: 1340,
  purchases: 892,
};

export const mockBlendedMetrics: Record<string, number> = {
  totalSpend: round2(totals.spend),
  totalRevenue: round2(totals.revenue),
  totalConversions: totals.conversions,
  totalImpressions: totals.impressions,
  totalClicks: totals.clicks,
  blendedRoas: round2(totals.revenue / totals.spend),
  blendedCpc: round2(totals.spend / totals.clicks),
  blendedCpm: round2((totals.spend / totals.impressions) * 1000),
  blendedCtr: round2((totals.clicks / totals.impressions) * 100),
  blendedAov: round2(totals.revenue / totals.conversions),
};
