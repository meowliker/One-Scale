'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Loader2,
  MousePointerClick,
  Eye,
  DollarSign,
  ShoppingCart,
  Target,
  TrendingUp,
  Settings2,
  X,
} from 'lucide-react';
import { useStoreStore } from '@/stores/storeStore';
import { formatCurrency, cn } from '@/lib/utils';
import type { DateRangePreset } from '@/types/analytics';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';

// ─── Types ───────────────────────────────────────────────────────────────────
interface ProductRow {
  productId: string;
  productName: string;
  productImage: string | null;
  category: string;
  revenue: number;
  unitsSold: number;
  fbMetrics: {
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    cpc: number;
    cpm: number;
    ctr: number;
    aov: number;
    roas: number;
  };
  isAdvertised: boolean;
}

interface RejectedAd {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  adAccountId: string;
}

interface ProductPerfPayload {
  products: ProductRow[];
  rejectedAds: RejectedAd[];
  cachedAt?: string;
}

type SortKey = 'revenue' | 'cpc' | 'ctr' | 'cpm' | 'aov' | 'cvr' | 'unitsSold';
type SortDir = 'asc' | 'desc';

// ─── Column Config ───────────────────────────────────────────────────────────
interface ColumnDef {
  key: SortKey | 'product' | 'alert';
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  tooltip: string;
  sortable: boolean;
  defaultVisible: boolean;
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'product', label: 'Product', shortLabel: 'Product', icon: Package, tooltip: 'Main product name', sortable: false, defaultVisible: true },
  { key: 'revenue', label: 'Revenue', shortLabel: 'Rev', icon: DollarSign, tooltip: 'Total revenue from Shopify orders', sortable: true, defaultVisible: true },
  { key: 'cpc', label: 'CPC', shortLabel: 'CPC', icon: MousePointerClick, tooltip: 'Cost per click from Meta Ads', sortable: true, defaultVisible: true },
  { key: 'ctr', label: 'CTR', shortLabel: 'CTR', icon: Target, tooltip: 'Click-through rate (clicks / impressions)', sortable: true, defaultVisible: true },
  { key: 'cpm', label: 'CPM', shortLabel: 'CPM', icon: Eye, tooltip: 'Cost per 1,000 impressions', sortable: true, defaultVisible: true },
  { key: 'aov', label: 'AOV', shortLabel: 'AOV', icon: ShoppingCart, tooltip: 'Average order value (Shopify)', sortable: true, defaultVisible: true },
  { key: 'cvr', label: 'Conv. Rate', shortLabel: 'CVR', icon: TrendingUp, tooltip: 'Conversion rate (orders / clicks)', sortable: true, defaultVisible: true },
  { key: 'alert', label: 'Status', shortLabel: '', icon: AlertTriangle, tooltip: 'Ad rejection alerts (last 12 hrs)', sortable: false, defaultVisible: true },
];

// ─── Warm Cache (localStorage) ───────────────────────────────────────────────
const CACHE_KEY = (storeId: string, preset: string) => `prodperf:cache:v1:${storeId}:${preset}`;

function readWarmCache(storeId: string | null, preset: string): ProductPerfPayload | null {
  if (!storeId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY(storeId, preset));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProductPerfPayload;
    // Expire after 10 min
    if (parsed.cachedAt && Date.now() - new Date(parsed.cachedAt).getTime() > 10 * 60 * 1000) return null;
    return parsed;
  } catch { return null; }
}

function writeWarmCache(storeId: string, preset: string, payload: ProductPerfPayload): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY(storeId, preset), JSON.stringify({ ...payload, cachedAt: new Date().toISOString() }));
  } catch { /* ignore */ }
}

