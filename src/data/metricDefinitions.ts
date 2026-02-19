import type { MetricDefinition, ColumnPreset, MetricKey } from '@/types/metrics';

export const allMetrics: MetricDefinition[] = [
  // === PERFORMANCE ===
  { key: 'spend', label: 'Amount Spent', shortLabel: 'Spend', format: 'currency', description: 'Total amount spent on ads', category: 'performance' },
  { key: 'revenue', label: 'Revenue', shortLabel: 'Revenue', format: 'currency', description: 'Total revenue attributed to ads', category: 'financial' },
  { key: 'roas', label: 'Return on Ad Spend', shortLabel: 'ROAS', format: 'roas', description: 'Revenue divided by ad spend', category: 'performance' },
  { key: 'netProfit', label: 'Net Profit', shortLabel: 'Profit', format: 'currency', description: 'Revenue minus all costs', category: 'financial' },
  { key: 'aov', label: 'Average Order Value', shortLabel: 'AOV', format: 'currency', description: 'Average revenue per conversion', category: 'financial' },

  // === DELIVERY ===
  { key: 'impressions', label: 'Impressions', shortLabel: 'Impr.', format: 'number', description: 'Number of times ads were displayed', category: 'delivery' },
  { key: 'reach', label: 'Reach', shortLabel: 'Reach', format: 'number', description: 'Number of unique people who saw ads', category: 'delivery' },
  { key: 'frequency', label: 'Frequency', shortLabel: 'Freq.', format: 'multiplier', description: 'Average number of times each person saw the ad', category: 'delivery' },
  { key: 'cpm', label: 'Cost per 1,000 Impressions', shortLabel: 'CPM', format: 'currency', description: 'Cost per 1,000 impressions', category: 'delivery' },
  { key: 'cpc', label: 'Cost per Click', shortLabel: 'CPC', format: 'currency', description: 'Average cost per click', category: 'delivery' },
  { key: 'uniqueClicks', label: 'Unique Clicks', shortLabel: 'Uniq. Clicks', format: 'number', description: 'Number of unique people who clicked', category: 'delivery' },
  { key: 'uniqueCTR', label: 'Unique CTR', shortLabel: 'Uniq. CTR', format: 'percentage', description: 'Unique clicks divided by reach', category: 'delivery' },
  { key: 'landingPageViews', label: 'Landing Page Views', shortLabel: 'LP Views', format: 'number', description: 'Page loads after clicking ad link', category: 'delivery' },
  { key: 'costPerLandingPageView', label: 'Cost per Landing Page View', shortLabel: 'Cost/LP', format: 'currency', description: 'Average cost per landing page view', category: 'delivery' },

  // === ENGAGEMENT ===
  { key: 'clicks', label: 'Clicks (All)', shortLabel: 'Clicks', format: 'number', description: 'Total clicks on the ad including link clicks, reactions, comments, shares', category: 'engagement' },
  { key: 'ctr', label: 'CTR (All)', shortLabel: 'CTR', format: 'percentage', description: 'Percentage of impressions that resulted in clicks', category: 'engagement' },
  { key: 'linkClicks', label: 'Link Clicks', shortLabel: 'Link Clicks', format: 'number', description: 'Clicks on ad links to destinations or experiences', category: 'engagement' },
  { key: 'linkCTR', label: 'Link CTR', shortLabel: 'Link CTR', format: 'percentage', description: 'Percentage of impressions that resulted in link clicks', category: 'engagement' },
  { key: 'costPerLinkClick', label: 'Cost per Link Click', shortLabel: 'CPC (Link)', format: 'currency', description: 'Average cost per link click', category: 'engagement' },
  { key: 'postEngagement', label: 'Post Engagement', shortLabel: 'Engagement', format: 'number', description: 'Total post reactions, comments, shares, clicks', category: 'engagement' },
  { key: 'postReactions', label: 'Post Reactions', shortLabel: 'Reactions', format: 'number', description: 'Likes, loves, and other reactions', category: 'engagement' },
  { key: 'postComments', label: 'Post Comments', shortLabel: 'Comments', format: 'number', description: 'Comments on the ad post', category: 'engagement' },
  { key: 'postShares', label: 'Post Shares', shortLabel: 'Shares', format: 'number', description: 'Shares of the ad post', category: 'engagement' },
  { key: 'pageLikes', label: 'Page Likes', shortLabel: 'Page Likes', format: 'number', description: 'New page likes from the ad', category: 'engagement' },
  { key: 'thumbstopRate', label: 'Thumb-Stop Rate', shortLabel: 'Thumb-Stop', format: 'percentage', description: 'Rate at which users stop scrolling to view the ad', category: 'engagement' },
  { key: 'hookRate', label: 'Hook Rate', shortLabel: 'Hook', format: 'percentage', description: 'Percentage of viewers who watch past 3 seconds', category: 'engagement' },
  { key: 'holdRate', label: 'Hold Rate', shortLabel: 'Hold', format: 'percentage', description: 'Percentage of viewers who watch past 15 seconds', category: 'engagement' },

  // === CONVERSIONS ===
  { key: 'results', label: 'Results', shortLabel: 'Results', format: 'number', description: 'Number of times your ad achieved an outcome based on your objective', category: 'conversions' },
  { key: 'costPerResult', label: 'Cost per Result', shortLabel: 'CPR', format: 'currency', description: 'Average cost per result from your ad', category: 'conversions' },
  { key: 'conversions', label: 'Conversions', shortLabel: 'Conv.', format: 'number', description: 'Number of conversion events', category: 'conversions' },
  { key: 'cvr', label: 'Conversion Rate', shortLabel: 'CVR', format: 'percentage', description: 'Percentage of clicks that resulted in conversions', category: 'conversions' },
  { key: 'cpa', label: 'Cost per Acquisition', shortLabel: 'CPA', format: 'currency', description: 'Average cost per conversion', category: 'conversions' },
  { key: 'purchases', label: 'Purchases', shortLabel: 'Purchases', format: 'number', description: 'Number of purchase events', category: 'conversions' },
  { key: 'purchaseValue', label: 'Purchase Value', shortLabel: 'Purch. Value', format: 'currency', description: 'Total value of purchase conversions', category: 'conversions' },
  { key: 'appPixelResults', label: 'App Pixel Results', shortLabel: 'Pixel Results', format: 'number', description: 'Internal tracked conversion events (campaign/adset/ad mapped)', category: 'conversions' },
  { key: 'appPixelPurchases', label: 'App Pixel Purchases', shortLabel: 'Pixel Purchases', format: 'number', description: 'Internal tracked purchase count', category: 'conversions' },
  { key: 'appPixelPurchaseValue', label: 'App Pixel Purchase Value', shortLabel: 'Pixel Value', format: 'currency', description: 'Internal tracked purchase revenue', category: 'financial' },
  { key: 'appPixelRoas', label: 'App Pixel ROAS', shortLabel: 'Pixel ROAS', format: 'roas', description: 'App Pixel purchase value divided by Meta spend', category: 'performance' },
  { key: 'appPixelCpa', label: 'App Pixel CPA', shortLabel: 'Pixel CPA', format: 'currency', description: 'Meta spend divided by App Pixel purchases', category: 'conversions' },
  { key: 'addToCart', label: 'Add to Cart', shortLabel: 'ATC', format: 'number', description: 'Number of add-to-cart events', category: 'conversions' },
  { key: 'addToCartValue', label: 'Add to Cart Value', shortLabel: 'ATC Value', format: 'currency', description: 'Total value of add-to-cart events', category: 'conversions' },
  { key: 'initiateCheckout', label: 'Initiate Checkout', shortLabel: 'Init. Chkout', format: 'number', description: 'Number of initiate checkout events', category: 'conversions' },
  { key: 'leads', label: 'Leads', shortLabel: 'Leads', format: 'number', description: 'Number of lead form submissions', category: 'conversions' },
  { key: 'costPerLead', label: 'Cost per Lead', shortLabel: 'CPL', format: 'currency', description: 'Average cost per lead', category: 'conversions' },

  // === VIDEO ===
  { key: 'videoViews', label: 'Video Views (3s)', shortLabel: 'Video Views', format: 'number', description: 'Number of times video played for at least 3 seconds', category: 'video' },
  { key: 'videoThruPlays', label: 'ThruPlays', shortLabel: 'ThruPlays', format: 'number', description: 'Number of times video was watched to 95% or completion', category: 'video' },
  { key: 'videoAvgPctWatched', label: 'Avg. % Video Watched', shortLabel: 'Avg % Watch', format: 'percentage', description: 'Average percentage of video watched', category: 'video' },
  { key: 'costPerThruPlay', label: 'Cost per ThruPlay', shortLabel: 'CPThruPlay', format: 'currency', description: 'Average cost per ThruPlay', category: 'video' },

  // === QUALITY & RANKING ===
  { key: 'qualityRanking', label: 'Quality Ranking', shortLabel: 'Quality', format: 'ranking', description: 'Ad quality compared to other ads competing for same audience', category: 'quality' },
  { key: 'engagementRateRanking', label: 'Engagement Rate Ranking', shortLabel: 'Eng. Rank', format: 'ranking', description: 'Expected engagement rate compared to competitors', category: 'quality' },
  { key: 'conversionRateRanking', label: 'Conversion Rate Ranking', shortLabel: 'Conv. Rank', format: 'ranking', description: 'Expected conversion rate compared to competitors', category: 'quality' },
];

