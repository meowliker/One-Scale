// src/types/creativeHub.ts

// ── Product Profiles ──

export interface ProductProfile {
  id: string;
  storeId: string;
  shopifyProductId?: string;
  productName: string;
  productImage?: string;
  adAccountId: string;
  adAccountCurrency: string;
  pageId?: string;
  instagramActorId?: string;
  pixelId?: string;
  conversionEvent: string;
  destinationUrl?: string;
  utmTemplate?: string;
  averageOrderValue?: number;
  defaultBudget: number;
  defaultDuration: number;
  defaultBidStrategy: BidStrategy;
  defaultBidAmount?: number;
  defaultRoasFloor?: number;
  defaultStructure: 'ABO' | 'CBO';
  defaultLaunchStatus: 'ACTIVE' | 'PAUSED';
  namingTemplate?: NamingTemplate;
  targetingPresets?: TargetingPreset[];
  clickupListId?: string;
  clickupSyncInterval: number;
  aiMinSpend?: number;
  aiMinImpressions: number;
  aiMinHours: number;
  aiEvalFrequency: string;
  createdAt: string;
  updatedAt: string;
}

export interface NamingTemplate {
  campaign: string;
  adset: string;
  ad: string;
}

export interface TargetingPreset {
  id: string;
  name: string;
  targeting: TargetingSpec;
}

export interface TargetingSpec {
  ageMin?: number;
  ageMax?: number;
  genders?: number[];
  geoLocations?: {
    countries?: string[];
    regions?: { key: string }[];
    cities?: { key: string; radius?: number; distanceUnit?: string }[];
  };
  customAudiences?: { id: string; name?: string }[];
  excludedCustomAudiences?: { id: string; name?: string }[];
  flexibleSpec?: {
    interests?: { id: string; name: string }[];
    behaviors?: { id: string; name: string }[];
  }[];
  publisherPlatforms?: string[];
  facebookPositions?: string[];
  instagramPositions?: string[];
  targetingAutomation?: { advantageAudience: number };
}

export type BidStrategy =
  | 'LOWEST_COST_WITHOUT_CAP'
  | 'COST_CAP'
  | 'LOWEST_COST_WITH_BID_CAP'
  | 'LOWEST_COST_WITH_MIN_ROAS';

export type CampaignLinkType = 'testing' | 'scaling' | 'retargeting';

export interface ProductCampaignLink {
  id: string;
  productProfileId: string;
  campaignId: string;
  campaignName: string;
  campaignType: CampaignLinkType;
  adAccountId: string;
  isActive: boolean;
  linkedAt: string;
}

// ── Creative Inbox ──

export type UploadStatus = 'pending' | 'uploading' | 'ready' | 'failed';
export type CreativeFormat = 'video' | 'image' | 'carousel';

export interface InboxCreative {
  id: string;
  clickupTaskId: string;
  clickupTaskName: string;
  productProfileId?: string;
  productName?: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  hook?: string;
  angle?: string;
  creator?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  uploadError?: string;
  metaAssetId?: string;
  metaAssetType?: 'IMAGE' | 'VIDEO';
  alreadyTested: boolean;
  pastTestResult?: {
    testDate: string;
    roas: number;
    status: 'winner' | 'killed' | 'inconclusive';
  };
  syncedAt: string;
}

// ── Launch Configuration ──

export type CampaignMode = 'existing' | 'new';
export type AdsetMode = 'new_adsets' | 'existing_adsets';
export type AdsetDistribution = 'all_to_one' | 'distribute' | 'one_per_adset';

export interface LaunchConfig {
  productProfileId: string;
  selectedCreativeIds: string[];
  campaignMode: CampaignMode;
  // Existing campaign
  existingCampaignId?: string;
  // Adset mode
  adsetMode: AdsetMode;
  adsetDistribution?: AdsetDistribution;
  existingAdsetAssignments?: Record<string, string[]>; // adsetId -> creativeIds
  // New campaign settings
  newCampaignName?: string;
  structure: 'ABO' | 'CBO';
  adAccountId?: string;
  pageId?: string;
  instagramActorId?: string;
  pixelId?: string;
  conversionEvent?: string;
  destinationUrl?: string;
  // Budget & Bid
  dailyBudget: number;
  testDuration: number;
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  launchStatus: 'ACTIVE' | 'PAUSED';
  // Targeting
  targetingPresetId?: string;
  customTargeting?: TargetingSpec;
  // Ad Copy
  primaryTexts: CopyItem[];
  headlines: CopyItem[];
  descriptions: CopyItem[];
  ctaType: string;
  advantageCreative: boolean;
  // Per-creative URL overrides
  perCreativeUrls?: Record<string, string>; // creativeId -> url
  usePerCreativeUrls: boolean;
  // Schedule
  launchTime: 'immediately' | 'scheduled';
  scheduledDate?: string;
  scheduledTime?: string;
  endDate?: string;
  // Attribution
  attributionWindow?: string;
  // UTM
  utmTemplate?: string;
  // Naming overrides
  adsetNameOverride?: string;
  adNameOverride?: string;
  // Multi-account
  mirrorAccounts?: MirrorAccount[];
  // AI rules
  aiMinSpend?: number;
  aiMinImpressions?: number;
  aiMinHours?: number;
  aiEvalFrequency?: string;
  autoKill?: boolean;
  notifyOnKill?: boolean;
  // Health check result
  healthCheckReport?: Record<string, unknown>;
}

