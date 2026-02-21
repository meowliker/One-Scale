'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import type { Campaign } from '@/types/campaign';
import type { DateRangePreset } from '@/types/analytics';
import { getCampaigns } from '@/services/adsManager';
import { AdsManagerClient } from '@/components/ads-manager/AdsManagerClient';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

/**
 * Store date range as Date objects (for DateRangePicker) together with pre-computed
 * YYYY-MM-DD strings (for API calls and AdsManagerClient). Computing the strings
 * at the same time the Date objects are created ensures the store timezone is
 * consistent — avoids the double-timezone bug where Date objects are created
 * with one timezone and formatted later with a different one.
 */
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

export default function AdsManagerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeState | null>(null);
  const didInitialFetchRef = useRef(false);

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  /**
   * Two-phase campaign loading:
   * Phase 1: Load instantly from server-side snapshot cache (preferCache=1).
   *          This returns cached data from meta_endpoint_snapshots in <200ms.
   * Phase 2: Background refresh with live Meta API data.
   *          Updates campaigns silently without showing a loading spinner.
   */
  const fetchData = useCallback(async (since: string, until: string, opts?: { isInitial?: boolean }) => {
    const isInitial = opts?.isInitial ?? false;

    if (isInitial) {
      // Phase 1: Try cached data first for instant load
      setLoading(true);
      setEmptyReason(null);
      try {
        const cached = await getCampaigns({ since, until }, { preferCache: true });
        if (cached.length > 0) {
          setCampaigns(cached);
          setLoading(false);
          // Phase 2: Background refresh with live data (no loading spinner)
          getCampaigns({ since, until }).then((live) => {
            setCampaigns(live);
          }).catch(() => {
            // Keep cached data on background refresh failure
          });
          return;
        }
      } catch {
        // Cache miss — fall through to live fetch
      }
    }

    // Direct live fetch (used when no cache, date range change, or manual refresh)
    setLoading(true);
    setEmptyReason(null);
    try {
      const data = await getCampaigns({ since, until });
      setCampaigns(data);
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Wait for connection status to be fully loaded before fetching data.
  // Compute date range here (not in useState) so store timezone is correct.
  useEffect(() => {
    if (connectionReady && !didInitialFetchRef.current) {
      didInitialFetchRef.current = true;
      const range = getDateRange('today');
      const state = buildDateRangeState(range);
      setDateRange(state);
      fetchData(state.since, state.until, { isInitial: true });
    }
  }, [connectionReady, activeStoreId, fetchData]);

  // Re-fetch when store changes
  useEffect(() => {
    if (connectionReady && dateRange && didInitialFetchRef.current) {
      // Reset for re-fetch on store change
      didInitialFetchRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId]);

  const handleDateRangeChange = (range: { start: Date; end: Date; preset?: DateRangePreset }) => {
    const state = buildDateRangeState(range);
    setDateRange(state);
    // Date range change = live fetch (no cache for new ranges)
    fetchData(state.since, state.until);
  };

  // Memoize the dateRange prop for AdsManagerClient to avoid unnecessary re-renders
  const clientDateRange = useMemo(
    () => dateRange ? { since: dateRange.since, until: dateRange.until } : undefined,
    [dateRange?.since, dateRange?.until]
  );

  if ((!connectionReady || loading || !dateRange) && campaigns.length === 0 && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading campaigns...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <div>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#1d1d1f]">Ads Manager</h1>
            <p className="text-sm mt-1 text-[#86868b]">Manage your Meta campaigns, ad sets, and ads</p>
          </div>
          {dateRange && (
            <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
          )}
        </div>
        <AdsManagerClient
          initialCampaigns={campaigns}
          dateRange={clientDateRange}
        />
      </div>
    </div>
  );
}
