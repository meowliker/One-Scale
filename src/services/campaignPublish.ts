import { apiClient } from '@/services/api';
import { useStoreStore } from '@/stores/storeStore';
import type { CampaignObjective, BidStrategy, CTAType } from '@/types/campaign';
import type {
  CampaignPublishSettings,
  CampaignSetupOptions,
  CampaignUploadedAsset,
} from '@/types/campaignCreate';

export interface CampaignPublishTargeting {
  ageMin: number;
  ageMax: number;
  genders: string[];
  locations: string[];
  interests: string[];
  customAudiences: string[];
}

export interface CampaignPublishBudget {
  type: 'daily' | 'lifetime';
  amount: number;
  bidStrategy: BidStrategy;
  bidAmount: number | null;
}

export interface CampaignPublishSchedule {
  startDate: string;
  endDate: string | null;
}

export interface CampaignPublishCreative {
  type: 'image' | 'video';
  headline: string;
  body: string;
  description: string;
  ctaType: CTAType;
}

export interface PublishCampaignRequest {
  objective: CampaignObjective;
  targeting: CampaignPublishTargeting;
  budget: CampaignPublishBudget;
  schedule: CampaignPublishSchedule;
  creative: CampaignPublishCreative;
  settings: CampaignPublishSettings;
  asset: CampaignUploadedAsset;
}

export interface PublishCampaignResponse {
  success: boolean;
  status: 'PAUSED' | 'ACTIVE';
  created: {
    campaignId: string;
    adSetId: string;
    creativeId: string;
    adId: string;
  };
  warnings: string[];
}

export async function getCampaignSetupOptions(accountId?: string): Promise<CampaignSetupOptions> {
  const params: Record<string, string> = {};
  if (accountId) params.accountId = accountId;
  return apiClient<CampaignSetupOptions>('/api/meta/campaign-setup/options', { params, timeoutMs: 10_000, maxRetries: 0 });
}

export async function uploadCampaignAsset(params: {
  accountId: string;
  mediaType: 'image' | 'video';
  file: File;
}): Promise<CampaignUploadedAsset> {
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) throw new Error('No active store selected');

  const formData = new FormData();
  formData.set('accountId', params.accountId);
  formData.set('mediaType', params.mediaType);
  formData.set('file', params.file);

  const response = await fetch(`/api/meta/upload-asset?storeId=${encodeURIComponent(storeId)}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Failed to upload asset' }));
    throw new Error(body.error || 'Failed to upload asset');
  }

  return response.json() as Promise<CampaignUploadedAsset>;
}

export async function publishCampaign(payload: PublishCampaignRequest): Promise<PublishCampaignResponse> {
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) throw new Error('No active store selected');

  const response = await fetch(`/api/meta/campaigns/publish?storeId=${encodeURIComponent(storeId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'Failed to publish campaign');
  }

  return body as PublishCampaignResponse;
}
