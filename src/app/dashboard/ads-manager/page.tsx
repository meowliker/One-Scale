'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Campaign } from '@/types/campaign';
import type { DateRangePreset } from '@/types/analytics';
import { getCampaigns } from '@/services/adsManager';
import dynamic from 'next/dynamic';

const AdsManagerClient = dynamic(
  () => import('@/components/ads-manager/AdsManagerClient').then((m) => m.AdsManagerClient),
  { ssr: false }
);
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { SkeletonTableRow, SkeletonCard } from '@/components/ui/Skeleton';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { RefreshButton } from '@/components/ui/RefreshButton';

const CAMPAIGNS_CACHE_KEY = 'onescale:campaigns-cache';
const CAMPAIGNS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

interface DateRangeState {
  start: Date;
  end: Date;
  preset?: DateRangePreset;
  since: string;
  until: string;
}

function buildDateRangeState(range: { start: Date; end: Date; preset?: DateRangePreset }): DateRangeState {
  return {
    ...range,
    since: formatDateInTimezone(range.start),
    until: formatDateInTimezone(range.end),
  };
}

function hasCampaignSignal(rows: Campaign[]): boolean {
  return rows.some((row) =>
    (row.metrics?.spend || 0) > 0 ||
    (row.metrics?.revenue || 0) > 0 ||
    (row.metrics?.conversions || 0) > 0
  );
}

/** Read cached campaigns from localStorage for instant hydration */
function readLocalCache(key: string): Campaign[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    // Use cache if less than 30 minutes old (background sync keeps it fresh)
    if (Date.now() - ts > 30 * 60 * 1000) return null;
    return data as Campaign[];
  } catch {
    return null;
  }
}

/** Write campaigns to localStorage */
function writeLocalCache(key: string, data: Campaign[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // Quota exceeded — ignore
  }
}

export default function AdsManagerPage() {
  const [dateRange, setDateRange] = useState<DateRangeState>(() => buildDateRangeState(getDateRange('today')));

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const cacheKey = activeStoreId && dateRange
    ? `${CAMPAIGNS_CACHE_KEY}:${activeStoreId}:${dateRange.since}:${dateRange.until}`
    : null;

  const {
    data: campaigns = [],
    isLoading,
    isFetching,
    error,
  } = useQuery<Campaign[], Error>({
    queryKey: ['campaigns', activeStoreId, dateRange?.since, dateRange?.until, dateRange?.preset],
    queryFn: async () => {
      const { since, until, preset } = dateRange;

      // Cache-first fetch. Live refresh is handled by background sync endpoints.
      try {
        const cached = await getCampaigns({ since, until }, { preferCache: true });
        // For strict single-day ranges (e.g. Yesterday), stale zero-signal snapshots
        // can persist; fall through to live fetch in that case.
        const isSingleDay = since === until;
        if (cached.length > 0 && (!isSingleDay || hasCampaignSignal(cached))) {
          if (cacheKey) writeLocalCache(cacheKey, cached);
          return cached;
        }
      } catch {
        // Cache miss — fall through
      }

      // Direct live fetch
      const data = await getCampaigns({ since, until, preset });
      if (cacheKey) writeLocalCache(cacheKey, data);
      return data;
    },
    enabled: connectionReady && !!activeStoreId,
    staleTime: CAMPAIGNS_STALE_TIME,
    placeholderData: (previousData) => {
      // Keep previous rows visible while switching ranges so the table doesn't blank out.
      if (previousData && previousData.length > 0) return previousData;
      // Otherwise, try localStorage hydration for the selected range.
      if (cacheKey) return readLocalCache(cacheKey) ?? undefined;
      return undefined;
    },
  });

  const handleDateRangeChange = (range: { start: Date; end: Date; preset?: DateRangePreset }) => {
    setDateRange(buildDateRangeState(range));
  };

  const clientDateRange = useMemo(
    () => ({ since: dateRange.since, until: dateRange.until, preset: dateRange.preset }),
    [dateRange]
  );

  // Determine empty reason from error
  const emptyReason = error instanceof NotConnectedError
    ? error.reason
    : error
      ? 'error' as const
      : null;

  // Show skeleton only on first load when no data at all
  if ((!connectionReady || (isLoading && campaigns.length === 0)) && !emptyReason) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 animate-pulse rounded bg-surface-hover" />
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-hover" />
        </div>
        {/* Skeleton metric cards */}
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        {/* Skeleton table */}
        <div className="apple-card overflow-hidden">
          <table className="w-full">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={8} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold text-text-primary">
            Ads Manager
            {isFetching && campaigns.length > 0 && (
              <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            )}
          </h1>
          <div className="flex items-center gap-2">
            <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
            <RefreshButton />
          </div>
        </div>
        <AdsManagerClient
          initialCampaigns={campaigns}
          dateRange={clientDateRange}
        />
      </div>
    </div>
  );
}
