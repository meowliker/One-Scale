'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PnLSummary, PnLEntry, ProductCOGS } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnL';
import { getPnLSummary, getDailyPnL, getProducts, clearPnLCaches } from '@/services/pnl';
import { getProductPnL } from '@/services/productPnL';
import { PnLDashboardClient } from '@/components/pnl/PnLDashboardClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

interface PnLCachePayload {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL: ProductPnLData[];
  lastRefreshedIso: string | null;
}

function getPnLCacheKey(storeId: string): string {
  return `pnl:cache:${storeId}`;
}

function readPnLCache(storeId: string): PnLCachePayload | null {
  try {
    const raw = localStorage.getItem(getPnLCacheKey(storeId));
    if (!raw) return null;
    return JSON.parse(raw) as PnLCachePayload;
  } catch {
    return null;
  }
}

function writePnLCache(storeId: string, payload: PnLCachePayload): void {
  try {
    localStorage.setItem(getPnLCacheKey(storeId), JSON.stringify(payload));
  } catch {
    // Ignore localStorage quota/security errors
  }
}

function mergeTodayIntoDaily(existing: PnLEntry[], todayEntry: PnLEntry): PnLEntry[] {
  const idx = existing.findIndex((d) => d.date === todayEntry.date);
  if (idx === -1) {
    return [...existing, todayEntry].sort((a, b) => a.date.localeCompare(b.date));
  }
  const next = [...existing];
  next[idx] = { ...next[idx], ...todayEntry };
  return next;
}

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

export default function PnLPage() {
  const [summary, setSummary] = useState<PnLSummary>({
    today: emptyPnLEntry, thisWeek: emptyPnLEntry, thisMonth: emptyPnLEntry, allTime: emptyPnLEntry,
  });
  const [dailyPnL, setDailyPnL] = useState<PnLEntry[]>([]);
  const [products, setProducts] = useState<ProductCOGS[]>([]);
  const [productPnL, setProductPnL] = useState<ProductPnLData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState('');
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const latestProductPnLRef = useRef<ProductPnLData[]>([]);
  const latestDailyPnLRef = useRef<PnLEntry[]>([]);
  const latestLastRefreshedRef = useRef<Date | null>(null);

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  // Connection status starts as null before the first refreshStatus() call resolves.
  // We must wait for it to be populated before fetching data, otherwise service
  // functions will see null status and throw NotConnectedError, causing either
  // a flash of the empty state or (previously) a flash of mock data.
  const connectionReady = !connectionLoading && connectionStatus !== null;

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

  useEffect(() => {
    latestProductPnLRef.current = productPnL;
  }, [productPnL]);

  useEffect(() => {
    latestDailyPnLRef.current = dailyPnL;
  }, [dailyPnL]);

  useEffect(() => {
    latestLastRefreshedRef.current = lastRefreshed;
  }, [lastRefreshed]);

  // Hydrate from last fetched local cache first for instant paint on load.
  useEffect(() => {
    if (!connectionReady || !activeStoreId) return;
    const cached = readPnLCache(activeStoreId);
    if (!cached) return;

    setSummary(cached.summary);
    setDailyPnL(cached.dailyPnL);
    setProducts(cached.products);
    setProductPnL(cached.productPnL);
    const refreshedDate = cached.lastRefreshedIso ? new Date(cached.lastRefreshedIso) : null;
    setLastRefreshed(refreshedDate);
    setLastRefreshedLabel(formatLastRefreshed(refreshedDate));
    setLoading(false);
  }, [connectionReady, activeStoreId]);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setEmptyReason(null);
    try {
      // Fast path on normal loads:
      // - refresh LIVE today values first (summary)
      // - keep historical days from cache/state
      // - backfill full daily in background
      const [s, p] = await Promise.all([
        getPnLSummary(),
        getProducts(),
      ]);
      setSummary(s);
      setProducts(p);
      setDailyPnL((prev) => mergeTodayIntoDaily(prev, s.today));
      if (!isManualRefresh) {
        setLoading(false);
      }

      // Background: refresh full daily history (previous days + today)
      getDailyPnL()
        .then((d) => {
          const refreshedAt = new Date();
          setDailyPnL(d);
          setLastRefreshed(refreshedAt);
          setLastRefreshedLabel(formatLastRefreshed(refreshedAt));
          if (activeStoreId) {
            writePnLCache(activeStoreId, {
              summary: s,
              dailyPnL: d,
              products: p,
              productPnL: latestProductPnLRef.current,
              lastRefreshedIso: refreshedAt.toISOString(),
            });
          }
        })
        .catch((dailyErr) => {
          console.warn('[P&L] Daily refresh failed (non-fatal):', dailyErr instanceof Error ? dailyErr.message : dailyErr);
        });

      // Product P&L also refreshes in background.
      getProductPnL()
        .then((pp) => {
          setProductPnL(pp);
          const lastRef = latestLastRefreshedRef.current;
          if (activeStoreId && lastRef) {
            writePnLCache(activeStoreId, {
              summary: s,
              dailyPnL: latestDailyPnLRef.current,
              products: p,
              productPnL: pp,
              lastRefreshedIso: lastRef.toISOString(),
            });
          }
        })
        .catch((ppErr) => {
          console.warn('[P&L] Product P&L failed (non-fatal):', ppErr instanceof Error ? ppErr.message : ppErr);
          const lastRef = latestLastRefreshedRef.current;
          if (activeStoreId && lastRef) {
            writePnLCache(activeStoreId, {
              summary: s,
              dailyPnL: latestDailyPnLRef.current,
              products: p,
              productPnL: latestProductPnLRef.current,
              lastRefreshedIso: lastRef.toISOString(),
            });
          }
        });
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
    } finally {
      if (isManualRefresh) {
        setIsRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [activeStoreId]);

  // Wait for connection status to be fully loaded before fetching P&L data.
  // This prevents mock/fake data from flashing before real data arrives.
  useEffect(() => {
    if (connectionReady) {
      fetchData(false);
    }
  }, [connectionReady, activeStoreId, fetchData]);

  const handleRefresh = () => {
    if (!isRefreshing) {
      clearPnLCaches(); // Force fresh fee + order data on manual refresh
      fetchData(true);
    }
  };

  if ((!connectionReady || loading) && dailyPnL.length === 0 && !emptyReason) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">P&L Tracking</h1>
          <p className="text-sm text-text-secondary">
            Track your live profit and loss across all channels
          </p>
          {lastRefreshedLabel && (
            <p className="text-xs text-text-muted mt-1">
              Last refreshed: {lastRefreshedLabel}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-surface-elevated text-text-secondary hover:text-text-primary hover:bg-surface-elevated/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
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
