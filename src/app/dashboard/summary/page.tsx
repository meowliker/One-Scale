'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DateRange, DateRangePreset } from '@/types/analytics';
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
import { storeDayInTimezone } from '@/lib/timezone';
import { getDateRange } from '@/lib/dateUtils';
import type { Campaign } from '@/types/campaign';
import { convertCurrency } from '@/lib/attribution/currencyHandler';

const DASHBOARD_CURRENCY = 'USD';
const SUMMARY_QUERY_VERSION = 'store-day-v5';
const SUMMARY_WARM_CACHE_VERSION = 'v6';

async function getActiveStoreCurrency(): Promise<string> {
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) return DASHBOARD_CURRENCY;

  try {
    const res = await fetch(`/api/settings/store-config?storeId=${encodeURIComponent(storeId)}`);
    if (!res.ok) return DASHBOARD_CURRENCY;
    const data = await res.json() as {
      config?: { currency?: string | null; reporting_currency?: string | null };
    };
    return (data.config?.currency || data.config?.reporting_currency || DASHBOARD_CURRENCY).toUpperCase();
  } catch {
    return DASHBOARD_CURRENCY;
  }
}

function getSummaryRangeKey(preset: DateRangePreset, range: DateRange): string {
  return `${preset}:${storeDayInTimezone(range.start)}:${storeDayInTimezone(range.end)}`;
}

async function computeShopifyMetricsFromPnL(dailyPnL: PnLEntry[], preset: DateRangePreset, selectedRange?: DateRange) {
  const range = preset === 'custom' && selectedRange ? selectedRange : getDateRange(preset);
  const startStr = storeDayInTimezone(range.start);
  const endStr = storeDayInTimezone(range.end);
  const storeCurrency = await getActiveStoreCurrency();

  const filteredDays = dailyPnL.filter((day) => {
    return day.date >= startStr && day.date <= endStr;
  });

  const rawRevenue = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.revenue || 0), 0) * 100
  ) / 100;
  const shopifyOrders = filteredDays.reduce((sum, day) => sum + (day.orderCount || 0), 0);
  const shopifyRevenue = Math.round(
    (await convertCurrency(rawRevenue, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const shopifyAov = shopifyOrders > 0
    ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100
    : 0;
  const rawFees = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.fees || 0), 0) * 100
  ) / 100;
  const shopifyFees = Math.round(
    (await convertCurrency(rawFees, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const rawRefunds = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.refunds || 0), 0) * 100
  ) / 100;
  const shopifyRefunds = Math.round(
    (await convertCurrency(rawRefunds, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const rawFullRefundAmount = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.fullRefundAmount || 0), 0) * 100
  ) / 100;
  const fullRefundAmount = Math.round(
    (await convertCurrency(rawFullRefundAmount, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const rawPartialRefundAmount = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.partialRefundAmount || 0), 0) * 100
  ) / 100;
  const partialRefundAmount = Math.round(
    (await convertCurrency(rawPartialRefundAmount, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const rawAdSpend = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.adSpend || 0), 0) * 100
  ) / 100;
  const shopifyAdSpend = Math.round(
    (await convertCurrency(rawAdSpend, storeCurrency, DASHBOARD_CURRENCY)) * 100
  ) / 100;
  const shopifyNetProfit = Math.round(
    (shopifyRevenue - shopifyAdSpend - shopifyFees - shopifyRefunds) * 100
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
    shopifyAdSpend,
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
    shopifyAdSpend: number;
  };
  timeSeries: TimeSeriesDataPoint[];
  topCampaigns: Campaign[];
  cachedAt?: string;
}

function readSummaryWarmCache(storeId: string | null, rangeKey: string): SummaryPayload | null {
  if (!storeId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`summary:cache:${SUMMARY_WARM_CACHE_VERSION}:${storeId}:${rangeKey}`);
    if (!raw) return null;
    return JSON.parse(raw) as SummaryPayload;
  } catch {
    return null;
  }
}

function writeSummaryWarmCache(storeId: string, rangeKey: string, payload: SummaryPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`summary:cache:${SUMMARY_WARM_CACHE_VERSION}:${storeId}:${rangeKey}`, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

async function fetchSummaryData(preset: DateRangePreset, selectedRange: DateRange) {
  const customRange = preset === 'custom' ? selectedRange : undefined;
  const [metrics, series, campaigns, dailyPnL] = await Promise.all([
    getBlendedMetricsForRange(preset, customRange)(),
    getTimeSeriesForRange(preset, customRange)(),
    getTopCampaignsForRange(preset, customRange)(),
    // Gracefully degrade: if P&L fetch fails (e.g. Shopify not connected),
    // the rest of the dashboard still loads with Meta data.
    getDailyPnL().catch(() => [] as PnLEntry[]),
  ]);

  // Single source of truth for Shopify metrics: same daily P&L pipeline used by P&L page cards.
  const shopifyMetrics = await computeShopifyMetricsFromPnL(dailyPnL, preset, customRange);

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
      shopifyAdSpend: shopifyMetrics.shopifyAdSpend,
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
  const [selectedRange, setSelectedRange] = useState<DateRange>(() => getDateRange('today'));

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;
  const queryClient = useQueryClient();
  const rangeKey = useMemo(
    () => getSummaryRangeKey(datePreset, selectedRange),
    [datePreset, selectedRange]
  );
  const warmSummary = useMemo(
    () => readSummaryWarmCache(activeStoreId, rangeKey),
    [activeStoreId, rangeKey]
  );

  const {
    data,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ['summary', activeStoreId, rangeKey, SUMMARY_QUERY_VERSION],
    queryFn: () => fetchSummaryData(datePreset, selectedRange),
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
        const presetRange = getDateRange(preset);
        const presetRangeKey = getSummaryRangeKey(preset, presetRange);
        const existing = queryClient.getQueryData(['summary', activeStoreId, presetRangeKey, SUMMARY_QUERY_VERSION]);
        if (existing) continue;
        await queryClient.prefetchQuery({
          queryKey: ['summary', activeStoreId, presetRangeKey, SUMMARY_QUERY_VERSION],
          queryFn: () => fetchSummaryData(preset, presetRange),
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
    writeSummaryWarmCache(activeStoreId, rangeKey, {
      blendedMetrics: data.blendedMetrics,
      timeSeries: data.timeSeries,
      topCampaigns: data.topCampaigns,
      cachedAt: new Date().toISOString(),
    });
  }, [activeStoreId, data, rangeKey]);

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
    if (preset !== 'custom') {
      setSelectedRange(getDateRange(preset));
    }
  }, []);

  const handleDateRangeChange = useCallback((range: DateRange) => {
    setSelectedRange(range);
    setDatePreset(range.preset || 'custom');
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
        dateRange={selectedRange}
        onDatePresetChange={handleDatePresetChange}
        onDateRangeChange={handleDateRangeChange}
        loading={isLoading || isFetching}
      />
    </div>
  );
}
