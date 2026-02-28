'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { DateRangePreset } from '@/types/analytics';
import type { PnLEntry } from '@/types/pnl';
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
import { getDailyPnL } from '@/services/pnl';
import { formatDateInTimezone } from '@/lib/timezone';
import { getDateRange } from '@/lib/dateUtils';

function computeShopifyMetricsFromPnL(dailyPnL: PnLEntry[], preset: DateRangePreset) {
  const range = getDateRange(preset);
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);

  const filteredDays = dailyPnL.filter((day) => {
    return day.date >= startStr && day.date <= endStr;
  });

  const shopifyRevenue = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.revenue || 0), 0) * 100
  ) / 100;
  const shopifyOrders = filteredDays.reduce((sum, day) => sum + (day.orderCount || 0), 0);
  const shopifyAov = shopifyOrders > 0
    ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100
    : 0;

  return { shopifyRevenue, shopifyOrders, shopifyAov };
}

async function fetchSummaryData(preset: DateRangePreset) {
  const [metrics, series, campaigns, dailyPnL] = await Promise.all([
    getBlendedMetricsForRange(preset)(),
    getTimeSeriesForRange(preset)(),
    getTopCampaignsForRange(preset)(),
    getDailyPnL(),
  ]);

  const shopifyMetrics = computeShopifyMetricsFromPnL(dailyPnL, preset);

  return {
    blendedMetrics: {
      ...metrics,
      shopifyRevenue: shopifyMetrics.shopifyRevenue,
      shopifyOrders: shopifyMetrics.shopifyOrders,
      shopifyAov: shopifyMetrics.shopifyAov,
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
