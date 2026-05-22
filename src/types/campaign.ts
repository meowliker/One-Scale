export type CampaignObjective =
  | 'CONVERSIONS'
  | 'TRAFFIC'
  | 'REACH'
  | 'ENGAGEMENT'
  | 'APP_INSTALLS'
  | 'VIDEO_VIEWS'
  | 'LEAD_GENERATION'
  | 'BRAND_AWARENESS';

export type EntityStatus = 'ACTIVE' | 'PAUSED' | 'DELETED' | 'ARCHIVED';

export type BidStrategy =
  | 'LOWEST_COST'
  | 'COST_CAP'
  | 'BID_CAP'
  | 'MINIMUM_ROAS';

export type AdCreativeType = 'image' | 'video' | 'carousel';

export type CTAType =
  | 'SHOP_NOW'
  | 'LEARN_MORE'
  | 'SIGN_UP'
  | 'BOOK_NOW'
  | 'CONTACT_US'
  | 'DOWNLOAD'
  | 'GET_OFFER';

export interface AdCreative {
  id: string;
  type: AdCreativeType;
  headline: string;
  body: string;
  primaryTexts?: string[];
  headlines?: string[];
  descriptions?: string[];
  ctaType: CTAType;
  mediaUrl: string;
  thumbnailUrl: string;
  videoId?: string;
  destinationUrl?: string;
  urlTags?: string;
}

export interface PerformanceMetrics {
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  impressions: number;
  reach: number;
  clicks: number;
  conversions: number;
  aov: number;
  frequency: number;
  cvr: number;
  cpa: number;
  // Conversion metrics
  results: number;
  costPerResult: number;
  purchases: number;
  purchaseValue: number;
  appPixelResults: number;
  appPixelPurchases: number;
  appPixelPurchaseValue: number;
  appPixelRoas: number;
  appPixelCpa: number;
  addToCart: number;
  addToCartValue: number;
  initiateCheckout: number;
  leads: number;
  costPerLead: number;
  // Engagement metrics
  linkClicks: number;
  linkCTR: number;
  costPerLinkClick: number;
  postEngagement: number;
  postReactions: number;
  postComments: number;
  postShares: number;
  pageLikes: number;
  // Video metrics
  videoViews: number;
  videoThruPlays: number;
  videoAvgPctWatched: number;
  costPerThruPlay: number;
  // Quality rankings (stored as numbers: 1=above_average, 2=average, 3=below_average)
  qualityRanking: number;
  engagementRateRanking: number;
  conversionRateRanking: number;
  // Delivery metrics
  uniqueClicks: number;
  uniqueCTR: number;
  landingPageViews: number;
  costPerLandingPageView: number;
  // Shopify attribution (populated by /api/attribution/campaign-revenue)
  shopifyRevenue?: number;
  shopifyOrderCount?: number;
  realRoas?: number;
}

export interface MetaPolicyInfo {
  effectiveStatus?: string;
  configuredStatus?: string;
  reviewStatus?: string;
  reviewFeedback?: string;
  issuesInfo?: string[];
}

export interface Ad {
  id: string;
  adSetId: string;
  name: string;
  status: EntityStatus;
  campaign_id?: string;
  adset_id?: string;
  ad_account_id?: string;
  campaign_name?: string | null;
  campaign_buying_type?: string | null;
  campaign_daily_budget?: number | null;
  campaign_bid_strategy?: string | null;
  page_id?: string | null;
  page_name?: string | null;
  instagram_user_id?: string | null;
  instagram_username?: string | null;
  policyInfo?: MetaPolicyInfo;
  creative: AdCreative;
  metrics: PerformanceMetrics;
}

export interface TargetingSpec {
  ageMin: number;
  ageMax: number;
  genders: ('male' | 'female' | 'all')[];
  locations: string[];
  excludedLocations?: string[];
  interests: string[];
  customAudiences: string[];
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: EntityStatus;
  campaign_id?: string;
  ad_account_id?: string;
  campaign_name?: string | null;
  campaign_buying_type?: string | null;
  campaign_daily_budget?: number | null;
  campaign_bid_strategy?: string | null;
  policyInfo?: MetaPolicyInfo;
  dailyBudget: number;
  bidStrategy?: string | null;
  bidAmount: number | null;
  optimizationGoal?: string | null;
  billingEvent?: string | null;
  attributionSpec?: Array<{ event_type?: string; window_days?: number }> | null;
  promotedObject?: Record<string, unknown> | null;
  targeting: TargetingSpec;
  startDate: string;
  endDate: string | null;
  updatedTime?: string;
  ads: Ad[];
  metrics: PerformanceMetrics;
}

export interface Campaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: EntityStatus;
  ad_account_id?: string;
  buying_type?: string | null;
  policyInfo?: MetaPolicyInfo;
  dailyBudget: number;
  lifetimeBudget: number | null;
  bidStrategy: BidStrategy;
  startDate: string;
  endDate: string | null;
  updatedTime?: string;
  adSets: AdSet[];
  metrics: PerformanceMetrics;
}
