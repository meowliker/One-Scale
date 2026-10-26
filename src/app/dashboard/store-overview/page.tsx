'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CircleDollarSign,
  Coins,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Store,
  TrendingUp,
} from 'lucide-react';
import type { DateRangePreset } from '@/types/analytics';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { STORE_REPORTING_TIMEZONE, storeDayInTimezone } from '@/lib/timezone';
import { createRefreshRunner, refreshError, refreshRanges, refreshStoreRange, type RefreshProgress } from '@/lib/store-overview-refresh';
import { useStoreStore } from '@/stores/storeStore';

type StoreOverviewRow = {
  storeId: string;
  storeName: string;
  domain: string;
  productType: 'physical' | 'digital';
  revenue: number;
  adSpend: number;
  cogs: number;
  fees: number;
  shipping: number;
  refunds: number;
  fullRefundAmount: number;
  partialRefundAmount: number;
  netProfit: number;
  margin: number;
  roas: number;
  aov: number;
  orders: number;
  cpc: number;
  cpm: number;
  clicks: number;
  impressions: number;
  lastSyncedAt: string | null;
  hasData: boolean;
  error: string | null;
  missingDays: number;
  adMetricsAvailable: boolean;
};

type StoreOverviewResponse = {
  preset: DateRangePreset;
  since: string;
  until: string;
  stores: StoreOverviewRow[];
  totals: Omit<StoreOverviewRow, 'storeId' | 'storeName' | 'domain' | 'lastSyncedAt' | 'productType' | 'hasData' | 'error' | 'missingDays' | 'adMetricsAvailable'>;
  generatedAt: string;
};

type StoreOverviewRange = {
  start: Date;
  end: Date;
  preset?: DateRangePreset;
};

function money(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value || 0);
}

function num(value: number): string {
  return new Intl.NumberFormat('en-US').format(value || 0);
}

function pct(value: number): string {
  return `${(value || 0).toFixed(2)}%`;
}

function ratio(value: number): string {
  return `${(value || 0).toFixed(2)}x`;
}

function relativeDate(iso: string | null): string {
  if (!iso) return 'Not synced';
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff) || diff < 0) return 'Just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function rangeStart(range: StoreOverviewRange): string {
  return storeDayInTimezone(range.start, STORE_REPORTING_TIMEZONE);
}

function rangeEnd(range: StoreOverviewRange): string {
  return storeDayInTimezone(range.end, STORE_REPORTING_TIMEZONE);
}

function rangeCacheKey(range: StoreOverviewRange): string {
  const preset = range.preset || 'custom';
  return `${preset}:${rangeStart(range)}:${rangeEnd(range)}`;
}

function storeOverviewUrl(range: StoreOverviewRange): string {
  const params = new URLSearchParams();
  params.set('since', rangeStart(range));
  params.set('until', rangeEnd(range));
  if (range.preset && range.preset !== 'custom') {
    params.set('preset', range.preset);
  }
  return `/api/dashboard/store-overview?${params.toString()}`;
}

