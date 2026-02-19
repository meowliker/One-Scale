'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { TimeSeriesDataPoint, DateRangePreset } from '@/types/analytics';
import type { Campaign } from '@/types/campaign';
import { getBlendedMetricsForRange, getTimeSeriesForRange, getTopCampaignsForRange } from '@/services/analytics';
import { AnalyticsDashboardClient } from '@/components/analytics/AnalyticsDashboardClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { getDailyPnL } from '@/services/pnl';
import type { PnLEntry } from '@/types/pnl';
import { formatDateInTimezone } from '@/lib/timezone';
import { getDateRange } from '@/lib/dateUtils';

interface SummaryCachePayload {
  blendedMetrics: Record<string, number>;
  timeSeries: TimeSeriesDataPoint[];
  topCampaigns: Campaign[];
  cachedAt: string;
}

function getSummaryCacheKey(storeId: string, preset: DateRangePreset): string {
  return `summary:cache:${storeId}:${preset}`;
}

function readSummaryCache(storeId: string, preset: DateRangePreset): SummaryCachePayload | null {
  try {
    const raw = localStorage.getItem(getSummaryCacheKey(storeId, preset));
    if (!raw) return null;
    return JSON.parse(raw) as SummaryCachePayload;
  } catch {
    return null;
  }
}

function writeSummaryCache(storeId: string, preset: DateRangePreset, payload: SummaryCachePayload): void {
  try {
    localStorage.setItem(getSummaryCacheKey(storeId, preset), JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota/security errors
  }
}

const SUMMARY_PREWARM_PRESETS: DateRangePreset[] = [
  'yesterday',
  'last7',
  'last14',
  'last30',
  'thisMonth',
  'lastMonth',
];

/**
 * Compute Shopify metrics from the same daily dataset used by the P&L page.
 * This keeps Summary revenue/orders/AOV in sync with P&L logic.
 */
function computeShopifyMetricsFromPnL(dailyPnL: PnLEntry[], preset: DateRangePreset) {
  const range = getDateRange(preset);
  const startStr = formatDateInTimezone(range.start);
  const endStr = formatDateInTimezone(range.end);

  const filteredDays = dailyPnL.filter((day) => {
    return day.date >= startStr && day.date <= endStr;
  });

  // Revenue and orders come directly from P&L day entries.
  const shopifyRevenue = Math.round(
    filteredDays.reduce((sum, day) => sum + (day.revenue || 0), 0) * 100
  ) / 100;
  const shopifyOrders = filteredDays.reduce((sum, day) => sum + (day.orderCount || 0), 0);

  const shopifyAov = shopifyOrders > 0
    ? Math.round((shopifyRevenue / shopifyOrders) * 100) / 100
    : 0;

  return { shopifyRevenue, shopifyOrders, shopifyAov };
}

export default function SummaryPage() {
  const [blendedMetrics, setBlendedMetrics] = useState<Record<string, number>>({});
  const [timeSeries, setTimeSeries] = useState<TimeSeriesDataPoint[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const [datePreset, setDatePreset] = useState<DateRangePreset>('today');

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const fetchData = useCallback(async (preset: DateRangePreset) => {
    setLoading(true);
    setEmptyReason(null);
    try {
      const getMetrics = getBlendedMetricsForRange(preset);
      const getSeries = getTimeSeriesForRange(preset);
      const getTop = getTopCampaignsForRange(preset);
      const [metrics, series, campaigns, dailyPnL] = await Promise.all([
        getMetrics(),
        getSeries(),
        getTop(),
        getDailyPnL(),
      ]);

      // Use the same P&L-derived Shopify values shown in the P&L dashboard.
      const shopifyMetrics = computeShopifyMetricsFromPnL(dailyPnL, preset);

      setBlendedMetrics({
        ...metrics,
        shopifyRevenue: shopifyMetrics.shopifyRevenue,
        shopifyOrders: shopifyMetrics.shopifyOrders,
        shopifyAov: shopifyMetrics.shopifyAov,
      });
      setTimeSeries(series);
      setTopCampaigns(campaigns);
      if (activeStoreId) {
        writeSummaryCache(activeStoreId, preset, {
          blendedMetrics: {
            ...metrics,
            shopifyRevenue: shopifyMetrics.shopifyRevenue,
            shopifyOrders: shopifyMetrics.shopifyOrders,
            shopifyAov: shopifyMetrics.shopifyAov,
          },
          timeSeries: series,
          topCampaigns: campaigns,
          cachedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  // Hydrate from last fetched local cache first for instant paint on load/date switch.
  useEffect(() => {
    if (!connectionReady || !activeStoreId) return;
    const cached = readSummaryCache(activeStoreId, datePreset);
    if (!cached) return;
    setBlendedMetrics(cached.blendedMetrics);
    setTimeSeries(cached.timeSeries);
    setTopCampaigns(cached.topCampaigns);
    setLoading(false);
  }, [connectionReady, activeStoreId, datePreset]);

  // Wait for connection status to be fully loaded before fetching data.
  // This prevents mock/fake data from flashing before real data arrives.
  useEffect(() => {
    if (connectionReady) {
      fetchData(datePreset);
    }
  }, [connectionReady, activeStoreId, fetchData, datePreset]);

  // Background pre-warm: fetch non-live presets once per day so switching ranges is instant.
  useEffect(() => {
    if (!connectionReady || !activeStoreId) return;

    let cancelled = false;
    const dayKey = new Date().toISOString().slice(0, 10);
    const stampKey = `summary:prewarm:${activeStoreId}:${dayKey}`;
    if (localStorage.getItem(stampKey) === 'done') return;

    (async () => {
      try {
        const dailyPnL = await getDailyPnL();
        for (const preset of SUMMARY_PREWARM_PRESETS) {
          if (cancelled) return;
          if (readSummaryCache(activeStoreId, preset)) continue;

          const [metrics, series, campaigns] = await Promise.all([
            getBlendedMetricsForRange(preset)(),
            getTimeSeriesForRange(preset)(),
            getTopCampaignsForRange(preset)(),
          ]);
          const shopifyMetrics = computeShopifyMetricsFromPnL(dailyPnL, preset);
          writeSummaryCache(activeStoreId, preset, {
            blendedMetrics: {
              ...metrics,
              shopifyRevenue: shopifyMetrics.shopifyRevenue,
              shopifyOrders: shopifyMetrics.shopifyOrders,
              shopifyAov: shopifyMetrics.shopifyAov,
            },
            timeSeries: series,
            topCampaigns: campaigns,
            cachedAt: new Date().toISOString(),
          });
        }
        localStorage.setItem(stampKey, 'done');
      } catch {
        // best-effort prewarm only
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connectionReady, activeStoreId]);

  const handleDatePresetChange = useCallback((preset: DateRangePreset) => {
    setDatePreset(preset);
  }, []);

  if ((!connectionReady || loading) && Object.keys(blendedMetrics).length === 0 && !emptyReason) {
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
        loading={loading}
      />
    </div>
  );
}
