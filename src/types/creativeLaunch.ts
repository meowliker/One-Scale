export type LaunchStage = 1 | 2 | 3 | 4 | 5;

export interface ProductProfile {
  id: string;
  name: string;
  image: string;
  shopifyUrl: string;
  adAccountId: string;
  adAccountName: string;
  pageId: string;
  pageName: string;
  instagramId: string;
  pixelId: string;
  conversionEvent: string;
  landingUrl: string;
  defaultCampaignId?: string;
  defaultCampaignName?: string;
  defaultBudget: number;
  defaultDuration: number;
  winnerCopyLibrary: WinnerCopy[];
  clickupListId?: string;
  readyCreativesCount: number;
  confidence: number;
  store: string;
}

export interface WinnerCopy {
  id: string;
  primaryText: string;
  headline: string;
  description?: string;
  cta: string;
  roas: number;
  spend: number;
  daysRunning: number;
}

export interface ClickUpCreativeSet {
  id: string;
  taskId: string;
  productId: string;
  productName: string;
  name: string;
  hook: string;
  angle: string;
  format: 'video' | 'image' | 'carousel';
  thumbnailUrl: string;
  driveLink: string;
  notes?: string;
  dateAdded: string;
}

export interface LaunchBatch {
  productId: string;
  productName: string;
  productImage: string;
  creativeIds: string[];
  campaignMode: 'existing' | 'new';
  existingCampaignId?: string;
  existingCampaignName?: string;
  newCampaignName?: string;
  adsetMode: 'existing' | 'new' | 'isolated';
  existingAdsetId?: string;
  existingAdsetName?: string;
  adAccountId: string;
  adAccountName: string;
  pageId: string;
  pageName: string;
  pixelId: string;
  conversionEvent: string;
  selectedPrimaryTextId: string;
  selectedHeadlineId: string;
  destinationUrl: string;
  dailyBudget: number;
  testDuration: number;
  launchDate: string;
}

export interface ActiveTest {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  campaignName: string;
  adAccountName: string;
  startDate: string;
  dayNumber: number;
  totalDays: number;
  totalSpend: number;
  status: 'running' | 'day3_checked' | 'completed' | 'winner_found';
  ads: TestAd[];
}

export interface TestAd {
  id: string;
  creativeName: string;
  thumbnailUrl: string;
  roas: number;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpa: number;
  status: 'running' | 'paused_day3' | 'killed' | 'winner' | 'scale_candidate';
  dayNumber: number;
  clickupTaskId?: string;
}

export interface MockCampaign {
  id: string;
  name: string;
  status: string;
  accountId: string;
  adAccountName: string;
  spend: string;
  roas: string;
}

export interface MockAdset {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  budget: string;
}
