'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { mockDayPartingData } from '@/data/mockDayParting';
import type { DayPartingCell } from '@/data/mockDayParting';
import { DayPartingClient } from '@/components/day-parting/DayPartingClient';

export default function DayPartingPage() {
  const [data, setData] = useState<DayPartingCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchData = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);

    // For now, use mock data with a small delay
    // Later this will use getHourlyPnL() service
    await new Promise(resolve => setTimeout(resolve, 500));
    setData(mockDayPartingData);

    if (isManual) setIsRefreshing(false);
    else setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading day-parting data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div /> {/* Title is inside DayPartingClient */}
        <button
          onClick={() => fetchData(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      <DayPartingClient data={data} />
    </div>
  );
}
