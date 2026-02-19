import { apiClient } from '@/services/api';
import type { CampaignCreateAIContext, CampaignCreateAnalysis } from '@/types/campaignCreate';

const EMPTY_AI_CONTEXT: CampaignCreateAIContext = {
  topHeadlines: [],
  topPrimaryTexts: [],
  topCtas: [],
  winningAngles: [],
};
const DEFAULT_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

export async function getCampaignCreateAnalysis(): Promise<CampaignCreateAnalysis> {
  return apiClient<CampaignCreateAnalysis>('/api/meta/campaign-create/analysis', {
    timeoutMs: 8_000,
    maxRetries: 0,
  });
}

export function getDefaultCampaignCreateAnalysis(): CampaignCreateAnalysis {
  return {
    winnerChips: {},
    ourCopyOptions: [],
    aiContext: EMPTY_AI_CONTEXT,
    recommendedObjective: 'CONVERSIONS',
    recommendedTargeting: {
      ageMin: 18,
      ageMax: 65,
      genders: ['all'],
      locations: ['United States'],
      interests: [],
    },
    recommendedNames: {
      campaignName: '',
      adSetName: '',
      adName: '',
    },
    recommendedDestinationUrl: '',
    recommendedUrlTags: DEFAULT_URL_TAGS,
  };
}