async function fetchStoreOverview(range: StoreOverviewRange): Promise<StoreOverviewResponse> {
  const res = await fetch(storeOverviewUrl(range), {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to fetch store overview');
  }
  return res.json();
}

function writeStoreOverviewWarmCache(scopeId: string, cacheKey: string, payload: StoreOverviewResponse): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`store-overview:cache:v2:${scopeId}:${cacheKey}`, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

export default function StoreOverviewPage() {
  const [dateRange, setDateRange] = useState<StoreOverviewRange>(() => getDateRange('lastMonth'));
  const [hasHydrated, setHasHydrated] = useState(false);
  const [includeMeta, setIncludeMeta] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<Record<string, RefreshProgress>>({});
  const [refreshFailure, setRefreshFailure] = useState<string | null>(null);
  const refreshLock = useRef(false);
  const completedBatches = useRef(new Map<string, { warning?: string }>());
  const checkpointScope = useRef('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const cacheKey = useMemo(() => rangeCacheKey(dateRange), [dateRange]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['store-overview', cacheKey],
    queryFn: () => fetchStoreOverview(dateRange),
    enabled: hasHydrated,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (!activeStoreId || !data) return;
    writeStoreOverviewWarmCache(activeStoreId, cacheKey, data);
  }, [activeStoreId, cacheKey, data]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  async function handleRefresh(onlyStoreId?: string) {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    setRefreshFailure(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const ranges = refreshRanges(rangeStart(dateRange), rangeEnd(dateRange));
      const scope = `${cacheKey}:${includeMeta}`;
      if (!onlyStoreId || checkpointScope.current !== scope) completedBatches.current.clear();
      checkpointScope.current = scope;
      const latest = await refetch();
      if (latest.error || !latest.data) throw latest.error || new Error('Could not load stores.');
      const targets = latest.data.stores.filter(store => !onlyStoreId || store.storeId === onlyStoreId);
      setRefreshStatus(previous => ({ ...(onlyStoreId ? previous : {}), ...Object.fromEntries(targets.map(store => [store.storeId, { state: 'queued', message: 'Waiting to sync' }])) }));
      let index = 0;
      const worker = async () => {
        while (index < targets.length && !abort.signal.aborted) {
          const store = targets[index++];
          const update = (state: RefreshProgress['state'], message: string) => {
            if (!abort.signal.aborted) setRefreshStatus(previous => ({ ...previous, [store.storeId]: { state, message } }));
          };
          let phase = 'Starting sync';
          const run = createRefreshRunner(completedBatches.current, abort.signal,
            attempt => update('syncing', `${phase} · Temporary failure, retrying (${attempt}/3)`));
          try {
            const result = await refreshStoreRange(ranges, (step, range, metaSynced) =>
              run({ storeId: store.storeId, step, ...range, metaSynced }),
            message => { phase = message; update('syncing', message); }, includeMeta);
            update(result.warnings.length ? 'warning' : 'success', result.warnings.length
              ? `Shopify updated. ${result.warnings.join(' ')}`
              : includeMeta ? 'Shopify and Meta reports updated' : 'Shopify revenue, orders and reports updated');
            // Make each completed store visible without waiting for every store.
            if (!abort.signal.aborted) await refetch();
          } catch (error) {
            update('error', `${phase}: ${refreshError(error)}`);
          }
        }
      };
      // Keep one store in flight to avoid bursts of long-running sync requests.
      await worker();
      if (!abort.signal.aborted) await refetch();
    } catch (error) {
      if (!abort.signal.aborted) setRefreshFailure(refreshError(error));
    } finally {
      refreshLock.current = false;
      if (!abort.signal.aborted) setRefreshing(false);
    }
  }

  const statuses = Object.values(refreshStatus);
  const syncedCount = statuses.filter(status => status.state === 'success' || status.state === 'warning').length;
  const failedCount = statuses.filter(status => status.state === 'error').length;
  const warningCount = statuses.filter(status => status.state === 'warning').length;
  const pendingCount = statuses.length - syncedCount - failedCount;
  const stores = data?.stores || [];
  const totals = data?.totals;
  const adTotalsAvailable = stores.every(row => row.hasData && row.adMetricsAvailable);
  const showPhysicalOnlyColumns = stores.some((row) => row.productType !== 'digital');

  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-3xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-hover px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <Sparkles className="h-3.5 w-3.5" /> Multi-Store Profit Hub
            </p>
            <h1 className="mt-3 text-3xl font-bold leading-tight text-text-primary">Store Overview</h1>
            <p className="mt-1 text-sm text-text-secondary">A single page to track revenue, profit, spend, ROAS, AOV, CPC, CPM across all stores.</p>
          </div>
          <div className="flex items-center gap-2">
            <fieldset disabled={refreshing}>
              <DateRangePicker
                dateRange={dateRange}
                onRangeChange={(range) => { if (!refreshLock.current) { setDateRange(range); setRefreshStatus({}); setRefreshFailure(null); } }}
              />
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input type="checkbox" checked={includeMeta} disabled={refreshing} onChange={event => setIncludeMeta(event.target.checked)} />
              Include Meta ad spend
            </label>
            <button
              disabled={refreshing || isLoading}
              onClick={() => void handleRefresh()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-secondary hover:bg-surface-hover"
            >
              <RefreshCw className={`h-4 w-4 ${hasHydrated && (isFetching || refreshing) ? 'animate-spin' : ''}`} />
              {refreshing ? 'Syncing stores…' : 'Refresh'}
            </button>
          </div>
        </div>
      </section>

      {(refreshFailure || Object.keys(refreshStatus).length > 0) && (
        <section aria-live="polite" className="space-y-2 rounded-2xl border border-border bg-surface p-4 text-sm">
          <p className="font-semibold">{refreshing ? 'Syncing stores' : 'Refresh results'} · {syncedCount}/{statuses.length} synced{warningCount > 0 && ` · ${warningCount} with warnings`}{failedCount > 0 && ` · ${failedCount} failed`}{pendingCount > 0 && ` · ${pendingCount} remaining`}</p>
          <p className="text-xs text-text-muted">Keep this page open until syncing finishes. Reports use estimated transaction fees; refunds use the saved payment transactions.</p>
          {refreshFailure && <p role="alert" className="text-red-600 dark:text-red-300">{refreshFailure}</p>}
          {Object.entries(refreshStatus).map(([storeId, status]) => (
            <div key={storeId} className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
              <p className={status.state === 'error' ? 'text-red-600 dark:text-red-300' : status.state === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-text-secondary'}>
                <span className="font-semibold">{stores.find(store => store.storeId === storeId)?.storeName || storeId}:</span> {status.message}
              </p>
              {(status.state === 'error' || (status.state === 'warning' && includeMeta)) && <button disabled={refreshing} onClick={() => void handleRefresh(storeId)} className="rounded border border-border px-3 py-1 disabled:opacity-50">Retry store</button>}
            </div>
          ))}
        </section>
      )}

      {(stores.some(store => !store.hasData || store.error || store.missingDays > 0) || Object.values(refreshStatus).some(status => status.state === 'error')) && (
        <p role="status" className="rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          Totals may be incomplete or out of date. Some stores have missing reports or could not be synced for the selected dates. Check the errors and retry.
        </p>
      )}

      {stores.some(row => row.hasData && !row.adMetricsAvailable) && (
        <p className="rounded-xl border border-border bg-surface p-3 text-sm text-text-secondary">
          Shopify figures are available independently. Ad spend, net profit, margin and ad performance show “—” where Meta was not synced. Enable “Include Meta ad spend” to update them.
        </p>
      )}

      {hasHydrated && isLoading && (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-border bg-surface-elevated">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-300/35 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {refreshError(error)}
        </div>
      )}

      {!isLoading && totals && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard icon={<CircleDollarSign className="h-4 w-4" />} label="Revenue" value={money(totals.revenue)} tone="emerald" />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Ad Spend" value={adTotalsAvailable ? money(totals.adSpend) : '—'} tone="sky" />
            <KpiCard icon={<Coins className="h-4 w-4" />} label="Net Profit" value={adTotalsAvailable ? money(totals.netProfit) : '—'} tone="amber" />
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="ROAS" value={adTotalsAvailable ? ratio(totals.roas) : '—'} tone="violet" />
            <KpiCard icon={<ShoppingCart className="h-4 w-4" />} label="AOV" value={money(totals.aov)} tone="pink" />
            <KpiCard icon={<Store className="h-4 w-4" />} label="Orders" value={num(totals.orders)} tone="cyan" />
          </section>

          <section className="hidden rounded-2xl border border-border bg-surface shadow-sm md:block">
            <div className="overflow-auto">
              <table className="min-w-[1420px] w-full text-sm">
                <thead className="bg-surface-hover text-left text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3">Revenue</th>
                    <th className="px-4 py-3">Ad Spend</th>
                    {showPhysicalOnlyColumns && <th className="px-4 py-3">COGS</th>}
                    <th className="px-4 py-3">Fees</th>
                    {showPhysicalOnlyColumns && <th className="px-4 py-3">Shipping</th>}
                    <th className="px-4 py-3">Refunds</th>
                    <th className="px-4 py-3">Net Profit</th>
                    <th className="px-4 py-3">Margin</th>
                    <th className="px-4 py-3">ROAS</th>
                    <th className="px-4 py-3">AOV</th>
                    <th className="px-4 py-3">Orders</th>
                    <th className="px-4 py-3">CPC</th>
                    <th className="px-4 py-3">CPM</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((row, idx) => (
                    <tr key={row.storeId} className={idx % 2 === 0 ? 'border-t border-border bg-surface' : 'border-t border-border bg-surface-hover/60'}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-text-primary">{row.storeName}</p>
                        <p className="text-xs text-text-muted">{row.domain}</p>
                        {(row.error || row.missingDays > 0) && <p className="mt-1 max-w-xs text-xs text-amber-700 dark:text-amber-300">{row.error || `${row.missingDays} day(s) missing reports`}</p>}
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600 dark:text-emerald-300">{row.hasData ? money(row.revenue) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData && row.adMetricsAvailable ? money(row.adSpend) : '—'}</td>
                      {showPhysicalOnlyColumns && <td className="px-4 py-3">{row.hasData ? money(row.cogs) : '—'}</td>}
                      <td className="px-4 py-3">{row.hasData ? money(row.fees) : '—'}</td>
                      {showPhysicalOnlyColumns && <td className="px-4 py-3">{row.hasData ? money(row.shipping) : '—'}</td>}
                      <td className="px-4 py-3">
                        <p>{row.hasData ? money(row.refunds) : '—'}</p>
                        {(row.fullRefundAmount > 0 || row.partialRefundAmount > 0) && (
                          <p className="text-[11px] text-text-muted">
                            F {row.hasData ? money(row.fullRefundAmount) : '—'} / P {row.hasData ? money(row.partialRefundAmount) : '—'}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-text-primary">{row.hasData && row.adMetricsAvailable ? money(row.netProfit) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData && row.adMetricsAvailable ? pct(row.margin) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData && row.adMetricsAvailable ? ratio(row.roas) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData ? money(row.aov) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData ? num(row.orders) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData && row.adMetricsAvailable ? money(row.cpc) : '—'}</td>
                      <td className="px-4 py-3">{row.hasData && row.adMetricsAvailable ? money(row.cpm) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-text-muted">{relativeDate(row.lastSyncedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3 md:hidden">
            {stores.map((row) => (
              <div key={row.storeId} className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-text-primary">{row.storeName}</p>
                    <p className="text-xs text-text-muted">{row.domain}</p>
                    {(row.error || row.missingDays > 0) && <p className="mt-1 max-w-xs text-xs text-amber-700 dark:text-amber-300">{row.error || `${row.missingDays} day(s) missing reports`}</p>}
                  </div>
                  <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{relativeDate(row.lastSyncedAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-text-secondary">
                  <p>Revenue: <span className="font-semibold text-emerald-600 dark:text-emerald-300">{row.hasData ? money(row.revenue) : '—'}</span></p>
                  <p>Ad Spend: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? money(row.adSpend) : '—'}</span></p>
                  {showPhysicalOnlyColumns && (
                    <p>COGS: <span className="font-medium">{row.hasData ? money(row.cogs) : '—'}</span></p>
                  )}
                  <p>Fees: <span className="font-medium">{row.hasData ? money(row.fees) : '—'}</span></p>
                  {showPhysicalOnlyColumns && (
                    <p>Shipping: <span className="font-medium">{row.hasData ? money(row.shipping) : '—'}</span></p>
                  )}
                  <p>Refunds: <span className="font-medium">{row.hasData ? money(row.refunds) : '—'}</span></p>
                  <p>Net Profit: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? money(row.netProfit) : '—'}</span></p>
                  <p>Margin: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? pct(row.margin) : '—'}</span></p>
                  <p>ROAS: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? ratio(row.roas) : '—'}</span></p>
                  <p>AOV: <span className="font-medium">{row.hasData ? money(row.aov) : '—'}</span></p>
                  <p>Orders: <span className="font-medium">{row.hasData ? num(row.orders) : '—'}</span></p>
                  <p>CPC: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? money(row.cpc) : '—'}</span></p>
                  <p>CPM: <span className="font-medium">{row.hasData && row.adMetricsAvailable ? money(row.cpm) : '—'}</span></p>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'sky' | 'amber' | 'violet' | 'pink' | 'cyan';
}) {
  const toneMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-700 border-emerald-300/40 dark:text-emerald-300',
    sky: 'bg-blue-500/10 text-blue-700 border-blue-300/40 dark:text-blue-300',
    amber: 'bg-amber-500/10 text-amber-700 border-amber-300/40 dark:text-amber-300',
    violet: 'bg-indigo-500/10 text-indigo-700 border-indigo-300/40 dark:text-indigo-300',
    pink: 'bg-rose-500/10 text-rose-700 border-rose-300/40 dark:text-rose-300',
    cyan: 'bg-cyan-500/10 text-cyan-700 border-cyan-300/40 dark:text-cyan-300',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide opacity-90">{icon} {label}</p>
      <p className="mt-2 text-2xl font-bold leading-tight">{value}</p>
    </div>
  );
}
