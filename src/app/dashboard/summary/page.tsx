'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { DateRangePreset } from '@/types/analytics';
import { getBlendedMetricsForRange, getTimeSeriesForRange, getTopCampaignsForRange } from '@/services/analytics';
import dynamic from 'next/dynamic';

const AnalyticsDashboardClient = dynamic(
  () => import('@/components/analytics/AnalyticsDashboardClient').then((m) => m.AnalyticsDashboardClient),
  { ssr: false }
);
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { apiClient } from '@/services/api';
import { getStoreTimezone } from '@/lib/timezone';
import { getDateRange } from '@/lib/dateUtils';

async function fetchShopifyRevenueForPreset(preset: DateRangePreset): Promise<{
  shopifyRevenue: number;
  shopifyOrders: number;
  shopifyAov: number;
} | null> {
  try {
    const tz = getStoreTimezone();
    const range = getDateRange(preset);

    // These Date objects already represent start/end of day in the store timezone (as UTC)
    const createdAtMin = range.start.toISOString();
    const createdAtMax = range.end.toISOString();

    // Fetch orders for the date range (paginate up to 2 pages = 500 orders)
    const allOrders: Array<{ totalPrice: string; financialStatus: string }> = [];
    let sinceId = '0';
    for (let page = 0; page < 2; page++) {
      const res = await apiClient<{ data: Array<{ id: number; totalPrice: string; financialStatus: string }> }>(
        '/api/shopify/orders',
        {
          params: {
            created_at_min: createdAtMin,
            created_at_max: createdAtMax,
            limit: '250',
            since_id: sinceId,
          },
          timeoutMs: 15_000,
          maxRetries: 1,
        }
      );
      const batch = res.data;
      allOrders.push(...batch);
      if (batch.length < 250) break;
      sinceId = String(batch[batch.length - 1].id ?? sinceId);
    }

    const validOrders = allOrders.filter((o) => o.financialStatus !== 'refunded');
    const shopifyRevenue = Math.round(
      validOrders.reduce((sum, o) => sum + parseFloat(o.totalPrice || '0'), 0) * 100
    ) / 100;
    const shopifyOrders = validOrders.length;
    const shopifyAov = shopifyOrders > 0
      ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100
      : 0;

    return { shopifyRevenue, shopifyOrders, shopifyAov };
  } catch {
    // Shopify not connected or API error — return null so callers know it's unavailable
    return null;
  }
}

async function fetchSummaryData(preset: DateRangePreset) {
  const [metrics, series, campaigns, shopifyData] = await Promise.all([
    getBlendedMetricsForRange(preset)(),
    getTimeSeriesForRange(preset)(),
    getTopCampaignsForRange(preset)(),
    fetchShopifyRevenueForPreset(preset),
  ]);

  return {
    blendedMetrics: {
      ...metrics,
      ...(shopifyData !== null && {
        shopifyRevenue: shopifyData.shopifyRevenue,
        shopifyOrders: shopifyData.shopifyOrders,
        shopifyAov: shopifyData.shopifyAov,
      }),
    },
    timeSeries: series,
    topCampaigns: campaigns,
  };
}

const PREWARM_PRESETS: DateRangePreset[] = [
  'yesterday',
  'last7',
  'last14',
  'last30',
  'thisMonth',
  'lastMonth',
];

export default function SummaryPage() {
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['summary', activeStoreId, datePreset],
    queryFn: () => fetchSummaryData(datePreset),
    enabled: connectionReady && !!activeStoreId,
  });

  // Prewarm other date presets in background on first successful load
  useQuery({
    queryKey: ['summary-prewarm', activeStoreId],
    queryFn: async () => {
      for (const preset of PREWARM_PRESETS) {
        // Skip if already cached
        const existing = queryClient.getQueryData(['summary', activeStoreId, preset]);
        if (existing) continue;
        await queryClient.prefetchQuery({
          queryKey: ['summary', activeStoreId, preset],
          queryFn: () => fetchSummaryData(preset),
        });
      }
      return true;
    },
    enabled: connectionReady && !!activeStoreId && !!data,
    staleTime: 24 * 60 * 60 * 1000, // once per day
    gcTime: 24 * 60 * 60 * 1000,
  });

  const blendedMetrics = data?.blendedMetrics ?? {};
  const timeSeries = data?.timeSeries ?? [];
  const topCampaigns = data?.topCampaigns ?? [];

  const emptyReason = error instanceof NotConnectedError
    ? error.reason
    : error
      ? 'error' as const
      : null;

  const handleDatePresetChange = useCallback((preset: DateRangePreset) => {
    setDatePreset(preset);
  }, []);

  if ((!connectionReady || isLoading) && Object.keys(blendedMetrics).length === 0 && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading dashboard...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary mt-1">
          Overview of your advertising performance
        </p>
      </div>
      <AnalyticsDashboardClient
        blendedMetrics={blendedMetrics}
        timeSeries={timeSeries}
        topCampaigns={topCampaigns}
        datePreset={datePreset}
        onDatePresetChange={handleDatePresetChange}
        loading={isLoading}
      />
    </div>
  );
}