export const metricsByCategory = allMetrics.reduce(
  (acc, metric) => {
    if (!acc[metric.category]) acc[metric.category] = [];
    acc[metric.category].push(metric);
    return acc;
  },
  {} as Record<string, MetricDefinition[]>
);

export function getMetricDefinition(key: MetricKey): MetricDefinition | undefined {
  return allMetrics.find((m) => m.key === key);
}

export const defaultColumnPresets: ColumnPreset[] = [
  {
    id: 'performance',
    name: 'Performance',
    columns: ['spend', 'revenue', 'roas', 'cpa', 'conversions'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'delivery',
    name: 'Delivery',
    columns: ['impressions', 'reach', 'frequency', 'cpm', 'spend'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'engagement',
    name: 'Engagement',
    columns: ['clicks', 'ctr', 'cpc', 'thumbstopRate', 'hookRate'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'conversions',
    name: 'Conversions',
    columns: ['conversions', 'cvr', 'cpa', 'revenue', 'aov'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'financial',
    name: 'Financial',
    columns: ['spend', 'revenue', 'roas', 'netProfit', 'aov'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'conversion-funnel',
    name: 'Conversion Funnel',
    columns: ['purchases', 'addToCart', 'initiateCheckout', 'costPerResult', 'purchaseValue'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'app-pixel',
    name: 'App Pixel',
    columns: ['appPixelResults', 'appPixelPurchases', 'appPixelPurchaseValue', 'appPixelRoas', 'appPixelCpa'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'video-performance',
    name: 'Video Performance',
    columns: ['videoViews', 'videoThruPlays', 'videoAvgPctWatched', 'hookRate', 'holdRate'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'link-performance',
    name: 'Link Performance',
    columns: ['linkClicks', 'linkCTR', 'costPerLinkClick', 'landingPageViews', 'uniqueClicks'],
    isDefault: true,
    isCustom: false,
  },
  {
    id: 'quality-score',
    name: 'Quality Score',
    columns: ['qualityRanking', 'engagementRateRanking', 'conversionRateRanking', 'ctr', 'cvr'],
    isDefault: true,
    isCustom: false,
  },
];
