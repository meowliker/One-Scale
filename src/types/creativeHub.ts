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
  pageName?: string;
  instagramActorId?: string;
  instagramUsername?: string;
  pixelId?: string;
  pixelName?: string;
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
  clickupListName?: string;
  clickupSyncInterval: number;
  aiMinSpend?: number;
  aiMinImpressions: number;
  aiMinHours: number;
  aiEvalFrequency: string;
  createdAt: string;
  updatedAt: string;
  // Populated by the profiles API (joined from product_campaign_links table)
  campaignLinks?: ProductCampaignLink[];
  // Populated by the profiles API from Meta campaign snapshot status
  activeCampaignCount?: number;
  inactiveCampaignCount?: number;
}

export interface ClickUpProfileStatusCounts {
  ready: number;
  testing: number;
  launched: number;
  winners: number;
  total: number;
  statusBreakdown?: Record<string, number>;
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
  excludedGeoLocations?: {
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
  | 'LOWEST_COST'
  | 'COST_CAP'
  | 'LOWEST_COST_WITH_BID_CAP'
  | 'BID_CAP'
  | 'LOWEST_COST_WITH_MIN_ROAS'
  | 'MINIMUM_ROAS';

export type CampaignLinkType = 'testing' | 'scaling' | 'retargeting' | 'account';

export interface ProductCampaignLink {
  id: string;
  productProfileId: string;
  campaignId: string;
  campaignName: string;
  campaignType: CampaignLinkType;
  adAccountId: string;
  pageId?: string;
  pageName?: string;
  pixelId?: string;
  pixelName?: string;
  instagramActorId?: string;
  instagramUsername?: string;
  bmId?: string;
  bmName?: string;
  isActive: boolean;
  linkedAt: string;
  /** Real Meta effective_status (e.g. 'ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED') */
  effectiveStatus?: string;
  /** Campaign-level daily budget in dollars (> 0 means CBO) */
  campaignDailyBudget?: number;
  /** Campaign-level lifetime budget in dollars (> 0 means CBO) */
  campaignLifetimeBudget?: number | null;
  /** Campaign-level bid strategy */
  campaignBidStrategy?: string;
}

// ── Creative Inbox ──

export type UploadStatus = 'pending' | 'uploading' | 'ready' | 'failed' | 'no_link';
export type CreativeFormat = 'video' | 'image' | 'carousel';
export type DriveSourceType = 'file' | 'folder' | 'folder_item';
export type CreativeSourceType = 'clickup_task' | 'drive_asset' | 'clickup_attachment';

export interface ClickUpFieldValue {
  id: string;
  name: string;
  type: string;
  value: string;
  hasValue?: boolean;
  color?: string;
}

export interface ClickUpTaskAssignee {
  id?: string;
  username: string;
  email?: string;
  initials?: string;
  color?: string;
  profilePicture?: string;
}

export interface ClickUpTaskContext {
  status?: {
    name?: string;
    color?: string;
  };
  creator?: ClickUpTaskAssignee;
  assignees?: ClickUpTaskAssignee[];
  watchers?: ClickUpTaskAssignee[];
  dueDate?: string;
  startDate?: string;
  dateClosed?: string;
  dateDone?: string;
  priority?: {
    label?: string;
    color?: string;
    orderindex?: string;
  };
  archived?: boolean;
  parentTaskId?: string;
  points?: number;
  timeEstimate?: number;
  folder?: {
    id?: string;
    name?: string;
  };
  space?: {
    id?: string;
    name?: string;
  };
  list?: {
    id?: string;
    name?: string;
  };
}

export interface CreativeAiTagSet {
  awarenessStage: string;
  targetAge: string;
  persona: string;
  gender: string;
  angle: string;
  confidence?: string;
  rationale?: string;
  source: 'gemini' | 'fallback';
}

export interface InboxCreative {
  id: string;
  clickupTaskId: string;
  clickupTaskName: string;
  clickupTaskStatus?: string;
  clickupTaskUrl?: string;
  clickupCreatedAt?: string;
  clickupUpdatedAt?: string;
  clickupListId?: string;
  clickupListName?: string;
  clickupDescription?: string;
  clickupTags?: string[];
  clickupCustomFields?: ClickUpFieldValue[];
  clickupTaskContext?: ClickUpTaskContext;
  productProfileId?: string;
  productName?: string;
  creativeName: string;
  creativeFormat: CreativeFormat;
  hook?: string;
  angle?: string;
  creator?: string;
  driveUrl?: string;
  drivePreviewUrl?: string;
  driveContentUrl?: string;
  driveDownloadUrl?: string;
  driveFileId?: string;
  driveFolderId?: string;
  driveCreatedAt?: string;
  driveModifiedAt?: string;
  driveMimeType?: string;
  driveParentFolderName?: string;
  driveParentFolderUrl?: string;
  driveSourceType?: DriveSourceType;
  clickupAttachmentId?: string;
  clickupAttachmentUrl?: string;
  clickupAttachmentName?: string;
  clickupAttachmentMimeType?: string;
  clickupAttachmentSize?: number;
  sourceType?: CreativeSourceType;
  sourceParentId?: string;
  uploadedAt?: string;
  thumbnailUrl?: string;
  uploadStatus: UploadStatus;
  uploadProgress: number;
  uploadError?: string;
  metaAssetId?: string;
  metaAssetType?: 'IMAGE' | 'VIDEO';
  clickupAssignees?: ClickUpTaskAssignee[];
  alreadyTested: boolean;
  pastTestResult?: {
    testDate: string;
    roas: number;
    status: 'winner' | 'killed' | 'inconclusive';
  };
  aiTags?: CreativeAiTagSet;
  syncedAt: string;
}

export interface CreativeHubInboxCacheProfileMeta {
  productProfileId: string;
  creativeCount: number;
  lastSyncedAt: string | null;
}

export interface CreativeHubInboxCacheMeta {
  source: 'cache' | 'live';
  lastSyncedAt: string | null;
  profiles: CreativeHubInboxCacheProfileMeta[];
}

// ── Launch Configuration ──

export type CampaignMode = 'existing' | 'new';
export type AdsetMode = 'new_adsets' | 'existing_adsets';
export type AdsetDistribution = 'all_to_one' | 'distribute' | 'one_per_adset';

export interface LaunchConfig {
  productProfileId: string;
  selectedCreativeIds: string[];
  selectedCreativeSnapshots?: InboxCreative[];
  campaignMode: CampaignMode;
  // Existing campaign
  existingCampaignId?: string;
  // Adset mode
  adsetMode: AdsetMode;
  adsetDistribution?: AdsetDistribution;
  existingAdsetAssignments?: Record<string, string[]>; // adsetId -> creativeIds
  existingAdsetAdGroups?: Record<string, CreativeAdGroup[]>; // adsetId -> ad groups with media creativeIds
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
  adSetDailyMinSpend?: number;
  adSetDailyMaxSpend?: number;
  testDuration: number;
  useTestDuration?: boolean;
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  optimizationGoal?: string;
  billingEvent?: string;
  launchStatus: 'ACTIVE' | 'PAUSED';
  adLaunchStatus: 'ACTIVE' | 'PAUSED';
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
  videoThumbnails?: Record<string, VideoThumbnailSelection>;
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
  aiAutopilotEnabled?: boolean;
  aiAutopilotRequiresConfirmation?: boolean;
  // Health check result
  healthCheckReport?: PreLaunchReport;
  // Launch Center
  batches?: CreativeBatch[];
  batchStrategy?: BatchStrategy;
  creativesPerBatch?: number;
  launchMode?: LaunchCenterTab;
}

export interface VideoThumbnailSelection {
  source: 'video' | 'manual';
  imageHash?: string;
  imageUrl?: string;
  fileName?: string;
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

export type TestStatus =
  | 'launching'
  | 'scheduled'
  | 'active'
  | 'completed'
  | 'failed'
  | 'partial';
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

// ── Winning Ads ──

export interface WinningCopyMetrics {
  spend: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  cpa: number;
  purchases: number;
  impressions: number;
  clicks: number;
}

export interface WinningCopyRankedItem {
  rank: number;
  text: string;
  label?: string;
  usageCount: number;
  adCount: number;
  totalSpend: number;
  totalRevenue: number;
  totalPurchases: number;
  totalImpressions: number;
  totalClicks: number;
  blendedScore: number;
  metrics: WinningCopyMetrics;
  examples?: string[];
}

export interface WinningPT {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  combinedRevenue: number;
  purchases: number;
  adCount: number;
  avgCtr: number;
  avgCpa: number;
  usageCount?: number;
  totalImpressions?: number;
  totalClicks?: number;
  avgCpc?: number;
  avgCpm?: number;
  blendedScore?: number;
  metrics?: WinningCopyMetrics;
  label?: string;
  examples?: string[];
}

export interface WinningHeadline {
  text: string;
  combinedRoas: number;
  combinedSpend: number;
  purchases: number;
  adCount: number;
  usageCount?: number;
  totalImpressions?: number;
  totalClicks?: number;
  avgCtr?: number;
  avgCpa?: number;
  avgCpc?: number;
  avgCpm?: number;
  blendedScore?: number;
  metrics?: WinningCopyMetrics;
  label?: string;
  examples?: string[];
}

export type WinningDescription = WinningCopyRankedItem;

export interface WinningCTA extends WinningCopyRankedItem {
  ctaType: string;
}

export interface WinningAd {
  id: string;
  name: string;
  creative: {
    headline: string;
    body: string;
    description?: string;
    ctaType: string;
    thumbnailUrl?: string;
    destinationUrl?: string;
    type?: string;
  };
  metrics: {
    spend: number;
    revenue: number;
    roas: number;
    cpa: number;
    cpm: number;
    cpc: number;
    ctr: number;
    impressions: number;
    clicks: number;
    conversions: number;
  };
  allPTs?: string[];
  allHeadlines?: string[];
}

export interface WinningAdsData {
  uniquePTs: WinningPT[];
  uniqueHeadlines: WinningHeadline[];
  winningAds: WinningAd[];
  winningPrimaryTexts?: WinningCopyRankedItem[];
  winningHeadlines?: WinningCopyRankedItem[];
  winningDescriptions?: WinningDescription[];
  winningCTAs?: WinningCTA[];
  copyIntelligence?: {
    primaryTexts: WinningCopyRankedItem[];
    headlines: WinningCopyRankedItem[];
    descriptions: WinningDescription[];
    ctas: WinningCTA[];
    defaultRanking: 'blended_score' | 'roas' | 'spend';
  };
  autoFill: {
    primaryTexts: string[];
    headlines: string[];
    cta: string;
    descriptions?: string[];
  };
  bestCTA: { type: string; usagePercent: number; blendedScore?: number };
  stats: {
    totalAds: number;
    totalLinkedCampaigns: number;
    totalSpend?: number;
    totalPurchases?: number;
    totalImpressions?: number;
    totalClicks?: number;
    dateRange?: string | null;
  };
}

// ── Copy Rewrite Suggestions ──

export interface CopyRewriteTargeting {
  persona: string;
  ageGroup: string;
  gender: string;
  awarenessStage: string;
  angle: string;
  rationale?: string;
}

export interface CopyRewriteSuggestion {
  id: string;
  title: string;
  summary: string;
  confidence: number;
  intent: 'control_plus_challenger' | 'persona_match' | 'new_angle' | 'offer_shift';
  targeting: CopyRewriteTargeting;
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  bestFor: string[];
  watchouts: string[];
  winningSignals?: string[];
}

export interface CopyRewriteAnalysis {
  winningAudience: CopyRewriteTargeting;
  winningSignals: string[];
  notes: string[];
}

export interface CreativeCopyGenerationResponse {
  source: 'ai' | 'fallback';
  model?: string;
  productName: string;
  profitabilityFloor: number;
  workflowMode: 'review_first';
  analysis: CopyRewriteAnalysis;
  suggestions: CopyRewriteSuggestion[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
}

// ── AI Insights ──

export interface AIInsightsData {
  insights: {
    winningPatterns: Array<{ pattern: string; avgRoas: number; example: string; reasoning: string }>;
    bestAngle: { name: string; avgRoas: number; description: string };
    worstAngle: { name: string; avgRoas: number; description: string };
    suggestedPTs: Array<{ text: string; reasoning: string }>;
    suggestedHeadlines: Array<{ text: string; reasoning: string }>;
    suggestedDescriptions?: Array<{ text: string; reasoning: string }>;
    bestCTA: { type: string; usagePercent: number; reasoning: string };
    summary: string;
    actionItems: string[];
  };
  selectionPlan?: {
    selectedCount: number;
    testedCount: number;
    winnerCount: number;
    untestedCount: number;
    uniqueAngles: number;
    uniqueHooks: number;
    uniqueCreators: number;
    uniqueFolders: number;
    uniqueFormats: number;
    recommendedStrategy: BatchStrategy;
    recommendedSize: number;
    title: string;
    reason: string;
    strengths: string[];
    cautions: string[];
    nextMoves: string[];
  };
  launchDraft?: AILaunchDraft;
  source: 'ai' | 'fallback';
  model: string;
  analyzedAds: number;
  productName: string;
  meta?: {
    apiKeySource: string;
    modelSource: string;
    mode?: string;
    selectionAware?: boolean;
    selectionKey?: string;
    fallbackReason?: 'timeout' | 'error';
  };
}

export interface AILaunchActionCard {
  id: string;
  title: string;
  summary: string;
  rationale: string;
  testGoal: string;
  confidence: number;
  priority: 'low' | 'medium' | 'high';
  hypothesis: string;
  expectedOutcome: string;
  strategy: BatchStrategy;
  recommendedSize: number;
  campaignMode: CampaignMode;
  structure: 'ABO' | 'CBO';
  budget: number;
  durationDays: number;
  setup: {
    campaignMode: CampaignMode;
    structure: 'ABO' | 'CBO';
    budget: number;
    durationDays: number;
    recommendedSize: number;
  };
  signals: string[];
  watchouts: string[];
  successMetrics: string[];
  primaryTexts: string[];
  headlines: string[];
  descriptions: string[];
  bestFor: string[];
}

export interface AILaunchDraft {
  summary: string;
  profitabilityFloor: number;
  recommendedCampaignMode: CampaignMode;
  recommendedStructure: 'ABO' | 'CBO';
  recommendedBudget: number;
  recommendedDurationDays: number;
  recommendedCampaignName?: string;
  actionCards: AILaunchActionCard[];
  copyPlan: {
    source: 'winner_history' | 'selection_history' | 'hybrid' | 'fallback';
    primaryTexts: string[];
    headlines: string[];
    descriptions: string[];
  };
}

export interface ExistingCampaignOption {
  id: string;
  campaignId: string;
  campaignName: string;
  campaignType: CampaignLinkType;
  structure: 'ABO' | 'CBO';
  effectiveStatus: string;
  isActive: boolean;
  budgetLabel: string;
  bidStrategyLabel: string;
  pageName?: string;
  pixelName?: string;
  recommendation?: string;
}

// ── Creative Launch Center Types ──

export interface CreativeBatch {
  id: string;
  name: string;
  creativeIds: string[];
  ads?: CreativeAdGroup[];
  dailyBudget?: number;
  dailyMinSpend?: number;
  dailyMaxSpend?: number;
  bidAmount?: number;
  primaryTexts?: string[];
  headlines?: string[];
}

export interface CreativeAdGroup {
  id: string;
  name: string;
  creativeIds: string[];
}

export type BatchStrategy =
  | 'sequential'
  | 'by_format'
  | 'by_folder'
  | 'smart_mix'
  | 'shuffle'
  | 'one_per_adset'
  | 'manual';

export type LaunchCenterTab = 'quick' | 'grid' | 'matrix' | 'kanban' | 'chat' | 'import';

// ── Store State ──

export type CreativeHubTab = 'profiles' | 'inbox' | 'active' | 'completed' | 'copy-library';
export type LaunchWizardStep = 1 | 2 | 3 | 4;