// ─── Data Fetcher ────────────────────────────────────────────────────────────
async function fetchProductPerf(storeId: string, preset: DateRangePreset): Promise<ProductPerfPayload> {
  const range = getDateRange(preset);
  const from = formatDateInTimezone(range.start);
  const to = formatDateInTimezone(range.end);

  const params = `storeId=${encodeURIComponent(storeId)}&from=${from}&to=${to}`;

  // Try fast cached endpoint first, fallback to full computation
  const [perfRes, alertRes] = await Promise.all([
    fetch(`/api/pnl/product-perf-cached?${params}`),
    fetch(`/api/meta/ad-rejections?storeId=${encodeURIComponent(storeId)}`).catch(() => null),
  ]);

  let products: ProductRow[] = [];
  let rejectedAds: RejectedAd[] = [];

  const perfJson = await perfRes.json();
  if (perfJson.ok && perfJson.data) {
    products = perfJson.data.filter(
      (p: ProductRow) => p.category === 'main' || p.category === 'MAIN'
    );
  }

  // If cached endpoint returned empty (common for "today"), try the full product-performance endpoint
  if (products.length === 0) {
    try {
      const fullRes = await fetch(`/api/pnl/product-performance?${params}`);
      if (fullRes.ok) {
        const fullJson = await fullRes.json();
        if (fullJson.ok && fullJson.data) {
          products = fullJson.data.filter(
            (p: ProductRow) => (p.category === 'main' || p.category === 'MAIN')
          );
        }
      }
    } catch { /* ignore fallback errors */ }
  }

  if (alertRes) {
    try {
      const alertJson = await alertRes.json();
      if (alertJson.ok) rejectedAds = alertJson.rejectedAds || [];
    } catch { /* ignore */ }
  }

  return { products, rejectedAds };
}

// ─── Date Preset Labels ──────────────────────────────────────────────────────
const PRESET_LABELS: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last3: 'Last 3 Days',
  last7: 'Last 7 Days',
  last14: 'Last 14 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

// ─── Metric Helpers ──────────────────────────────────────────────────────────
function computeCvr(clicks: number, purchases: number): number {
  return clicks > 0 ? (purchases / clicks) * 100 : 0;
}
function computeCpc(spend: number, clicks: number): number {
  return clicks > 0 ? spend / clicks : 0;
}
function computeCpm(spend: number, impressions: number): number {
  return impressions > 0 ? (spend / impressions) * 1000 : 0;
}
function computeCtr(clicks: number, impressions: number): number {
  return impressions > 0 ? (clicks / impressions) * 100 : 0;
}
function computeAov(revenue: number, orders: number): number {
  return orders > 0 ? revenue / orders : 0;
}

function formatMetric(value: number, type: 'currency' | 'percent' | 'number'): string {
  if (type === 'currency') return `$${value.toFixed(2)}`;
  if (type === 'percent') return `${value.toFixed(2)}%`;
  return value.toFixed(0);
}

// ─── Animated Counter ────────────────────────────────────────────────────────
function AnimatedNumber({ value, type }: { value: number; type: 'currency' | 'percent' | 'number' }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    const start = prevValue.current;
    const end = value;
    const duration = 600;
    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      if (ref.current) ref.current.textContent = formatMetric(current, type);
      if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
    prevValue.current = end;
  }, [value, type]);

  return <span ref={ref}>{formatMetric(value, type)}</span>;
}

// ─── Skeleton Row ────────────────────────────────────────────────────────────
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <tr key={i} className="border-b border-border/50">
          <td className="px-5 py-3.5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-surface-hover animate-shimmer" />
              <div className="space-y-1.5">
                <div className="h-3.5 w-28 rounded bg-surface-hover animate-shimmer" />
                <div className="h-2.5 w-16 rounded bg-surface-hover animate-shimmer" />
              </div>
            </div>
          </td>
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} className="px-3 py-3.5 text-right">
              <div className="h-3.5 w-14 rounded bg-surface-hover animate-shimmer ml-auto" />
            </td>
          ))}
          <td className="px-3 py-3.5 text-center">
            <div className="h-3 w-3 rounded-full bg-surface-hover animate-shimmer mx-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

