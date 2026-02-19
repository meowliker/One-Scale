import type { TrackingConfig, TrackingHealth } from '@/types/tracking';
import { mockTrackingConfig, mockTrackingHealth } from '@/data/mockTracking';
import { apiClient } from '@/services/api';
import { createServiceFn } from '@/services/withMockFallback';

export async function getTrackingConfig(): Promise<TrackingConfig> {
  return createServiceFn<TrackingConfig>(
    'meta',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return mockTrackingConfig;
    },
    async () => {
      const response = await apiClient<{ data: TrackingConfig }>('/api/tracking/config');
      return response.data;
    }
  )();
}

export async function getTrackingHealth(): Promise<TrackingHealth> {
  return createServiceFn<TrackingHealth>(
    'meta',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return mockTrackingHealth;
    },
    async () => {
      const response = await apiClient<{ data: TrackingHealth }>('/api/tracking/health');
      return response.data;
    }
  )();
}

export interface TrackingAttributionSummary {
  windowDays: number;
  attributionModel: string;
  purchaseCount: number;
  purchaseRevenue: number;
  attributedRevenue: {
    firstClick: number;
    lastClick: number;
  };
  unattributedPurchaseCount: number;
  unattributedShare: number;
}

export async function getTrackingAttribution(): Promise<TrackingAttributionSummary> {
  return createServiceFn<TrackingAttributionSummary>(
    'meta',
    async () => ({
      windowDays: 7,
      attributionModel: 'last_click',
      purchaseCount: 0,
      purchaseRevenue: 0,
      attributedRevenue: { firstClick: 0, lastClick: 0 },
      unattributedPurchaseCount: 0,
      unattributedShare: 0,
    }),
    async () => {
      const response = await apiClient<{ data: TrackingAttributionSummary }>('/api/tracking/attribution');
      return response.data;
    }
  )();
}

interface UpdateTrackingConfigPayload {
  pixelId?: string;
  domain?: string;
  serverSideEnabled?: boolean;
  attributionModel?: TrackingConfig['attributionModel'];
  attributionWindow?: TrackingConfig['attributionWindow'];
}

export async function updateTrackingConfig(
  payload: UpdateTrackingConfigPayload
): Promise<TrackingConfig> {
  return createServiceFn<TrackingConfig, [UpdateTrackingConfigPayload]>(
    'meta',
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { ...mockTrackingConfig, ...payload };
    },
    async (body) => {
      const response = await apiClient<{ data: TrackingConfig }>('/api/tracking/config', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return response.data;
    }
  )(payload);
}
