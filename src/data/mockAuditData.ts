// ─── 360° Meta Audit — Mock Data ──────────────────────────────────────────────
// Total spend across all 8 campaigns: ~$22,911.60
// Realistic breakdowns that sum correctly to the total
// Covers all 6 Madgicx-style audit tabs:
//   1. Meta Dashboard (Overview)
//   2. Targeting Insights
//   3. Auction Insights
//   4. Geo & Demo Insights
//   5. Creative Insights
//   6. Ad Copy Insights

import { daysAgoInTimezone } from '@/lib/timezone';

// ═══════════════════════════════════════════════════════════════════════════════
// EXISTING INTERFACES (unchanged)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeviceBreakdown {
  device: string;
  spend: number;
  spendPct: number;
  roas: number;
  trend: number; // positive = up, negative = down
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
}

export interface SystemBreakdown {
  system: string;
  spend: number;
  spendPct: number;
  roas: number;
  trend: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface PlacementBreakdown {
  placement: string;
  spend: number;
  spendPct: number;
  facebookRoas: number;
  instagramRoas: number;
  overallRoas: number;
  impressions: number;
  clicks: number;
}

export interface BudgetOptComparison {
  type: 'CBO' | 'ABO';
  label: string;
  count: number;
  totalSpend: number;
  avgRoas: number;
  avgCpa: number;
  conversions: number;
  impressions: number;
}

export interface BudgetRange {
  range: string;
  count: number;
  totalSpend: number;
  avgRoas: number;
  avgCpa: number;
}

export interface ObjectiveBreakdown {
  objective: string;
  campaigns: number;
  spend: number;
  spendPct: number;
  roas: number;
  conversions: number;
  cpa: number;
  color: string;
}

export interface DeliveryOptBreakdown {
  optimization: string;
  adSets: number;
  spend: number;
  spendPct: number;
  roas: number;
  conversions: number;
  cpa: number;
  color: string;
}

export interface AuditScore {
  overall: number;
  structure: number;
  targeting: number;
  creatives: number;
  budget: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 1: Meta Dashboard (Overview)
// ═══════════════════════════════════════════════════════════════════════════════

export interface AccountOverview {
  totalCampaigns: number;
  activeCampaigns: number;
  totalAdSets: number;
  activeAdSets: number;
  totalAds: number;
  activeAds: number;
  totalSpend: number;
  totalRevenue: number;
  totalConversions: number;
  avgRoas: number;
  avgCpa: number;
  avgCpm: number;
  avgCpc: number;
  avgCtr: number;
}

export interface SpendByDay {
  date: string;
  spend: number;
  revenue: number;
  roas: number;
}

export interface TopInsight {
  type: 'positive' | 'negative' | 'neutral';
  title: string;
  description: string;
  metric: string;
  change: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 2: Targeting Insights
// ═══════════════════════════════════════════════════════════════════════════════

export interface AudienceTypeBreakdown {
  type: 'Broad' | 'Interest' | 'Lookalike' | 'Custom Audience' | 'Retargeting';
  adSets: number;
  spend: number;
  spendPct: number;
  roas: number;
  cpa: number;
  conversions: number;
  impressions: number;
  ctr: number;
  cpm: number;
  color: string;
}

export interface InterestTargeting {
  interest: string;
  adSets: number;
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
  ctr: number;
}

export interface LookalikeBreakdown {
  source: string;
  percentage: string;
  adSets: number;
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

export interface AgeGenderBreakdown {
  ageRange: '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+';
  maleSpend: number;
  maleCpa: number;
  maleRoas: number;
  femaleSpend: number;
  femaleCpa: number;
  femaleRoas: number;
  totalSpend: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 3: Auction Insights
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuctionOverlap {
  competitor: string;
  overlapRate: number;
  positionAboveRate: number;
  impressionShare: number;
  outbiddingRate: number;
}

export interface CpmTrend {
  date: string;
  cpm: number;
  impressions: number;
}

export interface FrequencyDistribution {
  range: '1' | '2' | '3' | '4-5' | '6-10' | '11+';
  impressionsPct: number;
  spendPct: number;
  conversionRate: number;
  roas: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 4: Geo & Demo Insights
// ═══════════════════════════════════════════════════════════════════════════════

export interface CountryBreakdown {
  country: string;
  countryCode: string;
  spend: number;
  spendPct: number;
  roas: number;
  cpa: number;
  conversions: number;
  impressions: number;
  ctr: number;
  cpm: number;
}

export interface RegionBreakdown {
  region: string;
  country: string;
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

export interface AgeBreakdown {
  ageRange: string;
  spend: number;
  spendPct: number;
  roas: number;
  cpa: number;
  conversions: number;
  impressions: number;
  ctr: number;
  color: string;
}

export interface GenderBreakdown {
  gender: 'Male' | 'Female' | 'Unknown';
  spend: number;
  spendPct: number;
  roas: number;
  cpa: number;
  conversions: number;
  color: string;
}

export interface LanguageBreakdown {
  language: string;
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 5: Creative Insights
// ═══════════════════════════════════════════════════════════════════════════════

export interface AdFormatBreakdown {
  format: 'Single Image' | 'Video' | 'Carousel' | 'Collection' | 'Dynamic';
  ads: number;
  spend: number;
  spendPct: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  avgWatchTime?: number; // seconds, for video formats
  color: string;
}

export interface CreativePerformanceMatrix {
  adId: string;
  adName: string;
  thumbnail: string;
  format: string;
  spend: number;
  roas: number;
  cpa: number;
  ctr: number;
  frequency: number;
  fatigueScore: number; // 0-100
  status: 'top_performer' | 'average' | 'underperformer' | 'fatigued';
}

export interface CreativeSizeBreakdown {
  size: '1080x1080' | '1080x1920' | '1200x628' | 'Other';
  ads: number;
  spend: number;
  roas: number;
  ctr: number;
}

export interface HookRateByFormat {
  format: string;
  hookRate: number;
  holdRate: number;
  completionRate: number;
}

export interface CreativeRefreshData {
  avgCreativeAge: number; // days
  adsOverFrequencyThreshold: number;
  fatigueIndex: number; // 0-100
  recommendedRefreshCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW INTERFACES — Tab 6: Ad Copy Insights
// ═══════════════════════════════════════════════════════════════════════════════

export interface HeadlineLengthPerformance {
  range: 'Short (1-5 words)' | 'Medium (6-10 words)' | 'Long (11+ words)';
  ads: number;
  spend: number;
  ctr: number;
  cpa: number;
  roas: number;
  conversions: number;
}

export interface CtaPerformance {
  cta: 'Shop Now' | 'Learn More' | 'Sign Up' | 'Get Offer' | 'Book Now' | 'Contact Us';
  ads: number;
  spend: number;
  ctr: number;
  cpa: number;
  roas: number;
  conversions: number;
  color: string;
}

export interface EmojiUsageGroup {
  ads: number;
  spend: number;
  ctr: number;
  cpa: number;
  roas: number;
}

export interface EmojiUsage {
  withEmoji: EmojiUsageGroup;
  withoutEmoji: EmojiUsageGroup;
}

export interface TopPerformingHeadline {
  headline: string;
  adId: string;
  ctr: number;
  cpa: number;
  roas: number;
  spend: number;
  impressions: number;
}

export interface PrimaryTextLength {
  range: 'Short (< 50 chars)' | 'Medium (50-125 chars)' | 'Long (125-250 chars)' | 'Very Long (250+ chars)';
  ads: number;
  ctr: number;
  cpa: number;
  roas: number;
}

export interface SentimentAnalysis {
  sentiment: 'Urgency' | 'Social Proof' | 'Benefit-Led' | 'Question' | 'Emotional' | 'Informational';
  ads: number;
  spend: number;
  ctr: number;
  roas: number;
  cpa: number;
}


// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
//  DATA EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════


// ─── Audit Score (top-level) ─────────────────────────────────────────────────
export const auditScore: AuditScore = {
  overall: 74,
  structure: 82,
  targeting: 71,
  creatives: 78,
  budget: 65,
};


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: META DASHBOARD (OVERVIEW)
// ═══════════════════════════════════════════════════════════════════════════════

export const accountOverview: AccountOverview = {
  totalCampaigns: 8,
  activeCampaigns: 6,
  totalAdSets: 14,
  activeAdSets: 11,
  totalAds: 42,
  activeAds: 34,
  totalSpend: 22_911.60,
  totalRevenue: 82_481.76,
  totalConversions: 2_193,
  avgRoas: 3.60,
  avgCpa: 10.45,
  avgCpm: 10.76,
  avgCpc: 0.52,
  avgCtr: 2.08,
};

// Last 30 days of daily spend/revenue data for sparkline charts
// Dates are dynamic relative to "today" in the store's timezone
const spendByDayValues: Omit<SpendByDay, 'date'>[] = [
  { spend: 648.20, revenue: 2_204.52, roas: 3.40 },
  { spend: 712.50, revenue: 2_636.25, roas: 3.70 },
  { spend: 695.40, revenue: 2_434.90, roas: 3.50 },
  { spend: 734.80, revenue: 2_866.72, roas: 3.90 },
  { spend: 821.30, revenue: 3_367.33, roas: 4.10 },
  { spend: 890.20, revenue: 3_738.84, roas: 4.20 },
  { spend: 856.10, revenue: 3_338.79, roas: 3.90 },
  { spend: 779.40, revenue: 2_806.84, roas: 3.60 },
  { spend: 765.30, revenue: 2_755.08, roas: 3.60 },
  { spend: 802.60, revenue: 3_050.88, roas: 3.80 },
  { spend: 748.90, revenue: 2_621.15, roas: 3.50 },
  { spend: 831.40, revenue: 3_325.60, roas: 4.00 },
  { spend: 912.70, revenue: 3_832.14, roas: 4.20 },
  { spend: 875.50, revenue: 3_414.45, roas: 3.90 },
  { spend: 698.30, revenue: 2_374.22, roas: 3.40 },
  { spend: 723.10, revenue: 2_531.85, roas: 3.50 },
  { spend: 756.80, revenue: 2_874.24, roas: 3.80 },
  { spend: 789.50, revenue: 3_079.05, roas: 3.90 },
  { spend: 814.20, revenue: 3_175.38, roas: 3.90 },
  { spend: 845.60, revenue: 3_551.52, roas: 4.20 },
  { spend: 801.30, revenue: 3_045.94, roas: 3.80 },
  { spend: 768.90, revenue: 2_691.15, roas: 3.50 },
  { spend: 742.50, revenue: 2_673.00, roas: 3.60 },
  { spend: 810.40, revenue: 3_079.52, roas: 3.80 },
  { spend: 785.20, revenue: 2_826.72, roas: 3.60 },
  { spend: 852.60, revenue: 3_495.66, roas: 4.10 },
  { spend: 901.30, revenue: 3_785.46, roas: 4.20 },
  { spend: 862.40, revenue: 3_363.36, roas: 3.90 },
  { spend: 718.60, revenue: 2_443.24, roas: 3.40 },
  { spend: 746.80, revenue: 2_613.80, roas: 3.50 },
];

export const spendByDay: SpendByDay[] = spendByDayValues.map((v, i) => ({
  date: daysAgoInTimezone(29 - i),
  ...v,
}));

// AI-generated insights for the dashboard overview
export const topInsights: TopInsight[] = [
  {
    type: 'positive',
    title: 'Mobile ROAS outperforming desktop',
    description: 'Mobile campaigns are delivering 23% higher ROAS than desktop. Consider shifting more budget to mobile placements.',
    metric: 'ROAS',
    change: 23.4,
  },
  {
    type: 'positive',
    title: 'iOS conversion rates climbing',
    description: 'iOS users show a 8.6% increase in conversion rates week-over-week. iOS continues to be the top-performing platform.',
    metric: 'Conversion Rate',
    change: 8.6,
  },
  {
    type: 'negative',
    title: 'Feed CPM rising significantly',
    description: 'Feed placement CPMs have increased 14% over the past 2 weeks, squeezing margins on lower-funnel campaigns.',
    metric: 'CPM',
    change: -14.2,
  },
  {
    type: 'negative',
    title: 'Engagement campaigns underperforming',
    description: 'Engagement objective campaigns have a 0.40x ROAS with $122.48 CPA. Consider pausing or restructuring these campaigns.',
    metric: 'ROAS',
    change: -62.0,
  },
  {
    type: 'neutral',
    title: 'CBO outperforms ABO on average',
    description: 'Campaign Budget Optimization campaigns average 3.82x ROAS vs 2.64x for Ad Set Budget. Monitor ABO campaigns for optimization opportunities.',
    metric: 'ROAS',
    change: 44.7,
  },
  {
    type: 'positive',
    title: 'Retargeting delivering strong returns',
    description: 'Retargeting audiences are achieving 5.12x ROAS at $4.82 CPA, significantly outperforming prospecting efforts.',
    metric: 'ROAS',
    change: 41.3,
  },
  {
    type: 'negative',
    title: '3 creatives showing fatigue signals',
    description: 'Three ads have exceeded the frequency threshold with declining CTR. Schedule creative refreshes to maintain performance.',
    metric: 'Frequency',
    change: -18.5,
  },
  {
    type: 'neutral',
    title: 'Video ads have highest engagement',
    description: 'Video format ads show 2.3x higher CTR than static images but have slightly higher CPA. Test more video creatives.',
    metric: 'CTR',
    change: 12.8,
  },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: TARGETING INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

// Audience type breakdown — spend sums to ~$22,911.60
export const audienceTypeBreakdown: AudienceTypeBreakdown[] = [
  {
    type: 'Broad',
    adSets: 3,
    spend: 5_498.78,
    spendPct: 24.0,
    roas: 2.85,
    cpa: 16.92,
    conversions: 325,
    impressions: 586_420,
    ctr: 1.62,
    cpm: 9.38,
    color: '#3b82f6',
  },
  {
    type: 'Interest',
    adSets: 4,
    spend: 5_956.02,
    spendPct: 26.0,
    roas: 3.48,
    cpa: 12.64,
    conversions: 471,
    impressions: 498_750,
    ctr: 2.18,
    cpm: 11.94,
    color: '#8b5cf6',
  },
  {
    type: 'Lookalike',
    adSets: 3,
    spend: 4_811.44,
    spendPct: 21.0,
    roas: 3.92,
    cpa: 10.58,
    conversions: 455,
    impressions: 412_360,
    ctr: 2.45,
    cpm: 11.67,
    color: '#10b981',
  },
  {
    type: 'Custom Audience',
    adSets: 2,
    spend: 3_436.74,
    spendPct: 15.0,
    roas: 4.25,
    cpa: 8.42,
    conversions: 408,
    impressions: 298_640,
    ctr: 2.72,
    cpm: 11.51,
    color: '#f59e0b',
  },
  {
    type: 'Retargeting',
    adSets: 2,
    spend: 3_208.62,
    spendPct: 14.0,
    roas: 5.12,
    cpa: 4.82,
    conversions: 534,
    impressions: 334_593,
    ctr: 3.38,
    cpm: 9.59,
    color: '#ef4444',
  },
];

// Interest-based targeting breakdown
export const interestTargeting: InterestTargeting[] = [
  { interest: 'Online Shopping', adSets: 2, spend: 1_842.30, roas: 4.12, cpa: 9.68, conversions: 190, ctr: 2.84 },
  { interest: 'Fitness & Wellness', adSets: 1, spend: 1_245.60, roas: 3.65, cpa: 12.22, conversions: 102, ctr: 2.31 },
  { interest: 'Fashion', adSets: 1, spend: 968.42, roas: 3.78, cpa: 11.08, conversions: 87, ctr: 2.44 },
  { interest: 'Health & Beauty', adSets: 1, spend: 842.10, roas: 3.22, cpa: 14.03, conversions: 60, ctr: 1.98 },
  { interest: 'Home Decor', adSets: 1, spend: 612.80, roas: 2.84, cpa: 17.51, conversions: 35, ctr: 1.72 },
  { interest: 'Technology', adSets: 1, spend: 324.50, roas: 2.45, cpa: 20.28, conversions: 16, ctr: 1.54 },
  { interest: 'Parenting', adSets: 1, spend: 120.30, roas: 1.90, cpa: 30.08, conversions: 4, ctr: 1.12 },
];

// Lookalike audience breakdown
export const lookalikeBreakdown: LookalikeBreakdown[] = [
  { source: 'Purchasers', percentage: '1%', adSets: 1, spend: 2_185.40, roas: 4.35, cpa: 8.92, conversions: 245 },
  { source: 'Purchasers', percentage: '2%', adSets: 1, spend: 1_412.64, roas: 3.72, cpa: 11.86, conversions: 119 },
  { source: 'Add to Cart', percentage: '1%', adSets: 1, spend: 845.20, roas: 3.58, cpa: 12.46, conversions: 68 },
  { source: 'Add to Cart', percentage: '5%', adSets: 1, spend: 218.10, roas: 2.45, cpa: 24.23, conversions: 9 },
  { source: 'Website Visitors', percentage: '2%', adSets: 1, spend: 150.10, roas: 2.14, cpa: 25.02, conversions: 6 },
];

// Age x Gender cross-tabulation — totalSpend sums to ~$22,911.60
export const ageGenderBreakdown: AgeGenderBreakdown[] = [
  { ageRange: '18-24', maleSpend: 862.40, maleCpa: 18.30, maleRoas: 2.15, femaleSpend: 1_284.60, femaleCpa: 14.52, femaleRoas: 2.80, totalSpend: 2_147.00 },
  { ageRange: '25-34', maleSpend: 2_645.80, maleCpa: 9.84, maleRoas: 4.12, femaleSpend: 4_128.40, femaleCpa: 8.26, femaleRoas: 4.55, totalSpend: 6_774.20 },
  { ageRange: '35-44', maleSpend: 2_186.50, maleCpa: 10.42, maleRoas: 3.88, femaleSpend: 3_842.30, femaleCpa: 9.18, femaleRoas: 4.20, totalSpend: 6_028.80 },
  { ageRange: '45-54', maleSpend: 1_524.30, maleCpa: 12.86, maleRoas: 3.45, femaleSpend: 2_356.10, femaleCpa: 11.24, femaleRoas: 3.72, totalSpend: 3_880.40 },
  { ageRange: '55-64', maleSpend: 842.60, maleCpa: 16.42, maleRoas: 2.68, femaleSpend: 1_568.40, femaleCpa: 14.80, femaleRoas: 2.95, totalSpend: 2_411.00 },
  { ageRange: '65+', maleSpend: 524.80, maleCpa: 22.38, maleRoas: 1.85, femaleSpend: 1_145.40, femaleCpa: 19.06, femaleRoas: 2.12, totalSpend: 1_670.20 },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: AUCTION INSIGHTS (existing + new)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Device Breakdown (existing) ─────────────────────────────────────────────
// Total: $22,911.60
export const deviceBreakdown: DeviceBreakdown[] = [
  {
    device: 'Desktop',
    spend: 7870.49,
    spendPct: 34.4,
    roas: 3.12,
    trend: 5.2,
    impressions: 642_180,
    clicks: 14_820,
    conversions: 598,
    cpa: 13.16,
  },
  {
    device: 'Mobile',
    spend: 15041.11,
    spendPct: 65.6,
    roas: 3.85,
    trend: 12.4,
    impressions: 1_488_583,
    clicks: 29_486,
    conversions: 1_595,
    cpa: 9.43,
  },
];

// ─── System (OS) Breakdown (existing) ────────────────────────────────────────
// Mobile spend ($15,041.11) split between iOS and Android
// Desktop spend ($7,870.49) excluded from OS view
export const systemBreakdown: SystemBreakdown[] = [
  {
    system: 'iOS',
    spend: 9_625.31,
    spendPct: 64.0,
    roas: 4.10,
    trend: 8.6,
    impressions: 952_693,
    clicks: 18_871,
    conversions: 1_020,
  },
  {
    system: 'Android',
    spend: 5_415.80,
    spendPct: 36.0,
    roas: 3.42,
    trend: -2.1,
    impressions: 535_890,
    clicks: 10_615,
    conversions: 575,
  },
];

// ─── Placement Type Breakdown (existing) ─────────────────────────────────────
export const placementBreakdown: PlacementBreakdown[] = [
  {
    placement: 'Feed',
    spend: 10_768.45,
    spendPct: 47.0,
    facebookRoas: 3.62,
    instagramRoas: 4.15,
    overallRoas: 3.88,
    impressions: 845_320,
    clicks: 22_150,
  },
  {
    placement: 'Stories',
    spend: 5_956.02,
    spendPct: 26.0,
    facebookRoas: 2.95,
    instagramRoas: 3.80,
    overallRoas: 3.38,
    impressions: 520_480,
    clicks: 10_890,
  },
  {
    placement: 'Reels / Video',
    spend: 4_124.09,
    spendPct: 18.0,
    facebookRoas: 2.60,
    instagramRoas: 3.45,
    overallRoas: 3.02,
    impressions: 412_600,
    clicks: 7_280,
  },
  {
    placement: 'Others',
    spend: 2_063.04,
    spendPct: 9.0,
    facebookRoas: 1.85,
    instagramRoas: 2.10,
    overallRoas: 1.98,
    impressions: 352_363,
    clicks: 3_986,
  },
];

// ─── Budget Optimization Comparison (existing) ──────────────────────────────
// CBO = 5 campaigns (camp-1, camp-2, camp-4, camp-5, camp-6)
// ABO = 3 campaigns (camp-3, camp-7, camp-8) — pretend these use ABO
export const budgetOptComparison: BudgetOptComparison[] = [
  {
    type: 'CBO',
    label: 'Campaign Budget Optimization',
    count: 5,
    totalSpend: 19_986.60,
    avgRoas: 3.82,
    avgCpa: 14.52,
    conversions: 1_284,
    impressions: 1_583_292,
  },
  {
    type: 'ABO',
    label: 'Ad Set Budget Optimization',
    count: 3,
    totalSpend: 2_925.00,
    avgRoas: 2.64,
    avgCpa: 28.87,
    conversions: 909,
    impressions: 547_471,
  },
];

// ─── CBO Budget Ranges (existing) ───────────────────────────────────────────
export const cboBudgetRanges: BudgetRange[] = [
  { range: '$0 - $50', count: 1, totalSpend: 842.30, avgRoas: 1.10, avgCpa: 56.15 },
  { range: '$50 - $100', count: 1, totalSpend: 3_245.60, avgRoas: 4.80, avgCpa: 11.39 },
  { range: '$100 - $250', count: 2, totalSpend: 4_002.00, avgRoas: 2.80, avgCpa: 26.72 },
  { range: '$250 - $500', count: 1, totalSpend: 4_832.50, avgRoas: 3.98, avgCpa: 15.49 },
  { range: '$500+', count: 1, totalSpend: 8_920.40, avgRoas: 4.77, avgCpa: 14.30 },
];

// ─── ABO Budget Ranges (existing) ───────────────────────────────────────────
export const aboBudgetRanges: BudgetRange[] = [
  { range: '$0 - $25', count: 1, totalSpend: 612.40, avgRoas: 0.40, avgCpa: 122.48 },
  { range: '$25 - $50', count: 1, totalSpend: 456.80, avgRoas: 1.50, avgCpa: 38.07 },
  { range: '$50 - $100', count: 1, totalSpend: 1_856.20, avgRoas: 4.00, avgCpa: 2.08 },
  { range: '$100 - $250', count: 0, totalSpend: 0, avgRoas: 0, avgCpa: 0 },
  { range: '$250+', count: 0, totalSpend: 0, avgRoas: 0, avgCpa: 0 },
];

// ─── Campaign Objective Analysis (existing) ─────────────────────────────────
export const objectiveBreakdown: ObjectiveBreakdown[] = [
  {
    objective: 'Conversions',
    campaigns: 3,
    spend: 16_998.50,
    spendPct: 74.2,
    roas: 4.55,
    conversions: 1_221,
    cpa: 13.92,
    color: '#7c5cfc',
  },
  {
    objective: 'Lead Generation',
    campaigns: 1,
    spend: 1_856.20,
    spendPct: 8.1,
    roas: 4.00,
    conversions: 892,
    cpa: 2.08,
    color: '#10b981',
  },
  {
    objective: 'Reach',
    campaigns: 1,
    spend: 2_145.80,
    spendPct: 9.4,
    roas: 1.60,
    conversions: 48,
    cpa: 44.70,
    color: '#3b82f6',
  },
  {
    objective: 'Traffic',
    campaigns: 1,
    spend: 456.80,
    spendPct: 2.0,
    roas: 1.50,
    conversions: 12,
    cpa: 38.07,
    color: '#f59e0b',
  },
  {
    objective: 'Video Views',
    campaigns: 1,
    spend: 842.30,
    spendPct: 3.7,
    roas: 1.10,
    conversions: 15,
    cpa: 56.15,
    color: '#06b6d4',
  },
  {
    objective: 'Engagement',
    campaigns: 1,
    spend: 612.40,
    spendPct: 2.7,
    roas: 0.40,
    conversions: 5,
    cpa: 122.48,
    color: '#f43f5e',
  },
];

// ─── Ad Delivery Optimization (existing) ────────────────────────────────────
export const deliveryOptBreakdown: DeliveryOptBreakdown[] = [
  {
    optimization: 'Conversions',
    adSets: 7,
    spend: 14_286.30,
    spendPct: 62.3,
    roas: 4.68,
    conversions: 1_048,
    cpa: 13.63,
    color: '#7c5cfc',
  },
  {
    optimization: 'Value (ROAS)',
    adSets: 2,
    spend: 3_568.20,
    spendPct: 15.6,
    roas: 4.41,
    conversions: 212,
    cpa: 16.83,
    color: '#10b981',
  },
  {
    optimization: 'Lead Generation',
    adSets: 2,
    spend: 1_856.20,
    spendPct: 8.1,
    roas: 4.00,
    conversions: 892,
    cpa: 2.08,
    color: '#3b82f6',
  },
  {
    optimization: 'Link Clicks',
    adSets: 1,
    spend: 456.80,
    spendPct: 2.0,
    roas: 1.50,
    conversions: 12,
    cpa: 38.07,
    color: '#f59e0b',
  },
  {
    optimization: 'Reach',
    adSets: 1,
    spend: 2_145.80,
    spendPct: 9.4,
    roas: 1.60,
    conversions: 48,
    cpa: 44.70,
    color: '#06b6d4',
  },
  {
    optimization: 'ThruPlay',
    adSets: 1,
    spend: 842.30,
    spendPct: 3.7,
    roas: 1.10,
    conversions: 15,
    cpa: 56.15,
    color: '#f43f5e',
  },
];

// ─── NEW: Auction Overlap (competitors) ─────────────────────────────────────
export const auctionOverlap: AuctionOverlap[] = [
  { competitor: 'BrandX Apparel', overlapRate: 72.4, positionAboveRate: 38.2, impressionShare: 24.6, outbiddingRate: 31.5 },
  { competitor: 'FitStyle Co', overlapRate: 64.8, positionAboveRate: 42.1, impressionShare: 18.3, outbiddingRate: 28.9 },
  { competitor: 'GlowUp Beauty', overlapRate: 58.2, positionAboveRate: 35.6, impressionShare: 15.8, outbiddingRate: 22.4 },
  { competitor: 'HomeNest Living', overlapRate: 45.6, positionAboveRate: 28.4, impressionShare: 12.1, outbiddingRate: 18.7 },
  { competitor: 'UrbanEdge Store', overlapRate: 38.9, positionAboveRate: 52.3, impressionShare: 9.4, outbiddingRate: 45.2 },
  { competitor: 'NaturalChoice Shop', overlapRate: 31.2, positionAboveRate: 22.8, impressionShare: 8.2, outbiddingRate: 14.6 },
];

// ─── NEW: CPM Trend (last 14 days) ──────────────────────────────────────────
// Dates are dynamic relative to "today" in the store's timezone
const cpmTrendValues: Omit<CpmTrend, 'date'>[] = [
  { cpm: 9.82, impressions: 148_420 },
  { cpm: 10.14, impressions: 152_680 },
  { cpm: 10.48, impressions: 145_210 },
  { cpm: 10.92, impressions: 138_940 },
  { cpm: 11.24, impressions: 142_350 },
  { cpm: 10.86, impressions: 155_820 },
  { cpm: 10.52, impressions: 161_440 },
  { cpm: 10.78, impressions: 158_920 },
  { cpm: 11.06, impressions: 146_380 },
  { cpm: 11.42, impressions: 139_560 },
  { cpm: 11.68, impressions: 134_880 },
  { cpm: 11.34, impressions: 141_260 },
  { cpm: 10.96, impressions: 152_480 },
  { cpm: 10.76, impressions: 162_423 },
];

export const cpmTrend: CpmTrend[] = cpmTrendValues.map((v, i) => ({
  date: daysAgoInTimezone(13 - i),
  ...v,
}));

// ─── NEW: Frequency Distribution ────────────────────────────────────────────
export const frequencyDistribution: FrequencyDistribution[] = [
  { range: '1', impressionsPct: 38.2, spendPct: 35.4, conversionRate: 3.82, roas: 4.45 },
  { range: '2', impressionsPct: 24.6, spendPct: 25.8, conversionRate: 3.24, roas: 3.92 },
  { range: '3', impressionsPct: 15.8, spendPct: 16.2, conversionRate: 2.56, roas: 3.28 },
  { range: '4-5', impressionsPct: 12.4, spendPct: 13.1, conversionRate: 1.84, roas: 2.54 },
  { range: '6-10', impressionsPct: 6.8, spendPct: 7.2, conversionRate: 0.92, roas: 1.42 },
  { range: '11+', impressionsPct: 2.2, spendPct: 2.3, conversionRate: 0.38, roas: 0.65 },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: GEO & DEMO INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

// Country breakdown — spend sums to ~$22,911.60
export const countryBreakdown: CountryBreakdown[] = [
  { country: 'United States', countryCode: 'US', spend: 11_685.92, spendPct: 51.0, roas: 3.94, cpa: 9.24, conversions: 1_265, impressions: 985_420, ctr: 2.42, cpm: 11.86 },
  { country: 'United Kingdom', countryCode: 'GB', spend: 3_207.62, spendPct: 14.0, roas: 3.62, cpa: 11.82, conversions: 271, impressions: 312_640, ctr: 2.18, cpm: 10.26 },
  { country: 'Canada', countryCode: 'CA', spend: 2_291.16, spendPct: 10.0, roas: 3.48, cpa: 12.56, conversions: 182, impressions: 224_380, ctr: 2.08, cpm: 10.21 },
  { country: 'Australia', countryCode: 'AU', spend: 1_832.93, spendPct: 8.0, roas: 3.72, cpa: 10.94, conversions: 168, impressions: 168_920, ctr: 2.28, cpm: 10.85 },
  { country: 'Germany', countryCode: 'DE', spend: 1_374.70, spendPct: 6.0, roas: 3.18, cpa: 14.32, conversions: 96, impressions: 142_560, ctr: 1.86, cpm: 9.64 },
  { country: 'France', countryCode: 'FR', spend: 916.46, spendPct: 4.0, roas: 2.92, cpa: 16.38, conversions: 56, impressions: 98_240, ctr: 1.72, cpm: 9.33 },
  { country: 'Netherlands', countryCode: 'NL', spend: 687.35, spendPct: 3.0, roas: 3.24, cpa: 13.47, conversions: 51, impressions: 72_840, ctr: 1.94, cpm: 9.44 },
  { country: 'India', countryCode: 'IN', spend: 458.23, spendPct: 2.0, roas: 2.45, cpa: 6.54, conversions: 70, impressions: 82_460, ctr: 1.48, cpm: 5.56 },
  { country: 'Brazil', countryCode: 'BR', spend: 274.94, spendPct: 1.2, roas: 2.18, cpa: 7.86, conversions: 35, impressions: 48_620, ctr: 1.32, cpm: 5.65 },
  { country: 'Japan', countryCode: 'JP', spend: 182.29, spendPct: 0.8, roas: 2.85, cpa: 18.23, conversions: 10, impressions: 14_683, ctr: 1.64, cpm: 12.42 },
];

// Top regions (states/provinces) breakdown
export const regionBreakdown: RegionBreakdown[] = [
  { region: 'California', country: 'United States', spend: 2_805.42, roas: 4.28, cpa: 8.64, conversions: 325 },
  { region: 'New York', country: 'United States', spend: 1_868.15, roas: 3.92, cpa: 9.86, conversions: 189 },
  { region: 'Texas', country: 'United States', spend: 1_402.31, roas: 3.78, cpa: 10.48, conversions: 134 },
  { region: 'Florida', country: 'United States', spend: 1_168.59, roas: 3.56, cpa: 11.24, conversions: 104 },
  { region: 'England', country: 'United Kingdom', spend: 2_245.34, roas: 3.72, cpa: 11.16, conversions: 201 },
  { region: 'Ontario', country: 'Canada', spend: 1_030.02, roas: 3.64, cpa: 11.94, conversions: 86 },
  { region: 'New South Wales', country: 'Australia', spend: 824.82, roas: 3.86, cpa: 10.31, conversions: 80 },
  { region: 'Bavaria', country: 'Germany', spend: 412.41, roas: 3.32, cpa: 13.75, conversions: 30 },
  { region: 'Ile-de-France', country: 'France', spend: 366.58, roas: 3.08, cpa: 15.27, conversions: 24 },
  { region: 'Illinois', country: 'United States', spend: 934.06, roas: 3.42, cpa: 12.02, conversions: 78 },
];

// Age breakdown — spend sums to ~$22,911.60
export const ageBreakdown: AgeBreakdown[] = [
  { ageRange: '18-24', spend: 2_147.00, spendPct: 9.4, roas: 2.48, cpa: 16.12, conversions: 133, impressions: 286_420, ctr: 1.82, color: '#7c5cfc' },
  { ageRange: '25-34', spend: 6_774.20, spendPct: 29.6, roas: 4.35, cpa: 8.96, conversions: 756, impressions: 548_380, ctr: 2.64, color: '#3b82f6' },
  { ageRange: '35-44', spend: 6_028.80, spendPct: 26.3, roas: 4.06, cpa: 9.74, conversions: 619, impressions: 486_920, ctr: 2.42, color: '#10b981' },
  { ageRange: '45-54', spend: 3_880.40, spendPct: 16.9, roas: 3.58, cpa: 11.92, conversions: 326, impressions: 342_160, ctr: 2.12, color: '#f59e0b' },
  { ageRange: '55-64', spend: 2_411.00, spendPct: 10.5, roas: 2.82, cpa: 15.46, conversions: 156, impressions: 258_440, ctr: 1.68, color: '#ef4444' },
  { ageRange: '65+', spend: 1_670.20, spendPct: 7.3, roas: 1.98, cpa: 20.37, conversions: 82, impressions: 208_443, ctr: 1.24, color: '#6b7280' },
];

// Gender breakdown — spend sums to ~$22,911.60
export const genderBreakdown: GenderBreakdown[] = [
  { gender: 'Female', spend: 13_518.84, spendPct: 59.0, roas: 3.88, cpa: 9.62, conversions: 1_405, color: '#ec4899' },
  { gender: 'Male', spend: 8_476.49, spendPct: 37.0, roas: 3.28, cpa: 12.48, conversions: 679, color: '#3b82f6' },
  { gender: 'Unknown', spend: 916.27, spendPct: 4.0, roas: 2.42, cpa: 18.33, conversions: 50, color: '#9ca3af' },
];

// Language breakdown — spend sums to ~$22,911.60
export const languageBreakdown: LanguageBreakdown[] = [
  { language: 'English', spend: 19_702.98, roas: 3.72, cpa: 10.28, conversions: 1_916 },
  { language: 'German', spend: 1_374.70, roas: 3.18, cpa: 14.32, conversions: 96 },
  { language: 'French', spend: 916.46, roas: 2.92, cpa: 16.38, conversions: 56 },
  { language: 'Portuguese', spend: 458.23, roas: 2.32, cpa: 7.14, conversions: 64 },
  { language: 'Japanese', spend: 459.23, roas: 2.78, cpa: 17.86, conversions: 26 },
];


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: CREATIVE INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

// Ad format breakdown — spend sums to ~$22,911.60
export const adFormatBreakdown: AdFormatBreakdown[] = [
  {
    format: 'Single Image',
    ads: 14,
    spend: 7_332.40,
    spendPct: 32.0,
    roas: 3.24,
    cpa: 12.86,
    ctr: 1.72,
    conversions: 570,
    color: '#3b82f6',
  },
  {
    format: 'Video',
    ads: 12,
    spend: 8_019.06,
    spendPct: 35.0,
    roas: 4.12,
    cpa: 8.94,
    ctr: 2.86,
    conversions: 897,
    avgWatchTime: 8.4,
    color: '#7c5cfc',
  },
  {
    format: 'Carousel',
    ads: 8,
    spend: 4_353.20,
    spendPct: 19.0,
    roas: 3.68,
    cpa: 10.62,
    ctr: 2.24,
    conversions: 410,
    color: '#10b981',
  },
  {
    format: 'Collection',
    ads: 5,
    spend: 2_291.16,
    spendPct: 10.0,
    roas: 3.42,
    cpa: 11.84,
    ctr: 1.96,
    conversions: 194,
    color: '#f59e0b',
  },
  {
    format: 'Dynamic',
    ads: 3,
    spend: 915.78,
    spendPct: 4.0,
    roas: 2.86,
    cpa: 14.52,
    ctr: 1.54,
    conversions: 63,
    color: '#ef4444',
  },
];

// Top 10 creatives performance matrix
export const creativePerformanceMatrix: CreativePerformanceMatrix[] = [
  {
    adId: 'ad-001',
    adName: 'Summer Collection - Hero Video',
    thumbnail: '/placeholders/creative-thumb-001.jpg',
    format: 'Video',
    spend: 3_245.80,
    roas: 5.24,
    cpa: 6.42,
    ctr: 3.86,
    frequency: 2.4,
    fatigueScore: 22,
    status: 'top_performer',
  },
  {
    adId: 'ad-002',
    adName: 'Best Sellers Carousel - Spring',
    thumbnail: '/placeholders/creative-thumb-002.jpg',
    format: 'Carousel',
    spend: 2_812.40,
    roas: 4.68,
    cpa: 7.84,
    ctr: 2.92,
    frequency: 2.8,
    fatigueScore: 34,
    status: 'top_performer',
  },
  {
    adId: 'ad-003',
    adName: 'Customer Testimonial - Sarah',
    thumbnail: '/placeholders/creative-thumb-003.jpg',
    format: 'Video',
    spend: 2_186.50,
    roas: 4.42,
    cpa: 8.12,
    ctr: 3.14,
    frequency: 3.1,
    fatigueScore: 45,
    status: 'top_performer',
  },
  {
    adId: 'ad-004',
    adName: 'New Arrivals - Lifestyle Shot',
    thumbnail: '/placeholders/creative-thumb-004.jpg',
    format: 'Single Image',
    spend: 1_942.30,
    roas: 3.86,
    cpa: 9.48,
    ctr: 2.26,
    frequency: 2.2,
    fatigueScore: 18,
    status: 'top_performer',
  },
  {
    adId: 'ad-005',
    adName: 'Flash Sale 30% Off - Banner',
    thumbnail: '/placeholders/creative-thumb-005.jpg',
    format: 'Single Image',
    spend: 1_684.20,
    roas: 3.52,
    cpa: 10.14,
    ctr: 2.08,
    frequency: 3.6,
    fatigueScore: 58,
    status: 'average',
  },
  {
    adId: 'ad-006',
    adName: 'Product Demo - Unboxing',
    thumbnail: '/placeholders/creative-thumb-006.jpg',
    format: 'Video',
    spend: 1_456.80,
    roas: 3.38,
    cpa: 10.86,
    ctr: 2.64,
    frequency: 2.6,
    fatigueScore: 32,
    status: 'average',
  },
  {
    adId: 'ad-007',
    adName: 'Collection Showcase - Grid',
    thumbnail: '/placeholders/creative-thumb-007.jpg',
    format: 'Collection',
    spend: 1_285.40,
    roas: 3.12,
    cpa: 11.68,
    ctr: 1.84,
    frequency: 2.9,
    fatigueScore: 42,
    status: 'average',
  },
  {
    adId: 'ad-008',
    adName: 'Before/After UGC Review',
    thumbnail: '/placeholders/creative-thumb-008.jpg',
    format: 'Video',
    spend: 1_042.60,
    roas: 2.64,
    cpa: 14.28,
    ctr: 1.92,
    frequency: 4.2,
    fatigueScore: 72,
    status: 'fatigued',
  },
  {
    adId: 'ad-009',
    adName: 'Generic Brand Awareness',
    thumbnail: '/placeholders/creative-thumb-009.jpg',
    format: 'Single Image',
    spend: 862.40,
    roas: 1.84,
    cpa: 21.56,
    ctr: 1.22,
    frequency: 5.1,
    fatigueScore: 85,
    status: 'fatigued',
  },
  {
    adId: 'ad-010',
    adName: 'Holiday Promo - Old Creative',
    thumbnail: '/placeholders/creative-thumb-010.jpg',
    format: 'Single Image',
    spend: 524.80,
    roas: 0.92,
    cpa: 52.48,
    ctr: 0.68,
    frequency: 6.8,
    fatigueScore: 94,
    status: 'underperformer',
  },
];

// Creative size/dimension breakdown
export const creativeSizeBreakdown: CreativeSizeBreakdown[] = [
  { size: '1080x1080', ads: 18, spend: 9_622.87, roas: 3.82, ctr: 2.34 },
  { size: '1080x1920', ads: 12, spend: 7_332.91, roas: 3.96, ctr: 2.68 },
  { size: '1200x628', ads: 8, spend: 4_124.09, roas: 3.12, ctr: 1.86 },
  { size: 'Other', ads: 4, spend: 1_831.73, roas: 2.64, ctr: 1.42 },
];

// Hook/hold/completion rates for video formats
export const hookRateByFormat: HookRateByFormat[] = [
  { format: 'UGC Testimonial', hookRate: 68.4, holdRate: 42.6, completionRate: 24.8 },
  { format: 'Product Demo', hookRate: 62.8, holdRate: 38.2, completionRate: 21.4 },
  { format: 'Lifestyle / Brand', hookRate: 55.2, holdRate: 32.8, completionRate: 18.6 },
  { format: 'Slideshow', hookRate: 48.6, holdRate: 28.4, completionRate: 15.2 },
  { format: 'Animation / Motion', hookRate: 58.4, holdRate: 35.6, completionRate: 19.8 },
];

// Creative refresh health data
export const creativeRefreshData: CreativeRefreshData = {
  avgCreativeAge: 18.4,
  adsOverFrequencyThreshold: 3,
  fatigueIndex: 38,
  recommendedRefreshCount: 5,
};


// ═══════════════════════════════════════════════════════════════════════════════
// TAB 6: AD COPY INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════

// Headline length performance
export const headlineLengthPerformance: HeadlineLengthPerformance[] = [
  { range: 'Short (1-5 words)', ads: 14, spend: 8_248.18, ctr: 2.42, cpa: 9.86, roas: 4.02, conversions: 836 },
  { range: 'Medium (6-10 words)', ads: 18, spend: 10_768.45, ctr: 2.14, cpa: 10.82, roas: 3.64, conversions: 995 },
  { range: 'Long (11+ words)', ads: 10, spend: 3_894.97, ctr: 1.68, cpa: 13.94, roas: 2.86, conversions: 279 },
];

// CTA button performance breakdown — spend sums to ~$22,911.60
export const ctaPerformance: CtaPerformance[] = [
  { cta: 'Shop Now', ads: 16, spend: 10_310.22, ctr: 2.48, cpa: 9.24, roas: 4.18, conversions: 1_116, color: '#7c5cfc' },
  { cta: 'Learn More', ads: 8, spend: 4_811.44, ctr: 1.86, cpa: 12.64, roas: 3.24, conversions: 381, color: '#3b82f6' },
  { cta: 'Sign Up', ads: 6, spend: 2_749.39, ctr: 2.12, cpa: 5.86, roas: 3.82, conversions: 469, color: '#10b981' },
  { cta: 'Get Offer', ads: 5, spend: 2_748.78, ctr: 2.68, cpa: 11.42, roas: 3.56, conversions: 241, color: '#f59e0b' },
  { cta: 'Book Now', ads: 4, spend: 1_374.70, ctr: 1.54, cpa: 16.38, roas: 2.82, conversions: 84, color: '#06b6d4' },
  { cta: 'Contact Us', ads: 3, spend: 917.07, ctr: 1.28, cpa: 22.86, roas: 1.94, conversions: 40, color: '#f43f5e' },
];

// Emoji usage A/B performance
export const emojiUsage: EmojiUsage = {
  withEmoji: {
    ads: 18,
    spend: 10_539.34,
    ctr: 2.34,
    cpa: 10.12,
    roas: 3.78,
  },
  withoutEmoji: {
    ads: 24,
    spend: 12_372.26,
    ctr: 1.92,
    cpa: 11.86,
    roas: 3.42,
  },
};

// Top performing headlines
export const topPerformingHeadlines: TopPerformingHeadline[] = [
  { headline: 'Last Chance: 40% Off Everything', adId: 'ad-h01', ctr: 3.84, cpa: 6.42, roas: 5.24, spend: 2_845.60, impressions: 245_820 },
  { headline: 'Your New Favorites Are Here', adId: 'ad-h02', ctr: 3.42, cpa: 7.28, roas: 4.86, spend: 2_412.30, impressions: 218_640 },
  { headline: 'Free Shipping Today Only', adId: 'ad-h03', ctr: 3.18, cpa: 7.92, roas: 4.52, spend: 1_968.40, impressions: 194_280 },
  { headline: 'Customers Love This Product', adId: 'ad-h04', ctr: 2.94, cpa: 8.64, roas: 4.28, spend: 1_842.20, impressions: 182_460 },
  { headline: 'Shop Our Best Sellers', adId: 'ad-h05', ctr: 2.76, cpa: 9.12, roas: 3.96, spend: 1_624.80, impressions: 168_320 },
  { headline: 'New Drop Alert', adId: 'ad-h06', ctr: 2.58, cpa: 9.86, roas: 3.72, spend: 1_456.40, impressions: 156_480 },
  { headline: 'Limited Edition Collection', adId: 'ad-h07', ctr: 2.42, cpa: 10.42, roas: 3.48, spend: 1_284.60, impressions: 142_860 },
  { headline: 'Upgrade Your Everyday Essentials', adId: 'ad-h08', ctr: 2.28, cpa: 10.94, roas: 3.28, spend: 1_124.20, impressions: 128_240 },
];

// Primary text (body copy) length performance
export const primaryTextLength: PrimaryTextLength[] = [
  { range: 'Short (< 50 chars)', ads: 8, ctr: 2.52, cpa: 10.24, roas: 3.68 },
  { range: 'Medium (50-125 chars)', ads: 16, ctr: 2.28, cpa: 9.86, roas: 3.92 },
  { range: 'Long (125-250 chars)', ads: 12, ctr: 1.96, cpa: 10.82, roas: 3.54 },
  { range: 'Very Long (250+ chars)', ads: 6, ctr: 1.62, cpa: 13.42, roas: 2.86 },
];

// Sentiment / messaging angle analysis — spend sums to ~$22,911.60
export const sentimentAnalysis: SentimentAnalysis[] = [
  { sentiment: 'Urgency', ads: 8, spend: 5_498.78, ctr: 2.68, roas: 4.24, cpa: 8.86 },
  { sentiment: 'Social Proof', ads: 7, spend: 4_582.32, ctr: 2.42, roas: 4.08, cpa: 9.42 },
  { sentiment: 'Benefit-Led', ads: 9, spend: 5_040.55, ctr: 2.24, roas: 3.72, cpa: 10.62 },
  { sentiment: 'Question', ads: 6, spend: 2_977.51, ctr: 2.12, roas: 3.28, cpa: 12.84 },
  { sentiment: 'Emotional', ads: 7, spend: 3_208.62, ctr: 1.96, roas: 3.12, cpa: 13.28 },
  { sentiment: 'Informational', ads: 5, spend: 1_603.82, ctr: 1.64, roas: 2.54, cpa: 16.82 },
];
