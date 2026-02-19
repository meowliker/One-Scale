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
  policyInfo?: MetaPolicyInfo;
  creative: AdCreative;
  metrics: PerformanceMetrics;
}

export interface TargetingSpec {
  ageMin: number;
  ageMax: number;
  genders: ('male' | 'female' | 'all')[];
  locations: string[];
  interests: string[];
  customAudiences: string[];
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: EntityStatus;
  policyInfo?: MetaPolicyInfo;
  dailyBudget: number;
  bidAmount: number | null;
  targeting: TargetingSpec;
  startDate: string;
  endDate: string | null;
  ads: Ad[];
  metrics: PerformanceMetrics;
}

export interface Campaign {
  id: string;
  name: string;
  objective: CampaignObjective;
  status: EntityStatus;
  policyInfo?: MetaPolicyInfo;
  dailyBudget: number;
  lifetimeBudget: number | null;
  bidStrategy: BidStrategy;
  startDate: string;
  endDate: string | null;
  adSets: AdSet[];
  metrics: PerformanceMetrics;
}
