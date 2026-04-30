'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
};

type StoreOverviewResponse = {
  preset: DateRangePreset;
  since: string;
  until: string;
  stores: StoreOverviewRow[];
  totals: Omit<StoreOverviewRow, 'storeId' | 'storeName' | 'domain' | 'lastSyncedAt' | 'productType'>;
  generatedAt: string;
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

async function fetchStoreOverview(preset: DateRangePreset): Promise<StoreOverviewResponse> {
  const res = await fetch(`/api/dashboard/store-overview?preset=${encodeURIComponent(preset)}`, {
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

function readStoreOverviewWarmCache(scopeId: string | null, preset: DateRangePreset): StoreOverviewResponse | null {
  if (!scopeId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`store-overview:cache:v1:${scopeId}:${preset}`);
    if (!raw) return null;
    return JSON.parse(raw) as StoreOverviewResponse;
  } catch {
    return null;
  }
}

function writeStoreOverviewWarmCache(scopeId: string, preset: DateRangePreset, payload: StoreOverviewResponse): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`store-overview:cache:v1:${scopeId}:${preset}`, JSON.stringify(payload));
  } catch {
    // ignore cache write failures
  }
}

export default function StoreOverviewPage() {
  const [preset, setPreset] = useState<DateRangePreset>('today');
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const dateRange = useMemo(() => getDateRange(preset), [preset]);
  const warmData = useMemo(() => readStoreOverviewWarmCache(activeStoreId, preset), [activeStoreId, preset]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['store-overview', preset],
    queryFn: () => fetchStoreOverview(preset),
    initialData: warmData || undefined,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });

  useEffect(() => {
    if (!activeStoreId || !data) return;
    writeStoreOverviewWarmCache(activeStoreId, preset, data);
  }, [activeStoreId, data, preset]);

  const stores = data?.stores || [];
  const totals = data?.totals;
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
            <DateRangePicker
              dateRange={dateRange}
              onRangeChange={(range) => setPreset((range.preset as DateRangePreset) || 'today')}
            />
            <button
              onClick={() => refetch()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-secondary hover:bg-surface-hover"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {isLoading && (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-border bg-surface-elevated">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-300/35 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300">
          {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && totals && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <KpiCard icon={<CircleDollarSign className="h-4 w-4" />} label="Revenue" value={money(totals.revenue)} tone="emerald" />
            <KpiCard icon={<Activity className="h-4 w-4" />} label="Ad Spend" value={money(totals.adSpend)} tone="sky" />
            <KpiCard icon={<Coins className="h-4 w-4" />} label="Net Profit" value={money(totals.netProfit)} tone="amber" />
            <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="ROAS" value={ratio(totals.roas)} tone="violet" />
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
                      </td>
                      <td className="px-4 py-3 font-medium text-emerald-600 dark:text-emerald-300">{money(row.revenue)}</td>
                      <td className="px-4 py-3">{money(row.adSpend)}</td>
                      {showPhysicalOnlyColumns && <td className="px-4 py-3">{money(row.cogs)}</td>}
                      <td className="px-4 py-3">{money(row.fees)}</td>
                      {showPhysicalOnlyColumns && <td className="px-4 py-3">{money(row.shipping)}</td>}
                      <td className="px-4 py-3">
                        <p>{money(row.refunds)}</p>
                        {(row.fullRefundAmount > 0 || row.partialRefundAmount > 0) && (
                          <p className="text-[11px] text-text-muted">
                            F {money(row.fullRefundAmount)} / P {money(row.partialRefundAmount)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-text-primary">{money(row.netProfit)}</td>
                      <td className="px-4 py-3">{pct(row.margin)}</td>
                      <td className="px-4 py-3">{ratio(row.roas)}</td>
                      <td className="px-4 py-3">{money(row.aov)}</td>
                      <td className="px-4 py-3">{num(row.orders)}</td>
                      <td className="px-4 py-3">{money(row.cpc)}</td>
                      <td className="px-4 py-3">{money(row.cpm)}</td>
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
                  </div>
                  <span className="rounded-full border border-border bg-surface-hover px-2 py-0.5 text-[11px] font-semibold text-text-secondary">{relativeDate(row.lastSyncedAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm text-text-secondary">
                  <p>Revenue: <span className="font-semibold text-emerald-600 dark:text-emerald-300">{money(row.revenue)}</span></p>
                  <p>Ad Spend: <span className="font-medium">{money(row.adSpend)}</span></p>
                  {showPhysicalOnlyColumns && (
                    <p>COGS: <span className="font-medium">{money(row.cogs)}</span></p>
                  )}
                  <p>Fees: <span className="font-medium">{money(row.fees)}</span></p>
                  {showPhysicalOnlyColumns && (
                    <p>Shipping: <span className="font-medium">{money(row.shipping)}</span></p>
                  )}
                  <p>Refunds: <span className="font-medium">{money(row.refunds)}</span></p>
                  <p>Net Profit: <span className="font-medium">{money(row.netProfit)}</span></p>
                  <p>Margin: <span className="font-medium">{pct(row.margin)}</span></p>
                  <p>ROAS: <span className="font-medium">{ratio(row.roas)}</span></p>
                  <p>AOV: <span className="font-medium">{money(row.aov)}</span></p>
                  <p>Orders: <span className="font-medium">{num(row.orders)}</span></p>
                  <p>CPC: <span className="font-medium">{money(row.cpc)}</span></p>
                  <p>CPM: <span className="font-medium">{money(row.cpm)}</span></p>
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