export interface CopyItem {
  id: string;
  text: string;
  source: 'winner' | 'ai_generated' | 'manual';
  sourceRoas?: number;
  sourceCopyId?: string;
}

export interface MirrorAccount {
  adAccountId: string;
  adAccountName: string;
  currency: string;
  budget: number;
  selected: boolean;
}

// ── Creative Tests ──

export type TestStatus = 'launching' | 'active' | 'completed' | 'failed' | 'partial';
export type ItemTestStatus = 'testing' | 'winner' | 'killed' | 'inconclusive';
export type ReviewStatus = 'IN_REVIEW' | 'ACTIVE' | 'DISAPPROVED' | 'WITH_ISSUES';
export type LearningPhase = 'LEARNING' | 'LEARNING_LIMITED' | 'ACTIVE';
export type AIRecommendation = 'kill' | 'scale' | 'wait' | 'graduate';

export interface CreativeTest {
  id: string;
  storeId: string;
  productProfileId: string;
  productName: string;
  campaignId: string;
  campaignName: string;
  campaignMode: CampaignMode;
  adsetMode: AdsetMode;
  structure: 'ABO' | 'CBO';
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  dailyBudget: number;
  testDuration: number;
  launchStatus: string;
  status: TestStatus;
  launchedBy: string;
  launchedAt: string;
  completedAt?: string;
  totalSpend: number;
  winnerCreativeId?: string;
  items: CreativeTestItem[];
  adCopy: TestAdCopy[];
}

export interface CreativeTestItem {
  id: string;
  creativeTestId: string;
  clickupTaskId?: string;
  clickupTaskName?: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  hook?: string;
  angle?: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  metaAssetId?: string;
  metaAssetType?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  metaCreativeId?: string;
  uploadStatus: UploadStatus;
  launchStatus: 'pending' | 'created' | 'failed' | 'rolled_back';
  reviewStatus?: ReviewStatus;
  reviewFeedback?: string;
  learningPhase?: LearningPhase;
  testStatus: ItemTestStatus;
  spend: number;
  revenue: number;
  roas: number;
  cpa?: number;
  ctr?: number;
  purchases: number;
  impressions: number;
  aiRecommendation?: AIRecommendation;
  aiReasoning?: string;
}

export interface TestAdCopy {
  id: string;
  creativeTestId: string;
  copyType: 'primary_text' | 'headline' | 'description';
  copyText: string;
  source: 'winner' | 'ai_generated' | 'manual';
  sourceCopyId?: string;
  position: number;
}

// ── Copy Library ──

export interface WinningCopy {
  id: string;
  productProfileId: string;
  primaryText: string;
  headline?: string;
  description?: string;
  cta?: string;
  sourceAdId?: string;
  sourceTestId?: string;
  roas: number;
  cpa?: number;
  ctr?: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  isAiGenerated: boolean;
  createdAt: string;
}

// ── Health Checks ──

export interface HealthCheck {
  check: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
  details?: string;
  options?: { label: string; value: string }[];
}

export interface PreLaunchReport {
  checks: HealthCheck[];
  canLaunch: boolean;
  warnings: number;
  failures: number;
}

// ── Fatigue Alerts ──

export interface FatigueAlert {
  id: string;
  productProfileId: string;
  productName: string;
  adId: string;
  creativeName: string;
  campaignId: string;
  ctrTrend: number[];
  cpaTrend: number[];
  frequencyTrend: number[];
  alertType: 'fatigue' | 'declining';
  status: 'active' | 'snoozed' | 'dismissed';
  snoozedUntil?: string;
  createdAt: string;
}

// ── Store State ──

export type CreativeHubTab = 'profiles' | 'inbox' | 'active' | 'completed' | 'copy-library';
export type LaunchWizardStep = 1 | 2 | 3 | 4;
