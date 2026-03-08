'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DateRangePreset } from '@/types/analytics';
import type { TimeSeriesDataPoint } from '@/types/analytics';
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
import type { Campaign } from '@/types/campaign';

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
  const shopifyFees = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.fees || 0), 0) * 100
  ) / 100;
  const shopifyRefunds = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.refunds || 0), 0) * 100
  ) / 100;
  const fullRefundAmount = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.fullRefundAmount || 0), 0) * 100
  ) / 100;
  const partialRefundAmount = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.partialRefundAmount || 0), 0) * 100
  ) / 100;
  const shopifyNetProfit = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.netProfit || 0), 0) * 100
  ) / 100;

  return {
    shopifyRevenue,
    shopifyOrders,
    shopifyAov,
    shopifyFees,
    shopifyRefunds,
    fullRefundAmount,
    partialRefundAmount,
    shopifyNetProfit,
  };
}

interface SummaryPayload {
  blendedMetrics: Record<string, number> & {
    shopifyRevenue: number;
    shopifyOrders: number;
    shopifyAov: number;
    shopifyFees: number;
    shopifyRefunds: number;
    fullRefundAmount: number;
    partialRefundAmount: number;
    shopifyNetProfit: number;
  };
  timeSeries: TimeSeriesDataPoint[];
  topCampaigns: Campaign[];
  cachedAt?: string;
}

function readSummaryWarmCache(storeId: string | null, preset: DateRangePreset): SummaryPayload | null {
  if (!storeId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`summary:cache:v2:${storeId}:${preset}`);
    if (!raw) return null;
    return JSON.parse(raw) as SummaryPayload;
  } catch {
    return null;
  }
}

function writeSummaryWarmCache(storeId: string, preset: DateRangePreset, payload: SummaryPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`summary:cache:v2:${storeId}:${preset}`, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

async function fetchSummaryData(preset: DateRangePreset) {
  const [metrics, series, campaigns, dailyPnL] = await Promise.all([
    getBlendedMetricsForRange(preset)(),
    getTimeSeriesForRange(preset)(),
    getTopCampaignsForRange(preset)(),
    // Gracefully degrade: if P&L fetch fails (e.g. Shopify not connected),
    // the rest of the dashboard still loads with Meta data.
    getDailyPnL().catch(() => [] as PnLEntry[]),
  ]);

  // Single source of truth for Shopify metrics: same daily P&L pipeline used by P&L page cards.
  const shopifyMetrics = computeShopifyMetricsFromPnL(dailyPnL, preset);

  return {
    blendedMetrics: {
      ...metrics,
      shopifyRevenue: shopifyMetrics.shopifyRevenue,
      shopifyOrders: shopifyMetrics.shopifyOrders,
      shopifyAov: shopifyMetrics.shopifyAov,
      shopifyFees: shopifyMetrics.shopifyFees,
      shopifyRefunds: shopifyMetrics.shopifyRefunds,
      fullRefundAmount: shopifyMetrics.fullRefundAmount,
      partialRefundAmount: shopifyMetrics.partialRefundAmount,
      shopifyNetProfit: shopifyMetrics.shopifyNetProfit,
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
  const warmSummary = useMemo(
    () => readSummaryWarmCache(activeStoreId, datePreset),
    [activeStoreId, datePreset]
  );

  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['summary', activeStoreId, datePreset],
    queryFn: () => fetchSummaryData(datePreset),
    enabled: connectionReady && !!activeStoreId,
    initialData: warmSummary || undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
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

  useEffect(() => {
    if (!activeStoreId || !data) return;
    writeSummaryWarmCache(activeStoreId, datePreset, {
      blendedMetrics: data.blendedMetrics,
      timeSeries: data.timeSeries,
      topCampaigns: data.topCampaigns,
      cachedAt: new Date().toISOString(),
    });
  }, [activeStoreId, data, datePreset]);

  const blendedMetrics = data?.blendedMetrics ?? warmSummary?.blendedMetrics ?? {};
  const timeSeries = data?.timeSeries ?? warmSummary?.timeSeries ?? [];
  const topCampaigns = data?.topCampaigns ?? warmSummary?.topCampaigns ?? [];

  const emptyReason = error instanceof NotConnectedError
    ? error.reason
    : error
      ? 'error' as const
      : null;

  const handleDatePresetChange = useCallback((preset: DateRangePreset) => {
    setDatePreset(preset);
  }, []);

  if (!connectionReady && Object.keys(blendedMetrics).length === 0 && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-text-muted">Loading dashboard...</span>
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
        loading={isLoading || isFetching}
      />
    </div>
  );
}
