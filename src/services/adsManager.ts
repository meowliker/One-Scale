import type { Campaign, EntityStatus } from '@/types/campaign';
import { mockCampaigns } from '@/data/mockCampaigns';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';

let campaigns = [...mockCampaigns];

async function mockGetCampaigns(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _dateRange?: { since: string; until: string }
): Promise<Campaign[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return campaigns;
}

async function realGetCampaigns(dateRange?: { since: string; until: string }): Promise<Campaign[]> {
  const params: Record<string, string> = {};
  if (dateRange) {
    params.since = dateRange.since;
    params.until = dateRange.until;
    params.strictDate = '1';
  }
  const response = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns', { params });
  return response.data;
}

export const getCampaigns = createServiceFn<Campaign[], [dateRange?: { since: string; until: string }]>(
  'meta',
  mockGetCampaigns,
  realGetCampaigns
);

export async function updateCampaignStatus(
  id: string,
  status: EntityStatus
): Promise<void> {
  campaigns = campaigns.map((c) =>
    c.id === id ? { ...c, status } : c
  );
}

export async function updateAdSetStatus(
  id: string,
  status: EntityStatus
): Promise<void> {
  campaigns = campaigns.map((c) => ({
    ...c,
    adSets: c.adSets.map((as) =>
      as.id === id ? { ...as, status } : as
    ),
  }));
}

export async function updateAdStatus(
  id: string,
  status: EntityStatus
): Promise<void> {
  campaigns = campaigns.map((c) => ({
    ...c,
    adSets: c.adSets.map((as) => ({
      ...as,
      ads: as.ads.map((ad) =>
        ad.id === id ? { ...ad, status } : ad
      ),
    })),
  }));
}

export async function updateBudget(
  entityType: 'campaign' | 'adset',
  id: string,
  newBudget: number
): Promise<void> {
  if (entityType === 'campaign') {
    campaigns = campaigns.map((c) =>
      c.id === id ? { ...c, dailyBudget: newBudget } : c
    );
  } else {
    campaigns = campaigns.map((c) => ({
      ...c,
      adSets: c.adSets.map((as) =>
        as.id === id ? { ...as, dailyBudget: newBudget } : as
      ),
    }));
  }
}

export async function updateBid(
  adSetId: string,
  newBid: number
): Promise<void> {
  campaigns = campaigns.map((c) => ({
    ...c,
    adSets: c.adSets.map((as) =>
      as.id === adSetId ? { ...as, bidAmount: newBid } : as
    ),
  }));
}

export async function bulkUpdateStatus(
  ids: string[],
  status: EntityStatus
): Promise<void> {
  const idSet = new Set(ids);
  campaigns = campaigns.map((c) => ({
    ...c,
    status: idSet.has(c.id) ? status : c.status,
    adSets: c.adSets.map((as) => ({
      ...as,
      status: idSet.has(as.id) ? status : as.status,
      ads: as.ads.map((ad) => ({
        ...ad,
        status: idSet.has(ad.id) ? status : ad.status,
      })),
    })),
  }));
}
