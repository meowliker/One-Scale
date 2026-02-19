import type { CampaignObjective, CTAType } from '@/types/campaign';

export type CampaignWinnerKey = 'objective' | 'audience' | 'creative' | 'copy';

export interface CampaignWinnerChip {
  key: CampaignWinnerKey;
  title: string;
  value: string;
}

export interface CampaignCreateCopyOption {
  id: string;
  headline: string;
  primaryText: string;
  ctaLabel: string;
  ctaType: CTAType;
  ads: number;
  spend: number;
  roas: number;
  ctr: number;
  cpc: number;
  conversions: number;
}

export interface CampaignCreateAIContext {
  topHeadlines: string[];
  topPrimaryTexts: string[];
  topCtas: string[];
  winningAngles: string[];
}

export interface CampaignCreateAnalysis {
  winnerChips: Partial<Record<CampaignWinnerKey, CampaignWinnerChip>>;
  ourCopyOptions: CampaignCreateCopyOption[];
  aiContext: CampaignCreateAIContext;
  recommendedObjective?: CampaignObjective;
  recommendedTargeting?: {
    ageMin: number;
    ageMax: number;
    genders: string[];
    locations: string[];
    interests: string[];
  };
  recommendedNames?: {
    campaignName: string;
    adSetName: string;
    adName: string;
  };
  recommendedDestinationUrl?: string;
  recommendedUrlTags?: string;
}

export type CampaignConversionEvent =
  | 'PURCHASE'
  | 'ADD_TO_CART'
  | 'INITIATE_CHECKOUT'
  | 'LEAD'
  | 'COMPLETE_REGISTRATION'
  | 'VIEW_CONTENT'
  | 'SEARCH';

export interface CampaignSetupAccountOption {
  id: string;
  name: string;
  accountId?: string;
}

export interface CampaignSetupPageOption {
  id: string;
  name: string;
  instagramAccountId?: string;
  instagramUsername?: string;
}

export interface CampaignSetupInstagramOption {
  id: string;
  username: string;
}

export interface CampaignSetupPixelOption {
  id: string;
  name: string;
}

export interface CampaignSetupCustomConversionOption {
  id: string;
  name: string;
  customEventType?: string;
}

export interface CampaignSetupOptions {
  accounts: CampaignSetupAccountOption[];
  pages: CampaignSetupPageOption[];
  instagramAccounts: CampaignSetupInstagramOption[];
  pixels: CampaignSetupPixelOption[];
  customConversions: CampaignSetupCustomConversionOption[];
  conversionEvents: CampaignConversionEvent[];
  defaultAccountId?: string;
  fetchedAt: string;
}

export interface CampaignUploadedAsset {
  mediaType: 'image' | 'video';
  fileName: string;
  imageHash?: string;
  videoId?: string;
  thumbnailUrl?: string;
  localPreviewUrl?: string;
}

export interface CampaignPublishSettings {
  accountId: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  destinationUrl: string;
  urlTags: string;
  pageId: string;
  instagramActorId: string;
  pixelId: string;
  conversionEvent: CampaignConversionEvent;
  customConversionId: string;
  publishNow: boolean;
}
