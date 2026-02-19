'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, Radio, RefreshCw } from 'lucide-react';
import { apiClient } from '@/services/api';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';
import { cn } from '@/lib/utils';

interface CoverageDashboardEntityRow {
  id: string;
  name: string;
  purchases: number;
  purchaseValue: number;
}

interface CoverageDashboardPayload {
  windowDays: number;
  sinceIso: string;
  untilIso: string;
  coverage: {
    totalPurchases: number;
    mappedPurchases: number;
    mappedCampaign: number;
    mappedAdSet: number;
    mappedAd: number;
    percent: number;
    unattributedPurchases: number;
  };
  topCampaigns: CoverageDashboardEntityRow[];
  topAdSets: CoverageDashboardEntityRow[];
  topAds: CoverageDashboardEntityRow[];
  recentUnattributedPurchases: Array<{
    eventId: string | null;
    orderId: string | null;
    occurredAt: string;
    value: number;
    currency: string;
  }>;
  diagnostics?: {
    sampledPurchases: number;
    sampledUnmappedPurchases: number;
    reasonCounts: Array<{
      code: string;
      label: string;
      count: number;
    }>;
    sample: Array<{
      eventId: string | null;
      orderId: string | null;
      occurredAt: string;
      value: number;
      currency: string;
      reasonCode: string;
      reasonLabel: string;
      hasSignal: boolean;
      hasUtm: boolean;
      hasFirstTouch: boolean;
    }>;
  };
}

interface LiveOrderMappingPayload {
  dateLabel: string;
  timezone: string;
  today: {
    totalPurchases: number;
    mappedPurchases: number;
    unmappedPurchases: number;
    mappedPercent: number;
    totalRevenue: number;
    mappedRevenue: number;
  };
  liveOrders: Array<{
    eventId: string | null;
    orderId: string | null;
    occurredAt: string;
    value: number;
    currency: string;
    source: 'browser' | 'server' | 'shopify';
    mapped: boolean;
    hasSignal: boolean;
    mappingType: 'deterministic' | 'modeled' | 'signal_only' | 'no_signal';
    fallbackConfidence: number | null;
    fallbackMatchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
    campaignId: string | null;
    adSetId: string | null;
    adId: string | null;
    campaignName: string | null;
    adSetName: string | null;
    adName: string | null;
  }>;
  updatedAt: string;
}

