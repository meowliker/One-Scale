import { apiClient } from '@/services/api';

export type CampaignCopyField = 'primaryText' | 'headline' | 'description' | 'cta';

export interface GenerateCampaignCopyOptionsInput {
  field: CampaignCopyField;
  count?: number;
  objective?: string;
  winnerSummary?: string[];
  topHeadlines?: string[];
  topPrimaryTexts?: string[];
  topCtas?: string[];
  winningAngles?: string[];
}

export interface GenerateCampaignCopyOptionsResult {
  options: string[];
  provider: 'openai' | 'fallback';
}

export async function generateCampaignCopyOptions(
  input: GenerateCampaignCopyOptionsInput
): Promise<GenerateCampaignCopyOptionsResult> {
  return apiClient<GenerateCampaignCopyOptionsResult>('/api/ai/campaign-copy', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 30_000,
    maxRetries: 1,
  });
}
