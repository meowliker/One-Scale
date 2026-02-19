'use client';

import { useEffect, useState, useCallback } from 'react';
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

export default function AdsManagerPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const [dateRange, setDateRange] = useState(() => getDateRange('today'));

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const fetchData = useCallback(async (range: { start: Date; end: Date }) => {
    setLoading(true);
    setEmptyReason(null);
    try {
      const data = await getCampaigns({
        since: formatDateInTimezone(range.start),
        until: formatDateInTimezone(range.end),
      });
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
  // Recompute "today" after store/account context is ready so timezone is correct.
  useEffect(() => {
    if (connectionReady) {
      const todayRange = getDateRange('today');
      setDateRange(todayRange);
      fetchData(todayRange);
    }
  }, [connectionReady, activeStoreId, fetchData]);

  const handleDateRangeChange = (range: { start: Date; end: Date; preset?: DateRangePreset }) => {
    setDateRange(range);
    fetchData(range);
  };

  if ((!connectionReady || loading) && campaigns.length === 0 && !emptyReason) {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Ads Manager</h1>
          <p className="text-sm text-text-secondary mt-1">Manage your Meta campaigns, ad sets, and ads</p>
        </div>
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>
      <AdsManagerClient
        initialCampaigns={campaigns}
        dateRange={{ since: formatDateInTimezone(dateRange.start), until: formatDateInTimezone(dateRange.end) }}
      />
    </div>
  );
}
