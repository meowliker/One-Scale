'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PnLSummary, PnLEntry, ProductCOGS } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnL';
import { getPnLSummary, getDailyPnL, getProducts, clearPnLCaches } from '@/services/pnl';
import { getProductPnL } from '@/services/productPnL';
import dynamic from 'next/dynamic';

const PnLDashboardClient = dynamic(
  () => import('@/components/pnl/PnLDashboardClient').then((m) => m.PnLDashboardClient),
  { ssr: false }
);
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

const emptyPnLEntry: PnLEntry = {
  date: '', revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0, netProfit: 0, margin: 0,
};

function formatLastRefreshed(date: Date | null): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes === 1) return '1 min ago';
  if (diffMinutes < 60) return `${diffMinutes} mins ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

interface PnLData {
  summary: PnLSummary;
  products: ProductCOGS[];
  dailyPnL: PnLEntry[];
  productPnL: ProductPnLData[];
}

function readPnLWarmCache(storeId: string | null): PnLData | null {
  if (!storeId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`pnl:cache:v1:${storeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as PnLData;
  } catch {
    return null;
  }
}

function writePnLWarmCache(storeId: string, payload: PnLData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`pnl:cache:v1:${storeId}`, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

async function fetchPnLData(): Promise<PnLData> {
  const [summary, products, dailyPnL, productPnL] = await Promise.all([
    getPnLSummary(),
    getProducts(),
    getDailyPnL(),
    getProductPnL(),
  ]);
  return { summary, products, dailyPnL, productPnL };
}

export default function PnLPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState('');

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;
  const queryClient = useQueryClient();
  const warmPnL = useMemo(() => readPnLWarmCache(activeStoreId), [activeStoreId]);

  // Keep the "last refreshed" label updated every 30 seconds
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setLastRefreshedLabel(formatLastRefreshed(lastRefreshed));
    }, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [lastRefreshed]);

  const {
    data,
    isLoading,
    error,
    isFetching,
  } = useQuery<PnLData, Error>({
    queryKey: ['pnl', activeStoreId],
    queryFn: async () => {
      const result = await fetchPnLData();
      const refreshedAt = new Date();
      setLastRefreshed(refreshedAt);
      setLastRefreshedLabel(formatLastRefreshed(refreshedAt));
      return result;
    },
    enabled: connectionReady && !!activeStoreId,
    initialData: warmPnL || undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (!activeStoreId || !data) return;
    writePnLWarmCache(activeStoreId, data);
  }, [activeStoreId, data]);

  const summary = data?.summary ?? {
    today: emptyPnLEntry, thisWeek: emptyPnLEntry, thisMonth: emptyPnLEntry, allTime: emptyPnLEntry,
  };
  const dailyPnL = data?.dailyPnL ?? [];
  const products = data?.products ?? [];
  const productPnL = data?.productPnL ?? [];

  const emptyReason = error instanceof NotConnectedError
    ? error.reason
    : error
      ? 'error' as const
      : null;

  const handleRefresh = useCallback(async () => {
    if (isRefreshing || isFetching) return;
    setIsRefreshing(true);
    clearPnLCaches();
    await queryClient.invalidateQueries({ queryKey: ['pnl', activeStoreId] });
    setIsRefreshing(false);
  }, [isRefreshing, isFetching, queryClient, activeStoreId]);

  if ((!connectionReady || isLoading) && dailyPnL.length === 0 && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading P&L data...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  const refreshing = isRefreshing || isFetching;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">P&amp;L Tracking</h1>
          <p className="text-gray-500 mt-1">
            Track your live profit and loss across all channels
          </p>
          {lastRefreshedLabel && (
            <p className="text-xs text-gray-400 mt-1">
              Last refreshed: {lastRefreshedLabel}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 bg-white text-gray-600 hover:text-gray-900 hover:bg-gray-50 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <PnLDashboardClient
        summary={summary}
        dailyPnL={dailyPnL}
        products={products}
        productPnL={productPnL}
        productType={summary.productType || 'physical'}
      />
    </div>
  );
}
