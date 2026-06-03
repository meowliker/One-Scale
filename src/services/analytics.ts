import type { DateRange, TimeSeriesDataPoint, DateRangePreset } from '@/types/analytics';
import type { Campaign } from '@/types/campaign';
import { mockBlendedMetrics, mockTimeSeries, mockHourlyTimeSeries, mockYesterdayHourlyTimeSeries } from '@/data/mockAnalytics';
import { mockCampaigns } from '@/data/mockCampaigns';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';
import { getDateRange } from '@/lib/dateUtils';
import { STORE_REPORTING_TIMEZONE, storeDayInTimezone } from '@/lib/timezone';
import { buildStoreScopedKey, memoizePromise } from '@/services/perfCache';

/**
 * Fetch Meta insights directly using storeId only (no accountIds).
 * This lets the API fall back to DB-stored ad accounts, which are always correct.
 * Using apiClient would auto-inject accountIds from the frontend connection store,
 * which may be stale or contain wrong IDs — causing ad spend mismatches between
 * the summary page and the P&L page.
 */
async function fetchInsightsDirect(
  datePreset: string,
  range?: DateRange,
): Promise<{ data: { date: string; metrics: Record<string, number> }[] }> {
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) return { data: [] };

  const params = new URLSearchParams({ storeId });
  if (range) {
    params.set('since', storeDayInTimezone(range.start, STORE_REPORTING_TIMEZONE));
    params.set('until', storeDayInTimezone(range.end, STORE_REPORTING_TIMEZONE));
  } else {
    params.set('datePreset', datePreset);
  }

  const res = await fetch(`/api/meta/insights?${params.toString()}`);
  if (!res.ok) return { data: [] };
  return res.json();
}

// Map frontend date range presets to Meta API date_preset values
function mapPresetToMeta(preset?: DateRangePreset): string {
  switch (preset) {
    case 'today': return 'today';
    case 'yesterday': return 'yesterday';
    case 'last3': return 'last_3d';
    case 'last7': return 'last_7d';
    case 'last7today': return 'last_7d';
    case 'last14': return 'last_14d';
    case 'last28': return 'last_28d';
    case 'last30': return 'last_30d';
    case 'thisMonth': return 'this_month';
    case 'lastMonth': return 'last_month';
    default: return 'last_30d';
  }
}

async function mockGetBlendedMetrics(): Promise<Record<string, number>> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockBlendedMetrics;
}

function createRealGetBlendedMetrics(datePreset: string, range?: DateRange) {
  return async function realGetBlendedMetrics(): Promise<Record<string, number>> {
    const rangeKey = range
      ? `${storeDayInTimezone(range.start, STORE_REPORTING_TIMEZONE)}:${storeDayInTimezone(range.end, STORE_REPORTING_TIMEZONE)}`
      : datePreset;
    const key = buildStoreScopedKey('analytics:blended', rangeKey);
    return memoizePromise(key, 45_000, async () => {
      // Use direct fetch (storeId only) so the API resolves ad accounts from DB,
      // matching the P&L page and avoiding stale frontend account IDs.
      const response = await fetchInsightsDirect(datePreset, range);

      // Aggregate daily insights into totals
      const totals = { spend: 0, revenue: 0, conversions: 0, impressions: 0, clicks: 0 };
      for (const day of response.data) {
        totals.spend += day.metrics.spend || 0;
        totals.revenue += day.metrics.revenue || 0;
        totals.conversions += day.metrics.conversions || 0;
        totals.impressions += day.metrics.impressions || 0;
        totals.clicks += day.metrics.clicks || 0;
      }

      // Return in the same key format as mockBlendedMetrics
      return {
        totalSpend: Math.round(totals.spend * 100) / 100,
        totalRevenue: Math.round(totals.revenue * 100) / 100,
        totalConversions: totals.conversions,
        totalImpressions: totals.impressions,
        totalClicks: totals.clicks,
        blendedRoas: totals.spend > 0 ? Math.round((totals.revenue / totals.spend) * 100) / 100 : 0,
        blendedCpc: totals.clicks > 0 ? Math.round((totals.spend / totals.clicks) * 100) / 100 : 0,
        blendedCpm: totals.impressions > 0 ? Math.round(((totals.spend / totals.impressions) * 1000) * 100) / 100 : 0,
        blendedCtr: totals.impressions > 0 ? Math.round(((totals.clicks / totals.impressions) * 100) * 100) / 100 : 0,
        blendedAov: totals.conversions > 0 ? Math.round((totals.revenue / totals.conversions) * 100) / 100 : 0,
      };
    });
  };
}

async function mockGetTimeSeries(preset?: DateRangePreset): Promise<TimeSeriesDataPoint[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));

  switch (preset) {
    case 'today':
      return mockHourlyTimeSeries;
    case 'yesterday':
      return mockYesterdayHourlyTimeSeries;
    case 'last7':
      return mockTimeSeries.slice(-7);
    case 'last14':
      return mockTimeSeries.slice(-14);
    case 'last30':
    default:
      return mockTimeSeries;
  }
}

