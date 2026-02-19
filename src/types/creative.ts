export type CreativeType = 'Image' | 'Video';

export type CreativeStatus = 'Active' | 'Fatigue';

export interface Creative {
  id: string;
  name: string;
  campaignId?: string;
  campaignName?: string;
  adSetId?: string;
  adSetName?: string;
  headline?: string;
  primaryText?: string;
  type: CreativeType;
  spend: number;
  roas: number;
  ctr: number;
  impressions: number;
  status: CreativeStatus;
  thumbnailUrl?: string;
  revenue: number;
  conversions: number;
  cpc: number;
  cpm: number;
  frequency: number;
  fatigueScore: number; // 0-100, higher = more fatigued
  startDate: string;
  videoDurationSec?: number;
  metaConfiguredStatus?: string;
  metaEffectiveStatus?: string;
  metaDeliveryStatus?: string;
  dailyStats?: Array<{
    date: string;
    spend: number;
    revenue: number;
    roas: number;
    impressions: number;
    clicks: number;
    conversions: number;
  }>;
}

export interface CreativeSummary {
  totalCreatives: number;
  images: number;
  videos: number;
  fatigued: number;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
  };
}