interface UrlTagAuditPayload {
  mode: 'audit' | 'apply';
  activeOnly: boolean;
  maxUpdates: number;
  requiredTemplate: string;
  totals: {
    scannedAds: number;
    missingAds: number;
    updatedAds: number;
    failedAds: number;
    skippedNoCreative: number;
    skippedCap: number;
  };
  details: Array<{
    adId: string;
    adName: string;
    campaignId: string | null;
    campaignName: string;
    creativeId: string | null;
    missingKeys: string[];
    status: 'missing' | 'updated' | 'failed' | 'skipped_no_creative' | 'skipped_cap';
    error?: string;
  }>;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatEntityLabel(name: string | null, id: string | null): { name: string; id: string } | null {
  if (!name && !id) return null;
  const safeId = id || '-';
  return {
    name: name || safeId,
    id: safeId,
  };
}

function mappingBadge(row: LiveOrderMappingPayload['liveOrders'][number]): {
  label: string;
  className: string;
} {
  if (row.mappingType === 'deterministic') {
    return { label: 'Mapped (Exact)', className: 'bg-emerald-500/20 text-emerald-200' };
  }
  if (row.mappingType === 'modeled') {
    const confidencePct =
      typeof row.fallbackConfidence === 'number'
        ? Math.round(Math.max(0, Math.min(1, row.fallbackConfidence)) * 100)
        : null;
    return {
      label: confidencePct !== null ? `Mapped (Modeled ${confidencePct}%)` : 'Mapped (Modeled)',
      className: 'bg-sky-500/20 text-sky-200',
    };
  }
  if (row.mappingType === 'signal_only') {
    return { label: 'Signal Found (No Match)', className: 'bg-amber-500/20 text-amber-200' };
  }
  return { label: 'No Signal', className: 'bg-slate-500/20 text-slate-200' };
}

function TopEntityTable({
  title,
  rows,
}: {
  title: string;
  rows: CoverageDashboardEntityRow[];
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[420px]">
          <thead className="sticky top-0 bg-surface/95 backdrop-blur">
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2 text-right">Purchases</th>
              <th className="px-4 py-2 text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-5 text-center text-sm text-text-muted">
                  No mapped purchases in this window.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border/70">
                <td className="px-4 py-2.5">
                  <p className="truncate text-sm font-medium text-text-primary">{row.name}</p>
                  {row.name !== row.id && (
                    <p className="truncate text-[11px] text-text-muted">{row.id}</p>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-text-secondary">
                  {formatNumber(row.purchases)}
                </td>
                <td className="px-4 py-2.5 text-right text-sm text-text-secondary">
                  {formatCurrency(row.purchaseValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AttributionPage() {
  const [days, setDays] = useState<1 | 7 | 30>(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CoverageDashboardPayload | null>(null);
  const [liveData, setLiveData] = useState<LiveOrderMappingPayload | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveErrorMessage, setLiveErrorMessage] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);
  const [syncingOrders, setSyncingOrders] = useState(false);
  const [newOrderKeys, setNewOrderKeys] = useState<Set<string>>(new Set());
  const [urlTagAuditLoading, setUrlTagAuditLoading] = useState(false);
  const [urlTagAuditError, setUrlTagAuditError] = useState<string | null>(null);
  const [urlTagAuditData, setUrlTagAuditData] = useState<UrlTagAuditPayload | null>(null);
  const seenLiveOrderKeysRef = useRef<Set<string>>(new Set());
  const didInitialSyncRef = useRef<string | null>(null);

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const mappedAccounts = useConnectionStore((s) => s.mappedAccounts);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const emptyReason = useMemo(() => {
    if (!connectionReady) return null;
    if (!connectionStatus?.meta.connected || !connectionStatus?.shopify.connected) return 'not_connected' as const;
    const hasMetaAccount = mappedAccounts.some((a) => a.platform === 'meta' && a.isActive);
    if (!hasMetaAccount) return 'no_accounts' as const;
    return null;
  }, [connectionReady, connectionStatus, mappedAccounts]);

  const fetchData = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await apiClient<{ data: CoverageDashboardPayload }>('/api/tracking/coverage-dashboard', {
        params: { days: String(days) },
        timeoutMs: 12_000,
        maxRetries: 1,
      });
      setData(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load attribution dashboard';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [activeStoreId, days]);

  const fetchLiveData = useCallback(async (options?: { silent?: boolean }) => {
    if (!activeStoreId) return;
    if (!options?.silent) {
      setLiveLoading(true);
    }
    setLiveErrorMessage(null);
    try {
      const response = await apiClient<{ data: LiveOrderMappingPayload }>('/api/tracking/live-orders', {
        params: { limit: '40' },
        timeoutMs: 10_000,
        maxRetries: 1,
      });
      const payload = response.data;

      const incomingKeys = new Set<string>();
      const freshKeys = new Set<string>();
      for (const row of payload.liveOrders) {
        const key = row.eventId || `${row.orderId || 'na'}-${row.occurredAt}`;
        incomingKeys.add(key);
        if (!seenLiveOrderKeysRef.current.has(key)) {
          freshKeys.add(key);
        }
      }

      seenLiveOrderKeysRef.current = incomingKeys;
      setNewOrderKeys(freshKeys);
      setLiveData(payload);
      setTimeout(() => setNewOrderKeys(new Set()), 5000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load live order mapping';
      setLiveErrorMessage(message);
    } finally {
      setLiveLoading(false);
    }
  }, [activeStoreId]);

  const syncShopifyOrders = useCallback(
    async (windowDays: 1 | 7 | 30, options?: { silent?: boolean }) => {
      if (!activeStoreId) return false;
      if (!options?.silent) {
        setSyncingOrders(true);
      }
      setSyncMessage(null);
      try {
        const syncDays = windowDays === 1 ? 2 : windowDays;
        const response = await apiClient<{
          data?: { scannedOrders?: number; insertedPurchaseEvents?: number; updatedPurchaseEvents?: number };
        }>('/api/tracking/backfill-orders', {
          method: 'POST',
          body: JSON.stringify({ days: syncDays }),
          timeoutMs: 30_000,
          maxRetries: 0,
        });
        const scanned = Number(response?.data?.scannedOrders || 0);
        const inserted = Number(response?.data?.insertedPurchaseEvents || 0);
        const updated = Number(response?.data?.updatedPurchaseEvents || 0);
        setSyncMessage(`Shopify sync done: ${formatNumber(scanned)} scanned, ${formatNumber(inserted)} new, ${formatNumber(updated)} refreshed.`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Order sync failed';
        setSyncMessage(`Shopify sync warning: ${message}`);
        return false;
      } finally {
        if (!options?.silent) {
          setSyncingOrders(false);
        }
      }
    },
    [activeStoreId]
  );

  const refreshAll = useCallback(
    async (options?: { withSync?: boolean; silentSync?: boolean }) => {
      const withSync = options?.withSync ?? true;
      if (withSync) {
        await syncShopifyOrders(days, { silent: options?.silentSync });
      }
      await Promise.all([fetchData(), fetchLiveData()]);
    },
    [days, fetchData, fetchLiveData, syncShopifyOrders]
  );

  const runUrlTagAudit = useCallback(async (apply: boolean) => {
    if (!activeStoreId) return;
    setUrlTagAuditLoading(true);
    setUrlTagAuditError(null);
    try {
      const response = await apiClient<{ data: UrlTagAuditPayload }>('/api/tracking/enforce-meta-url-tags', {
        method: 'POST',
        body: JSON.stringify({ apply, activeOnly: true, maxUpdates: 120 }),
        timeoutMs: apply ? 45_000 : 25_000,
        maxRetries: 0,
      });
      setUrlTagAuditData(response.data);
      if (apply) {
        fetchData();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run Meta URL tag check';
      setUrlTagAuditError(message);
    } finally {
      setUrlTagAuditLoading(false);
    }
  }, [activeStoreId, fetchData]);

  useEffect(() => {
    if (connectionReady && !emptyReason) {
      refreshAll({ withSync: false });
    }
  }, [connectionReady, emptyReason, refreshAll, activeStoreId]);

  useEffect(() => {
    if (!connectionReady || emptyReason || !activeStoreId) return;
    if (didInitialSyncRef.current === activeStoreId) return;
    didInitialSyncRef.current = activeStoreId;
    syncShopifyOrders(days, { silent: true }).then(() => {
      fetchData();
      fetchLiveData({ silent: true });
    });
  }, [connectionReady, emptyReason, activeStoreId, syncShopifyOrders, fetchData, fetchLiveData, days]);

  useEffect(() => {
    if (!connectionReady || emptyReason) return;
    const timer = window.setInterval(() => {
      fetchLiveData({ silent: true });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [connectionReady, emptyReason, fetchLiveData]);

  if ((!connectionReady || loading) && !data && !errorMessage) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading attribution dashboard...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  if (!data && errorMessage) {
    return <ConnectionEmptyState reason="error" message={errorMessage} />;
  }

  const coverage = data?.coverage;
  const coveragePercent = Number(coverage?.percent || 0);
  const todayPercent = Number(liveData?.today.mappedPercent || 0);
  const diagnostics = data?.diagnostics;
  const newestLiveOrder = liveData?.liveOrders?.[0] || null;
  const newestLiveOrderKey = newestLiveOrder
    ? newestLiveOrder.eventId || `${newestLiveOrder.orderId || 'na'}-${newestLiveOrder.occurredAt}`
    : null;
  const newestOrderIsFresh = newestLiveOrderKey ? newOrderKeys.has(newestLiveOrderKey) : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Attribution Center</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Match quality for Shopify purchases vs tracked campaign/ad set/ad IDs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border border-border bg-surface-elevated p-1">
            {[1, 7, 30].map((windowDays) => (
              <button
                key={windowDays}
                onClick={() => setDays(windowDays as 1 | 7 | 30)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm transition-colors',
                  days === windowDays
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:bg-surface-hover'
                )}
              >
                {windowDays === 1 ? 'Today' : `Last ${windowDays}d`}
              </button>
            ))}
          </div>
          <button
            onClick={() => refreshAll({ withSync: true })}
            disabled={loading || syncingOrders}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={cn('h-4 w-4', (loading || syncingOrders) && 'animate-spin')} />
            Sync & Refresh
          </button>
          <button
            onClick={() => runUrlTagAudit(false)}
            disabled={urlTagAuditLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {urlTagAuditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Audit URL Tags
          </button>
          <button
            onClick={() => runUrlTagAudit(true)}
            disabled={urlTagAuditLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/15 px-3 py-2 text-sm text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {urlTagAuditLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Fix URL Tags
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
        </div>
      )}

      {syncMessage && (
        <div className="rounded-lg border border-border/70 bg-surface-elevated px-3 py-2 text-xs text-text-muted">
          {syncingOrders ? 'Syncing Shopify orders...' : syncMessage}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-200/80">Coverage</p>
          <p className="mt-2 text-3xl font-bold text-emerald-100">{coveragePercent.toFixed(2)}%</p>
          <p className="mt-1 text-xs text-emerald-100/80">
            {formatNumber(coverage?.mappedPurchases || 0)} mapped / {formatNumber(coverage?.totalPurchases || 0)} total
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Unattributed Purchases</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">
            {formatNumber(coverage?.unattributedPurchases || 0)}
          </p>
          <p className="mt-1 text-xs text-text-muted">Need URL params/cart signal capture</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Mapped At Campaign</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{formatNumber(coverage?.mappedCampaign || 0)}</p>
          <p className="mt-1 text-xs text-text-muted">Purchase rows with campaign ID</p>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Mapped At Ad/Ad Set</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">
            {formatNumber(Math.max(coverage?.mappedAd || 0, coverage?.mappedAdSet || 0))}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Ad set: {formatNumber(coverage?.mappedAdSet || 0)} | Ad: {formatNumber(coverage?.mappedAd || 0)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="rounded-xl border border-primary/35 bg-primary/10 p-4">
          <p className="text-xs uppercase tracking-wide text-primary-light/80">Today Orders</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{formatNumber(liveData?.today.totalPurchases || 0)}</p>
          <p className="mt-1 text-xs text-text-muted">Auto-updates every 10 seconds</p>
        </div>
        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-200/80">Today Mapped Revenue</p>
          <p className="mt-2 text-3xl font-bold text-emerald-100">{formatCurrency(liveData?.today.mappedRevenue || 0)}</p>
          <p className="mt-1 text-xs text-emerald-100/80">
            {formatCurrency(liveData?.today.totalRevenue || 0)} total revenue
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface-elevated p-4">
          <p className="text-xs uppercase tracking-wide text-text-muted">Today Mapping Rate</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{todayPercent.toFixed(2)}%</p>
          <p className="mt-1 text-xs text-text-muted">
            {formatNumber(liveData?.today.mappedPurchases || 0)} mapped / {formatNumber(liveData?.today.unmappedPurchases || 0)} unmapped
          </p>
        </div>
        <div
          className={cn(
            'rounded-xl border bg-surface-elevated p-4 transition-colors',
            newestOrderIsFresh ? 'border-primary/60 bg-primary/10' : 'border-border'
          )}
        >
          <p className="text-xs uppercase tracking-wide text-text-muted">Newest Order</p>
          <p className="mt-2 text-xl font-semibold text-text-primary">
            {newestLiveOrder?.orderId || 'No order yet'}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {newestLiveOrder
              ? `${formatCurrency(newestLiveOrder.value)} ${newestLiveOrder.currency}`
              : 'Waiting for first order'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            {newestLiveOrder ? formatDateTime(newestLiveOrder.occurredAt) : 'Live feed active'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Missing-Signal Diagnostics</h3>
          <p className="text-xs text-text-muted">
            Why unmapped purchases fail attribution in this {days}d window.
          </p>
        </div>
        <div className="space-y-4 px-4 py-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            {(diagnostics?.reasonCounts || []).map((reason) => (
              <div key={reason.code} className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{reason.label}</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(reason.count)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            Sampled {formatNumber(diagnostics?.sampledUnmappedPurchases || 0)} unmapped out of {formatNumber(diagnostics?.sampledPurchases || 0)} purchases.
          </p>
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full min-w-[860px]">
              <thead className="sticky top-0 bg-surface/95 backdrop-blur">
                <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Reason</th>
                  <th className="px-3 py-2">Signals</th>
                </tr>
              </thead>
              <tbody>
                {(diagnostics?.sample || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-5 text-center text-sm text-text-muted">
                      No unmapped diagnostics in this window.
                    </td>
                  </tr>
                )}
                {(diagnostics?.sample || []).map((row) => (
                  <tr key={row.eventId || `${row.orderId}-${row.occurredAt}`} className="border-t border-border/70">
                    <td className="px-3 py-2.5 text-sm text-text-secondary">{formatDateTime(row.occurredAt)}</td>
                    <td className="px-3 py-2.5 text-sm text-text-secondary">{row.orderId || '-'}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-text-secondary">
                      {formatCurrency(row.value || 0)} {row.currency || 'USD'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">{row.reasonLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">
                      <span className={cn('mr-2', row.hasSignal ? 'text-emerald-300' : 'text-text-dimmed')}>Signal</span>
                      <span className={cn('mr-2', row.hasUtm ? 'text-emerald-300' : 'text-text-dimmed')}>UTM</span>
                      <span className={cn(row.hasFirstTouch ? 'text-emerald-300' : 'text-text-dimmed')}>First-touch</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Meta URL Tag Enforcement</h3>
          <p className="text-xs text-text-muted">
            Ensures active ads include campaign/adset/ad ID parameters for stronger Shopify mapping.
          </p>
        </div>
        <div className="space-y-3 px-4 py-4">
          {urlTagAuditError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="h-3.5 w-3.5" />
              {urlTagAuditError}
            </div>
          )}
          {urlTagAuditData ? (
            <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Scanned</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(urlTagAuditData.totals.scannedAds)}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Missing</p>
                <p className="mt-1 text-lg font-semibold text-amber-200">{formatNumber(urlTagAuditData.totals.missingAds)}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Updated</p>
                <p className="mt-1 text-lg font-semibold text-emerald-200">{formatNumber(urlTagAuditData.totals.updatedAds)}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Failed</p>
                <p className="mt-1 text-lg font-semibold text-red-200">{formatNumber(urlTagAuditData.totals.failedAds)}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">No Creative</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(urlTagAuditData.totals.skippedNoCreative)}</p>
              </div>
              <div className="rounded-lg border border-border/80 bg-surface px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Skipped (Cap)</p>
                <p className="mt-1 text-lg font-semibold text-text-primary">{formatNumber(urlTagAuditData.totals.skippedCap)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Run Audit URL Tags to check active campaigns.</p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface-elevated to-surface-elevated">
        <div className="flex items-center justify-between border-b border-primary/20 px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Live Order Mapping</h3>
            <p className="text-xs text-text-muted">
              Today ({liveData?.dateLabel || '-'}) • {liveData?.timezone || '-'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
              <Radio className={cn('h-3.5 w-3.5', liveLoading ? 'animate-pulse' : 'animate-ping')} />
              Live
            </span>
            <span className="text-xs text-text-muted">
              Updated: {liveData?.updatedAt ? formatDateTime(liveData.updatedAt) : '-'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-b border-primary/20 px-4 py-4 md:grid-cols-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Today Mapping</p>
            <p className="mt-1 text-2xl font-semibold text-text-primary">{todayPercent.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Orders Today</p>
            <p className="mt-1 text-xl font-semibold text-text-primary">{formatNumber(liveData?.today.totalPurchases || 0)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Mapped / Unmapped</p>
            <p className="mt-1 text-xl font-semibold text-text-primary">
              {formatNumber(liveData?.today.mappedPurchases || 0)} / {formatNumber(liveData?.today.unmappedPurchases || 0)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Mapped Revenue</p>
            <p className="mt-1 text-xl font-semibold text-text-primary">
              {formatCurrency(liveData?.today.mappedRevenue || 0)}
            </p>
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="relative h-2 overflow-hidden rounded-full bg-surface-hover">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-primary transition-all duration-700"
              style={{ width: `${Math.max(0, Math.min(100, todayPercent))}%` }}
            />
            <div className="absolute inset-y-0 w-10 animate-pulse bg-white/15" style={{ left: `${Math.max(0, Math.min(95, todayPercent - 5))}%` }} />
          </div>
        </div>

        {liveErrorMessage && (
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              <AlertCircle className="h-3.5 w-3.5" />
              {liveErrorMessage}
            </div>
          </div>
        )}

        <div className="max-h-[360px] overflow-auto px-4 pb-4 pt-3">
          <table className="w-full min-w-[980px]">
            <thead className="sticky top-0 bg-surface/95 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Campaign</th>
                <th className="px-3 py-2">Ad Set</th>
                <th className="px-3 py-2">Ad</th>
              </tr>
            </thead>
            <tbody>
              {(liveData?.liveOrders || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-text-muted">
                    No purchase events today yet.
                  </td>
                </tr>
              )}
              {(liveData?.liveOrders || []).map((row) => {
                const key = row.eventId || `${row.orderId || 'na'}-${row.occurredAt}`;
                const isNew = newOrderKeys.has(key);
                const campaign = formatEntityLabel(row.campaignName, row.campaignId);
                const adSet = formatEntityLabel(row.adSetName, row.adSetId);
                const ad = formatEntityLabel(row.adName, row.adId);
                const badge = mappingBadge(row);
                return (
                  <tr
                    key={key}
                    className={cn(
                      'border-t border-border/70 transition-colors',
                      isNew && 'animate-pulse bg-primary/10'
                    )}
                  >
                    <td className="px-3 py-2.5 text-sm text-text-secondary">{formatDateTime(row.occurredAt)}</td>
                    <td className="px-3 py-2.5 text-sm text-text-secondary">{row.orderId || '-'}</td>
                    <td className="px-3 py-2.5 text-right text-sm text-text-secondary">
                      {formatCurrency(row.value)} {row.currency}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium',
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-text-dimmed">{row.source}</p>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">
                      {campaign ? (
                        <div>
                          <p className="text-text-secondary">{campaign.name}</p>
                          <p className="text-[10px] text-text-dimmed">{campaign.id}</p>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">
                      {adSet ? (
                        <div>
                          <p className="text-text-secondary">{adSet.name}</p>
                          <p className="text-[10px] text-text-dimmed">{adSet.id}</p>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-text-muted">
                      {ad ? (
                        <div>
                          <p className="text-text-secondary">{ad.name}</p>
                          <p className="text-[10px] text-text-dimmed">{ad.id}</p>
                        </div>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <TopEntityTable title="Top Mapped Campaigns" rows={data?.topCampaigns || []} />
        <TopEntityTable title="Top Mapped Ad Sets" rows={data?.topAdSets || []} />
        <TopEntityTable title="Top Mapped Ads" rows={data?.topAds || []} />
      </div>

      <div className="rounded-xl border border-border bg-surface-elevated">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-text-primary">Recent Unattributed Purchases</h3>
          <p className="text-xs text-text-muted">Most recent purchases that could not be matched to campaign/ad set/ad.</p>
        </div>
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[760px]">
            <thead className="sticky top-0 bg-surface/95 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Event ID</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentUnattributedPurchases || []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-5 text-center text-sm text-text-muted">
                    No unattributed purchases in this window.
                  </td>
                </tr>
              )}
              {(data?.recentUnattributedPurchases || []).map((row) => (
                <tr key={row.eventId || `${row.orderId}-${row.occurredAt}`} className="border-t border-border/70">
                  <td className="px-4 py-2.5 text-sm text-text-secondary">{formatDateTime(row.occurredAt)}</td>
                  <td className="px-4 py-2.5 text-sm text-text-secondary">{row.orderId || '-'}</td>
                  <td className="px-4 py-2.5 text-sm text-text-muted">{row.eventId || '-'}</td>
                  <td className="px-4 py-2.5 text-right text-sm text-text-secondary">
                    {formatCurrency(row.value || 0)} {row.currency || 'USD'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