function createRealGetTimeSeries(datePreset: string, range?: DateRange) {
  return async function realGetTimeSeries(): Promise<TimeSeriesDataPoint[]> {
    const rangeKey = range
      ? `${storeDayInTimezone(range.start, STORE_REPORTING_TIMEZONE)}:${storeDayInTimezone(range.end, STORE_REPORTING_TIMEZONE)}`
      : datePreset;
    const key = buildStoreScopedKey('analytics:timeseries', rangeKey);
    return memoizePromise(key, 45_000, async () => {
      // Use direct fetch (storeId only) so the API resolves ad accounts from DB,
      // matching the P&L page and avoiding stale frontend account IDs.
      const response = await fetchInsightsDirect(datePreset, range);
      return response.data.map((day) => ({
        date: day.date,
        spend: day.metrics.spend || 0,
        revenue: day.metrics.revenue || 0,
        roas: day.metrics.roas || 0,
        conversions: day.metrics.conversions || 0,
        impressions: day.metrics.impressions || 0,
        clicks: day.metrics.clicks || 0,
        cpc: day.metrics.cpc || 0,
        cpm: day.metrics.cpm || 0,
        ctr: day.metrics.ctr || 0,
        aov: day.metrics.aov || 0,
      }));
    });
  };
}

// Default functions with last_30d (backwards-compatible)
export const getBlendedMetrics = createServiceFn<Record<string, number>>(
  'meta',
  mockGetBlendedMetrics,
  createRealGetBlendedMetrics('last_30d')
);

export const getTimeSeries = createServiceFn<TimeSeriesDataPoint[]>(
  'meta',
  mockGetTimeSeries,
  createRealGetTimeSeries('last_30d')
);

// Date-range-aware functions
export function getBlendedMetricsForRange(preset?: DateRangePreset, range?: DateRange) {
  const metaPreset = mapPresetToMeta(preset);
  return createServiceFn<Record<string, number>>(
    'meta',
    mockGetBlendedMetrics,
    createRealGetBlendedMetrics(metaPreset, preset === 'custom' ? range : undefined)
  );
}

export function getTimeSeriesForRange(preset?: DateRangePreset, range?: DateRange) {
  const metaPreset = mapPresetToMeta(preset);
  return createServiceFn<TimeSeriesDataPoint[]>(
    'meta',
    () => mockGetTimeSeries(preset),
    createRealGetTimeSeries(metaPreset, preset === 'custom' ? range : undefined)
  );
}

async function mockGetTopCampaigns(): Promise<Campaign[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return [...mockCampaigns]
    .sort((a, b) => b.metrics.roas - a.metrics.roas)
    .slice(0, 5);
}

async function realGetTopCampaigns(): Promise<Campaign[]> {
  // accountIds are auto-injected by apiClient from mapped accounts
  const response = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns');
  return response.data
    .sort((a, b) => b.metrics.roas - a.metrics.roas)
    .slice(0, 5);
}

export const getTopCampaigns = createServiceFn<Campaign[]>(
  'meta',
  mockGetTopCampaigns,
  realGetTopCampaigns
);

function buildCampaignRangeParams(preset?: DateRangePreset, range?: DateRange): Record<string, string> {
  if (preset === 'custom' && range) {
    return {
      since: storeDayInTimezone(range.start, STORE_REPORTING_TIMEZONE),
      until: storeDayInTimezone(range.end, STORE_REPORTING_TIMEZONE),
      strictDate: '1',
      forceLive: '1',
    };
  }
  if (!preset) return {};
  const presetRange = getDateRange(preset);
  return {
    since: storeDayInTimezone(presetRange.start, STORE_REPORTING_TIMEZONE),
    until: storeDayInTimezone(presetRange.end, STORE_REPORTING_TIMEZONE),
  };
}

function createRealGetTopCampaignsForRange(preset?: DateRangePreset, range?: DateRange) {
  return async function realGetTopCampaignsForRange(): Promise<Campaign[]> {
    const params = buildCampaignRangeParams(preset, range);
    const key = buildStoreScopedKey('analytics:top-campaigns', `${params.since || 'none'}:${params.until || 'none'}`);
    return memoizePromise(key, 60_000, async () => {
      const response = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns', {
        params,
      });
      return response.data
        .sort((a, b) => b.metrics.roas - a.metrics.roas)
        .slice(0, 5);
    });
  };
}

// Returns ALL campaigns (not just top 5) for strategy/funnel analysis
async function mockGetAllCampaigns(): Promise<Campaign[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return [...mockCampaigns];
}

async function realGetAllCampaigns(): Promise<Campaign[]> {
  const response = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns');
  return response.data;
}

export const getAllCampaigns = createServiceFn<Campaign[]>(
  'meta',
  mockGetAllCampaigns,
  realGetAllCampaigns
);

function createRealGetAllCampaignsForRange(preset?: DateRangePreset, range?: DateRange) {
  return async function realGetAllCampaignsForRange(): Promise<Campaign[]> {
    const params = buildCampaignRangeParams(preset, range);
    const key = buildStoreScopedKey('analytics:all-campaigns', `${params.since || 'none'}:${params.until || 'none'}`);
    return memoizePromise(key, 60_000, async () => {
      const response = await apiClient<{ data: Campaign[] }>('/api/meta/campaigns', {
        params,
      });
      return response.data;
    });
  };
}

export function getTopCampaignsForRange(preset?: DateRangePreset, range?: DateRange) {
  return createServiceFn<Campaign[]>(
    'meta',
    mockGetTopCampaigns,
    createRealGetTopCampaignsForRange(preset, range)
  );
}

export function getAllCampaignsForRange(preset?: DateRangePreset, range?: DateRange) {
  return createServiceFn<Campaign[]>(
    'meta',
    mockGetAllCampaigns,
    createRealGetAllCampaignsForRange(preset, range)
  );
}
