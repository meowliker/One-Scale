import type { GeneratedCopy, WinningCopy, CopyInsights } from '@/data/mockAICopy';
import { mockGeneratedCopy, mockWinningCopy, mockCopyInsights } from '@/data/mockAICopy';

const USE_MOCK = true;

export async function generateCopy(params: {
  product: string;
  tone: string;
  framework: string;
  count: number;
}): Promise<GeneratedCopy[]> {
  if (USE_MOCK) {
    // Simulate AI generation delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let results = [...mockGeneratedCopy];

    // Filter by tone if specified (not 'all')
    if (params.tone && params.tone !== 'all') {
      results = results.filter((c) => c.tone === params.tone);
    }

    // Filter by framework if specified (not 'all')
    if (params.framework && params.framework !== 'all') {
      results = results.filter((c) => c.framework === params.framework);
    }

    // If filters returned nothing, fall back to the full set
    if (results.length === 0) {
      results = [...mockGeneratedCopy];
    }

    // Limit to requested count
    return results.slice(0, params.count);
  }

  // Real API call (uncomment when ready):
  // const response = await apiClient<ApiResponse<GeneratedCopy[]>>('/api/ai/generate-copy', {
  //   method: 'POST',
  //   body: JSON.stringify(params),
  // });
  // return response.data;
  return [];
}

export async function getWinningCopy(): Promise<WinningCopy[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockWinningCopy;
  }

  return [];
}

export async function getCopyInsights(): Promise<CopyInsights> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockCopyInsights;
  }

  return {
    topPhrases: [],
    avgWordCount: { primaryText: 0, headline: 0, description: 0 },
    topCTAs: [],
    toneAnalysis: [],
  };
}
