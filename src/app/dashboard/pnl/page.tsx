'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { PnLSummary, PnLEntry, ProductCOGS, HourlyPnLEntry } from '@/types/pnl';
import type { ProductPnLData } from '@/types/productPnl';
import { getPnLSummary, getDailyPnL, getProducts, getHourlyPnL, clearPnLCaches } from '@/services/pnl';
import { getProductPnL } from '@/services/productPnl';
import { PnLDashboardClient } from '@/components/pnl/PnLDashboardClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { StoreHealthBanner } from '@/components/pnl/StoreHealthBanner';

interface PnLCachePayload {
  summary: PnLSummary;
  dailyPnL: PnLEntry[];
  products: ProductCOGS[];
  productPnL: ProductPnLData[];
  lastRefreshedIso: string | null;
  currency?: string;
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

const emptySummary: PnLSummary = {
  today: emptyPnLEntry, thisWeek: emptyPnLEntry, thisMonth: emptyPnLEntry, allTime: emptyPnLEntry,
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

/**
 * Fetch the store's currency from the store-config API.
 */
async function fetchStoreCurrency(storeId: string): Promise<string> {
  try {
    const res = await fetch(`/api/settings/store-config?storeId=${encodeURIComponent(storeId)}`);
    if (!res.ok) return 'USD';
    const json = await res.json() as { ok?: boolean; config?: { currency?: string } };
    return json.config?.currency || 'USD';
  } catch {
    return 'USD';
  }
}

export default function PnLPage() {
  const [summary, setSummary] = useState<PnLSummary>(emptySummary);
  const [dailyPnL, setDailyPnL] = useState<PnLEntry[]>([]);
  const [products, setProducts] = useState<ProductCOGS[]>([]);
  const [productPnL, setProductPnL] = useState<ProductPnLData[]>([]);
  const [hourlyPnL, setHourlyPnL] = useState<HourlyPnLEntry[]>([]);
  const [currency, setCurrency] = useState<string>('USD');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [lastRefreshedLabel, setLastRefreshedLabel] = useState('');
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);
  const latestProductPnLRef = useRef<ProductPnLData[]>([]);
  const latestDailyPnLRef = useRef<PnLEntry[]>([]);
  const latestLastRefreshedRef = useRef<Date | null>(null);
  const [productRefreshKey, setProductRefreshKey] = useState(0);

  // Track the storeId that data was fetched for, to prevent stale updates
  const fetchStoreIdRef = useRef<string>('');
  // Track previous activeStoreId to detect switches
  const prevStoreIdRef = useRef<string>('');

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  // Connection status starts as null before the first refreshStatus() call resolves.
  const connectionReady = !connectionLoading && connectionStatus !== null;

  // ── Store switch: keep showing old data with loading indicator, don't wipe ──
  useEffect(() => {
    if (prevStoreIdRef.current && prevStoreIdRef.current !== activeStoreId) {
      // Don't clear data — keep showing previous store's data as skeleton
      // New data replaces it as soon as it arrives (no blank screen)
      setLoading(true);
      setEmptyReason(null);

      // Try to instantly show cached data for the new store
      if (activeStoreId) {
        const cached = readPnLCache(activeStoreId);
        if (cached) {
          setSummary(cached.summary);
          setDailyPnL(cached.dailyPnL);
          setProducts(cached.products);
          setProductPnL(cached.productPnL);
          if (cached.currency) setCurrency(cached.currency);
          setLoading(false);
        }
      }
    }
    prevStoreIdRef.current = activeStoreId;
  }, [activeStoreId]);

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
    if (cached.currency) setCurrency(cached.currency);
    const refreshedDate = cached.lastRefreshedIso ? new Date(cached.lastRefreshedIso) : null;
    setLastRefreshed(refreshedDate);
    setLastRefreshedLabel(formatLastRefreshed(refreshedDate));
    setLoading(false);
  }, [connectionReady, activeStoreId]);

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (!activeStoreId) return;

    // Track which store this fetch is for — used to discard stale responses
    const fetchForStore = activeStoreId;
    fetchStoreIdRef.current = fetchForStore;

    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setEmptyReason(null);

    // Helper: check if this fetch is still for the active store
    const isStale = () => fetchStoreIdRef.current !== fetchForStore;

    try {
      // Fetch store currency alongside fast-path data
      const [s, p, storeCurrency] = await Promise.all([
        getPnLSummary(),
        getProducts(),
        fetchStoreCurrency(fetchForStore),
      ]);

      // Discard results if store switched during fetch
      if (isStale()) return;

      setSummary(s);
      setProducts(p);
      setCurrency(storeCurrency);
      setDailyPnL((prev) => mergeTodayIntoDaily(prev, s.today));
      if (!isManualRefresh) {
        setLoading(false);
      }

      // Background: refresh full daily history (previous days + today)
      getDailyPnL()
        .then((d) => {
          if (isStale()) return;
          const refreshedAt = new Date();
          setDailyPnL(d);
          setLastRefreshed(refreshedAt);
          setLastRefreshedLabel(formatLastRefreshed(refreshedAt));
          writePnLCache(fetchForStore, {
            summary: s,
            dailyPnL: d,
            products: p,
            productPnL: latestProductPnLRef.current,
            lastRefreshedIso: refreshedAt.toISOString(),
            currency: storeCurrency,
          });
        })
        .catch((dailyErr) => {
          console.warn('[P&L] Daily refresh failed (non-fatal):', dailyErr instanceof Error ? dailyErr.message : dailyErr);
        });

      // Hourly P&L refreshes in background.
      getHourlyPnL()
        .then((h) => { if (!isStale()) setHourlyPnL(h); })
        .catch(() => {});

      // Product P&L also refreshes in background.
      getProductPnL()
        .then((pp) => {
          if (isStale()) return;
          setProductPnL(pp);
          const lastRef = latestLastRefreshedRef.current;
          if (lastRef) {
            writePnLCache(fetchForStore, {
              summary: s,
              dailyPnL: latestDailyPnLRef.current,
              products: p,
              productPnL: pp,
              lastRefreshedIso: lastRef.toISOString(),
              currency: storeCurrency,
            });
          }
        })
        .catch((ppErr) => {
          console.warn('[P&L] Product P&L failed (non-fatal):', ppErr instanceof Error ? ppErr.message : ppErr);
          if (isStale()) return;
          const lastRef = latestLastRefreshedRef.current;
          if (lastRef) {
            writePnLCache(fetchForStore, {
              summary: s,
              dailyPnL: latestDailyPnLRef.current,
              products: p,
              productPnL: latestProductPnLRef.current,
              lastRefreshedIso: lastRef.toISOString(),
              currency: storeCurrency,
            });
          }
        });
    } catch (err) {
      if (isStale()) return;
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
    } finally {
      if (!isStale()) {
        if (isManualRefresh) {
          setIsRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }
  }, [activeStoreId]);

  // Wait for connection status to be fully loaded before fetching P&L data.
  useEffect(() => {
    if (connectionReady) {
      fetchData(false);
    }
  }, [connectionReady, activeStoreId, fetchData]);

  // ── Auto-poll live data every 30s (Shopify-style real-time updates) ──────────
  // Polls snapshot DB for updates from webhooks/crons. CRITICAL: never downgrade
  // fresh Shopify API data (from getDailyPnL) with stale snapshot data.
  // Only accept poll data if it shows MORE activity (higher orders/revenue).
  useEffect(() => {
    if (!activeStoreId || !connectionReady) return;

    let active = true;
    let lastSyncedAt = '';

    const pollLive = async () => {
      if (!active || document.hidden) return;

      try {
        const res = await fetch(
          `/api/pnl/sync?storeId=${encodeURIComponent(activeStoreId)}&days=1`
        );
        if (!res.ok || !active) return;
        const json = await res.json() as {
          data?: PnLEntry[];
          meta?: { lastSyncedAt: string | null };
        };

        // Discard if store switched during fetch
        if (!active || fetchStoreIdRef.current !== activeStoreId) return;

        const entries = json.data || [];
        if (entries.length === 0) return;

        // Skip if snapshot hasn't been updated since last poll
        const newSyncedAt = json.meta?.lastSyncedAt || '';
        if (newSyncedAt && newSyncedAt === lastSyncedAt) return;
        lastSyncedAt = newSyncedAt;

        // Merge snapshot entries — NEVER downgrade fresh data
        setDailyPnL(prev => {
          let changed = false;
          const next = [...prev];
          for (const entry of entries) {
            const idx = next.findIndex(d => d.date === entry.date);
            if (idx >= 0) {
              const existing = next[idx];
              // CRITICAL: getDailyPnL() fetches directly from Shopify API (fresh).
              // Snapshot data may be stale (last sync hours ago). Only accept the
              // snapshot update if it shows MORE orders or MORE revenue — meaning
              // a webhook/cron has processed new data since our initial load.
              // Only skip if snapshot data is identical (no change since last poll).
              // Don't block revenue decreases — they could be legitimate refunds.
              const pollOrders = entry.orderCount ?? 0;
              const currOrders = existing.orderCount ?? 0;
              if (
                pollOrders === currOrders &&
                Math.abs(entry.revenue - existing.revenue) < 0.01 &&
                Math.abs(entry.adSpend - existing.adSpend) < 0.01 &&
                Math.abs(entry.fees - existing.fees) < 0.01
              ) {
                continue; // No change — skip re-render
              }
              next[idx] = entry;
              changed = true;
            } else {
              next.push(entry);
              changed = true;
            }
          }
          if (!changed) return prev;
          return next.sort((a, b) => a.date.localeCompare(b.date));
        });

        const now = new Date();
        setLastRefreshed(now);
        setLastRefreshedLabel(formatLastRefreshed(now));
        // Trigger product performance refresh when live data changes
        setProductRefreshKey(k => k + 1);
      } catch {
        // Silent — retry on next interval
      }
    };

    // Start polling after initial data loads (10s delay to let getDailyPnL finish)
    const startTimeout = setTimeout(pollLive, 10_000);
    const interval = setInterval(pollLive, 30_000);

    // Poll immediately when tab regains focus
    const onVisibility = () => { if (!document.hidden) pollLive(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      clearTimeout(startTimeout);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeStoreId, connectionReady]);

  const handleRefresh = () => {
    if (!isRefreshing) {
      clearPnLCaches(); // Force fresh fee + order data on manual refresh
      fetchData(true);
    }
  };

  if ((!connectionReady || loading) && dailyPnL.length === 0 && !emptyReason) {
    return (
      <div className="space-y-5 animate-pulse">
        {/* Skeleton: summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-24 rounded-xl bg-surface-secondary/60" />
          ))}
        </div>
        {/* Skeleton: chart area */}
        <div className="h-64 rounded-xl bg-surface-secondary/60" />
        {/* Skeleton: product table */}
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-surface-secondary/40" />
          ))}
        </div>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <div className="space-y-5">
      <StoreHealthBanner />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary tracking-tight">Profit & Loss</h1>
          {lastRefreshedLabel && (
            <p className="text-xs text-text-secondary mt-0.5">
              Updated {lastRefreshedLabel}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <PnLDashboardClient
        summary={summary}
        dailyPnL={dailyPnL}
        products={products}
        productPnL={productPnL}
        productType={summary.productType || 'physical'}
        hourlyPnL={hourlyPnL}
        currency={currency}
        refreshKey={productRefreshKey}
      />
    </div>
  );
}