// ─── Column Customizer ───────────────────────────────────────────────────────
function ColumnCustomizer({
  visibleColumns,
  onToggle,
  onClose,
}: {
  visibleColumns: Set<string>;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-surface shadow-2xl overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-xs font-bold text-text-primary uppercase tracking-wide">Customize Columns</span>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-hover transition-colors">
          <X className="h-3.5 w-3.5 text-text-secondary" />
        </button>
      </div>
      <div className="py-2">
        {ALL_COLUMNS.filter((c) => c.key !== 'product').map((col) => (
          <button
            key={col.key}
            onClick={() => onToggle(col.key)}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors"
          >
            <div
              className={cn(
                'flex h-4 w-4 items-center justify-center rounded border transition-colors',
                visibleColumns.has(col.key)
                  ? 'bg-primary border-primary'
                  : 'border-border'
              )}
            >
              {visibleColumns.has(col.key) && (
                <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <col.icon className="h-3.5 w-3.5 text-text-secondary" />
            <span className="text-sm text-text-primary">{col.label}</span>
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Alert Tooltip ───────────────────────────────────────────────────────────
function AlertTooltip({ ads }: { ads: RejectedAd[] }) {
  // Use fixed positioning via portal to avoid overflow clipping from table scroll container
  const triggerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top - 8, left: rect.right - 320 });
    }
  }, []);

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{ position: 'fixed', top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
      className="z-[9999] w-80 rounded-xl border-2 border-red-400 dark:border-red-700 p-4"
      // Force opaque background — no theme tokens that might be transparent
      ref={triggerRef}
    >
      {/* Opaque background layer */}
      <div className="absolute inset-0 rounded-xl bg-white dark:bg-gray-950" style={{ zIndex: -1 }} />

      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
        </div>
        <span className="text-sm font-bold" style={{ color: '#dc2626' }}>
          {ads.length} Ad{ads.length > 1 ? 's' : ''} Rejected
        </span>
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {ads.map((ad) => (
          <div key={ad.id} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5" style={{ backgroundColor: 'rgba(254,226,226,0.8)' }}>
            <span className="h-2.5 w-2.5 rounded-full mt-1 shrink-0" style={{ backgroundColor: '#ef4444' }} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-tight" style={{ color: '#111827' }}>{ad.name}</p>
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
                {ad.status === 'DISAPPROVED' ? 'Disapproved' : 'Has Issues'} &middot;{' '}
                {new Date(ad.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>,
    document.body
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export interface ProductPerformanceTableProps {
  datePreset?: DateRangePreset;
}

export function ProductPerformanceTable({ datePreset = 'last7' }: ProductPerformanceTableProps) {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [hoveredAlert, setHoveredAlert] = useState<string | null>(null);
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter((c) => c.defaultVisible).map((c) => c.key))
  );

  // ── Warm cache for instant render ──
  const warmData = useMemo(
    () => readWarmCache(activeStoreId, datePreset),
    [activeStoreId, datePreset]
  );

  // ── React Query: instant from cache, background refresh ──
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['product-perf', activeStoreId, datePreset],
    queryFn: () => fetchProductPerf(activeStoreId!, datePreset),
    enabled: !!activeStoreId,
    initialData: warmData || undefined,
    staleTime: datePreset === 'today' ? 15_000 : 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: datePreset === 'today' ? 30_000 : false, // Auto-poll every 30s for today
  });

  // Write to warm cache on fresh data
  useEffect(() => {
    if (!activeStoreId || !data || data === warmData) return;
    writeWarmCache(activeStoreId, datePreset, data);
  }, [activeStoreId, data, datePreset, warmData]);

  const products = data?.products ?? [];
  const rejectedAds = data?.rejectedAds ?? [];
  const showSkeleton = isLoading && products.length === 0;

  // ── Computed metrics & sort ──
  const sortedProducts = useMemo(() => {
    const withMetrics = products.map((p) => {
      // hasMetaData: true if any Meta metric exists (not just spend)
      const hasMetaData = p.isAdvertised || p.fbMetrics.impressions > 0 || p.fbMetrics.clicks > 0 || p.fbMetrics.spend > 0;
      return {
        ...p,
        isAdvertised: hasMetaData, // override: show metrics when ANY Meta data exists
        computedCpc: computeCpc(p.fbMetrics.spend, p.fbMetrics.clicks),
        computedCpm: computeCpm(p.fbMetrics.spend, p.fbMetrics.impressions),
        computedCtr: computeCtr(p.fbMetrics.clicks, p.fbMetrics.impressions),
        computedAov: computeAov(p.revenue, p.unitsSold),
        // CVR: use Meta purchases if available, fallback to Shopify order count
        computedCvr: computeCvr(p.fbMetrics.clicks, p.fbMetrics.purchases > 0 ? p.fbMetrics.purchases : p.unitsSold),
      };
    });

    return [...withMetrics].sort((a, b) => {
      let aVal = 0;
      let bVal = 0;
      switch (sortKey) {
        case 'revenue': aVal = a.revenue; bVal = b.revenue; break;
        case 'cpc': aVal = a.computedCpc; bVal = b.computedCpc; break;
        case 'ctr': aVal = a.computedCtr; bVal = b.computedCtr; break;
        case 'cpm': aVal = a.computedCpm; bVal = b.computedCpm; break;
        case 'aov': aVal = a.computedAov; bVal = b.computedAov; break;
        case 'cvr': aVal = a.computedCvr; bVal = b.computedCvr; break;
        case 'unitsSold': aVal = a.unitsSold; bVal = b.unitsSold; break;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [products, sortKey, sortDir]);

  // ── Totals row ──
  const totals = useMemo(() => {
    const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
    const totalSpend = products.reduce((s, p) => s + p.fbMetrics.spend, 0);
    const totalImpressions = products.reduce((s, p) => s + p.fbMetrics.impressions, 0);
    const totalClicks = products.reduce((s, p) => s + p.fbMetrics.clicks, 0);
    const totalPurchases = products.reduce((s, p) => s + p.fbMetrics.purchases, 0);
    const totalOrders = products.reduce((s, p) => s + p.unitsSold, 0);
    return {
      revenue: totalRevenue,
      cpc: computeCpc(totalSpend, totalClicks),
      cpm: computeCpm(totalSpend, totalImpressions),
      ctr: computeCtr(totalClicks, totalImpressions),
      aov: computeAov(totalRevenue, totalOrders),
      cvr: computeCvr(totalClicks, totalPurchases > 0 ? totalPurchases : totalOrders),
    };
  }, [products]);

  // ── Sort handler (3-click cycle: desc → asc → reset to revenue desc) ──
  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === 'desc') {
        setSortDir('asc');
      } else {
        // Reset to default
        setSortKey('revenue');
        setSortDir('desc');
      }
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function toggleColumn(key: string) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const isVisible = (key: string) => visibleColumns.has(key);

  // ── Empty state (no products found & not loading) ──
  if (!showSkeleton && products.length === 0) {
    return (
      <div className="apple-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Product Performance</h3>
              <p className="text-xs text-text-secondary">Main products overview</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-hover mb-4">
            <Package className="h-7 w-7 text-text-secondary" />
          </div>
          <p className="text-sm font-medium text-text-primary mb-1">No main products found</p>
          <p className="text-xs text-text-secondary">Configure products in P&L Settings to see performance data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="apple-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Product Performance</h3>
              <p className="text-xs text-text-secondary">
                {products.length} main product{products.length !== 1 ? 's' : ''}
                <span className="mx-1.5 text-text-dimmed">&middot;</span>
                <span className="text-primary font-medium">{PRESET_LABELS[datePreset] || datePreset}</span>
                {isFetching && !showSkeleton && (
                  <Loader2 className="inline-block h-3 w-3 animate-spin text-primary ml-2" />
                )}
                {rejectedAds.length > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-danger font-medium">
                    <AlertTriangle className="h-3 w-3" />
                    {rejectedAds.length} ad alert{rejectedAds.length !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowCustomizer(!showCustomizer)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                showCustomizer
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-secondary hover:bg-surface-hover'
              )}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Columns
            </button>
            <AnimatePresence>
              {showCustomizer && (
                <ColumnCustomizer
                  visibleColumns={visibleColumns}
                  onToggle={toggleColumn}
                  onClose={() => setShowCustomizer(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={cn('overflow-x-auto transition-opacity duration-300', isFetching && !showSkeleton ? 'opacity-60' : 'opacity-100')}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-hover/50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wide sticky left-0 bg-surface-hover/50 z-10">
                Product
              </th>
              {isVisible('revenue') && (
                <SortableHeader label="Revenue" sortKey="revenue" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('cpc') && (
                <SortableHeader label="CPC" sortKey="cpc" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('ctr') && (
                <SortableHeader label="CTR" sortKey="ctr" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('cpm') && (
                <SortableHeader label="CPM" sortKey="cpm" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('aov') && (
                <SortableHeader label="AOV" sortKey="aov" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('cvr') && (
                <SortableHeader label="Conv. Rate" sortKey="cvr" currentSortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              )}
              {isVisible('alert') && (
                <th className="px-3 py-3 text-center text-xs font-semibold text-text-secondary uppercase tracking-wide w-16">
                  <AlertTriangle className="h-3.5 w-3.5 mx-auto" />
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {showSkeleton ? (
              <SkeletonRows count={4} />
            ) : (
              <>
                <AnimatePresence mode="popLayout">
                  {sortedProducts.map((product, idx) => {
                    const productAlerts = rejectedAds.filter((ad) =>
                      product.productName
                        .toLowerCase()
                        .split(/\s+/)
                        .some((word) => word.length > 3 && ad.name.toLowerCase().includes(word))
                    );

                    return (
                      <motion.tr
                        key={product.productId}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        className="border-b border-border/50 hover:bg-surface-hover/30 transition-colors group"
                      >
                        {/* Product */}
                        <td className="px-5 py-3.5 sticky left-0 bg-surface group-hover:bg-surface-hover/30 z-10 transition-colors">
                          <div className="flex items-center gap-3">
                            {product.productImage ? (
                              <div className="h-9 w-9 rounded-lg overflow-hidden bg-surface-hover shrink-0 border border-border/50">
                                <img src={product.productImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                              </div>
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-hover shrink-0 border border-border/50">
                                <Package className="h-4 w-4 text-text-dimmed" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-text-primary truncate max-w-[180px]">{product.productName}</p>
                              <p className="text-[10px] text-text-secondary uppercase tracking-wide">{product.unitsSold} units</p>
                            </div>
                          </div>
                        </td>

                        {isVisible('revenue') && (
                          <td className="px-3 py-3.5 text-right">
                            <span className="text-sm font-semibold text-text-primary tabular-nums">
                              <AnimatedNumber value={product.revenue} type="currency" />
                            </span>
                          </td>
                        )}

                        {isVisible('cpc') && (
                          <MetricCell value={product.computedCpc} type="currency" isActive={product.isAdvertised} />
                        )}

                        {isVisible('ctr') && (
                          <MetricCell value={product.computedCtr} type="percent" isActive={product.isAdvertised} goodThreshold={2} badThreshold={0.5} />
                        )}

                        {isVisible('cpm') && (
                          <MetricCell value={product.computedCpm} type="currency" isActive={product.isAdvertised} />
                        )}

                        {isVisible('aov') && (
                          <td className="px-3 py-3.5 text-right">
                            <span className="text-sm font-medium text-text-primary tabular-nums">
                              <AnimatedNumber value={product.computedAov} type="currency" />
                            </span>
                          </td>
                        )}

                        {isVisible('cvr') && (
                          <MetricCell value={product.computedCvr} type="percent" isActive={product.isAdvertised || product.unitsSold > 0} goodThreshold={3} badThreshold={1} />
                        )}

                        {isVisible('alert') && (
                          <td className="px-3 py-3.5 text-center relative">
                            {productAlerts.length > 0 ? (
                              <div
                                className="relative inline-block"
                                onMouseEnter={() => setHoveredAlert(product.productId)}
                                onMouseLeave={() => setHoveredAlert(null)}
                              >
                                <motion.div
                                  animate={{ scale: [1, 1.15, 1] }}
                                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                                >
                                  <AlertTriangle className="h-4 w-4 text-danger" />
                                </motion.div>
                                <AnimatePresence>
                                  {hoveredAlert === product.productId && <AlertTooltip ads={productAlerts} />}
                                </AnimatePresence>
                              </div>
                            ) : product.isAdvertised ? (
                              <span className="inline-flex h-2 w-2 rounded-full bg-success" title="Ads running" />
                            ) : (
                              <span className="text-text-dimmed text-xs">--</span>
                            )}
                          </td>
                        )}
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>

                {/* Totals row */}
                <tr className="border-t-2 border-border bg-surface-hover/30">
                  <td className="px-5 py-3 sticky left-0 bg-surface-hover/30 z-10">
                    <span className="text-xs font-bold text-text-primary uppercase tracking-wide">Totals</span>
                  </td>
                  {isVisible('revenue') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-sm font-bold text-text-primary tabular-nums">{formatCurrency(totals.revenue)}</span>
                    </td>
                  )}
                  {isVisible('cpc') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">${totals.cpc.toFixed(2)}</span>
                    </td>
                  )}
                  {isVisible('ctr') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">{totals.ctr.toFixed(2)}%</span>
                    </td>
                  )}
                  {isVisible('cpm') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">${totals.cpm.toFixed(2)}</span>
                    </td>
                  )}
                  {isVisible('aov') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">${totals.aov.toFixed(2)}</span>
                    </td>
                  )}
                  {isVisible('cvr') && (
                    <td className="px-3 py-3 text-right">
                      <span className="text-xs font-semibold text-text-secondary tabular-nums">{totals.cvr.toFixed(2)}%</span>
                    </td>
                  )}
                  {isVisible('alert') && <td className="px-3 py-3" />}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sortable Header ─────────────────────────────────────────────────────────
function SortableHeader({
  label,
  sortKey: key,
  currentSortKey,
  sortDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = currentSortKey === key;
  return (
    <th className="px-3 py-3 text-right">
      <button
        onClick={() => onSort(key)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors',
          isActive ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
        )}
      >
        {label}
        {isActive ? (
          sortDir === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

// ─── Metric Cell (with color coding) ─────────────────────────────────────────
function MetricCell({
  value,
  type,
  isActive,
  goodThreshold,
  badThreshold,
}: {
  value: number;
  type: 'currency' | 'percent';
  isActive: boolean;
  goodThreshold?: number;
  badThreshold?: number;
}) {
  if (!isActive) {
    return (
      <td className="px-3 py-3.5 text-right">
        <span className="text-xs text-text-dimmed">--</span>
      </td>
    );
  }

  let colorClass = 'text-text-primary';
  if (goodThreshold !== undefined && badThreshold !== undefined) {
    if (value >= goodThreshold) colorClass = 'text-success';
    else if (value <= badThreshold) colorClass = 'text-danger';
    else colorClass = 'text-warning';
  }

  return (
    <td className="px-3 py-3.5 text-right">
      <span className={cn('text-sm font-medium tabular-nums', colorClass)}>
        <AnimatedNumber value={value} type={type} />
      </span>
    </td>
  );
}
