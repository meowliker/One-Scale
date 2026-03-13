'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { ProductBreakdownItem } from '@/app/api/pnl/product-breakdown/route';
import { useStoreStore } from '@/stores/storeStore';
import { formatCurrency } from '@/lib/utils';
import { todayInTimezone, daysAgoInTimezone } from '@/lib/timezone';
import { Search, Save, Loader2, TrendingUp, TrendingDown, Zap } from 'lucide-react';

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | '90d';

const DATE_PRESETS: { label: string; key: PresetKey }[] = [
  { label: 'Today', key: 'today' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: '7D', key: '7d' },
  { label: '30D', key: '30d' },
  { label: '90D', key: '90d' },
];

const GENERIC_VENDORS = new Set([
  'my store',
  'my shop',
  'shopify',
  'default vendor',
]);

function isGenericVendor(vendor?: string | null): boolean {
  if (!vendor) return true;
  return GENERIC_VENDORS.has(vendor.toLowerCase().trim());
}

function getInitials(title?: string): string {
  if (!title) return '?';
  return title
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function getDateRangeForPreset(preset: PresetKey): { from: string; to: string } {
  const today = todayInTimezone();
  const yesterday = daysAgoInTimezone(1);

  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday':
      return { from: yesterday, to: yesterday };
    case '7d':
      return { from: daysAgoInTimezone(7), to: today };
    case '30d':
      return { from: daysAgoInTimezone(30), to: today };
    case '90d':
      return { from: daysAgoInTimezone(90), to: today };
  }
}

interface COGSManagerProps {
  onSave?: (updates: Record<string, number>) => Promise<void>;
}

function TableHeader() {
  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-text-secondary border-b border-border">
      <span>Product</span>
      <span className="text-right">Revenue</span>
      <span className="text-right">Ad Spend</span>
      <span className="text-right">Fees</span>
      <span className="text-right">COGS / unit</span>
      <span className="text-right">Net Profit</span>
      <span className="text-right">Margin</span>
    </div>
  );
}

interface ProductRowProps {
  product: ProductBreakdownItem;
  cost: number;
  onChange: (id: string, value: number) => void;
  isDigital: boolean;
}

function ProductRow({ product, cost, onChange, isDigital }: ProductRowProps) {
  const showVendor = !isGenericVendor(product.vendor);

  return (
    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 items-center px-4 py-3 border-b border-border-light last:border-0 hover:bg-surface-hover transition-colors">
      {/* Product info */}
      <div className="flex items-center gap-3 min-w-0">
        {product.image ? (
          <img
            src={product.image}
            alt={product.title}
            className="h-9 w-9 rounded-lg object-cover border border-border flex-shrink-0"
          />
        ) : (
          <div className="h-9 w-9 rounded-lg bg-surface-hover flex items-center justify-center text-[10px] font-bold text-text-secondary flex-shrink-0">
            {getInitials(product.title)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary truncate">{product.title}</span>
            {product.classification === 'UPSELL' && (
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 flex-shrink-0">
                Upsell
              </span>
            )}
            {product.classification === 'BUNDLE' && (
              <span className="rounded-full bg-purple-50 dark:bg-purple-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600 flex-shrink-0">
                Bundle
              </span>
            )}
            {isDigital && (
              <span className="flex items-center gap-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600 flex-shrink-0">
                <Zap className="h-2.5 w-2.5" />
                Digital
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {showVendor && <span className="text-[11px] text-text-secondary">{product.vendor}</span>}
            <span className="text-[11px] text-text-secondary">
              {product.units_sold} units &middot; {product.order_count} orders
            </span>
          </div>
        </div>
      </div>

      {/* Revenue */}
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums text-text-primary">{formatCurrency(product.revenue)}</span>
      </div>

      {/* Ad Spend */}
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums text-orange-600">{formatCurrency(product.ad_spend)}</span>
      </div>

      {/* Fees */}
      <div className="text-right">
        <span className="text-sm font-medium tabular-nums text-amber-600">{formatCurrency(product.fees)}</span>
      </div>

      {/* COGS/unit */}
      <div className="text-right">
        {isDigital ? (
          <div className="flex items-center justify-end gap-1">
            <span className="text-sm font-medium text-text-secondary tabular-nums">$0.00</span>
            <span className="text-[9px] text-text-dimmed italic">auto</span>
          </div>
        ) : (
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-text-secondary">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cost === 0 ? '' : cost}
              placeholder="0.00"
              onChange={(e) => onChange(product.product_id, parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg border border-border bg-surface pl-5 pr-2 py-1.5 text-right text-sm font-medium tabular-nums text-text-primary focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-100"
            />
          </div>
        )}
      </div>

      {/* Net Profit */}
      <div className="text-right">
        <div className="flex items-center justify-end gap-1">
          {product.net_profit >= 0 ? (
            <TrendingUp className="h-3 w-3 text-emerald-500" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500" />
          )}
          <span className={`text-sm font-semibold tabular-nums ${product.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {formatCurrency(product.net_profit)}
          </span>
        </div>
      </div>

      {/* Margin */}
      <div className="text-right">
        <span
          className={`text-sm font-semibold tabular-nums ${
            isDigital
              ? 'text-indigo-500'
              : product.margin_pct >= 30
                ? 'text-emerald-600'
                : product.margin_pct >= 10
                  ? 'text-amber-500'
                  : 'text-red-500'
          }`}
        >
          {product.margin_pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function COGSManager({ onSave }: COGSManagerProps) {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const [products, setProducts] = useState<ProductBreakdownItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<PresetKey>('30d');

  const [costs, setCosts] = useState<Record<string, number>>({});
  const [originalCosts, setOriginalCosts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showMainOnly, setShowMainOnly] = useState(true);

  // 60s polling counter — triggers re-fetch when incremented
  const [pollCounter, setPollCounter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPollCounter((c) => c + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Fetch products from product-breakdown API
  useEffect(() => {
    if (!activeStoreId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const { from, to } = getDateRangeForPreset(activePreset);

    fetch(`/api/pnl/product-breakdown?storeId=${encodeURIComponent(activeStoreId)}&from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((res: { ok: boolean; breakdown?: ProductBreakdownItem[]; error?: string }) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.error ?? 'Failed to load products');
          return;
        }
        const data = res.breakdown ?? [];
        setProducts(data);
        const costMap = Object.fromEntries(data.map((p) => [p.product_id, p.cost_per_unit]));
        setCosts(costMap);
        setOriginalCosts(costMap);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load products');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeStoreId, activePreset, pollCounter]);

  const hasChanges = useMemo(() => {
    return Object.keys(costs).some((id) => costs[id] !== originalCosts[id]);
  }, [costs, originalCosts]);

  const handleChange = useCallback((id: string, value: number) => {
    setCosts((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  }, []);

  const handleSave = async () => {
    if (!onSave || !hasChanges) return;
    setSaving(true);
    try {
      const updates: Record<string, number> = {};
      for (const id of Object.keys(costs)) {
        if (costs[id] !== originalCosts[id]) updates[id] = costs[id];
      }
      await onSave(updates);
      setOriginalCosts({ ...costs });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  // Filter by search
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = products;
    if (q) {
      result = result.filter(
        (p) =>
          (p.title ?? '').toLowerCase().includes(q) ||
          (p.vendor ?? '').toLowerCase().includes(q) ||
          (p.product_type ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, search]);

  // Apply Main/All filter
  const displayProducts = useMemo(() => {
    if (showMainOnly) {
      return filtered.filter((p) => p.classification === 'MAIN');
    }
    return filtered;
  }, [filtered, showMainOnly]);

  // Count main products for badge
  const mainCount = useMemo(() => products.filter((p) => p.classification === 'MAIN').length, [products]);

  // Summary totals (based on displayed products)
  const totals = useMemo(() => {
    return displayProducts.reduce(
      (acc, p) => ({
        revenue: acc.revenue + p.revenue,
        adSpend: acc.adSpend + p.ad_spend,
        fees: acc.fees + p.fees,
        netProfit: acc.netProfit + p.net_profit,
      }),
      { revenue: 0, adSpend: 0, fees: 0, netProfit: 0 }
    );
  }, [displayProducts]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface-hover shadow-sm p-5">
        <div className="flex items-center justify-center h-24 gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-text-secondary" />
          <span className="text-sm text-text-secondary">Loading product performance...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30 shadow-sm p-5">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface-hover shadow-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-base font-bold uppercase tracking-widest text-text-secondary">
            Products
          </p>
          <p className="text-sm text-text-secondary mt-0.5">
            Revenue, costs & profitability &middot; {displayProducts.length} products
            {showMainOnly && products.length !== mainCount && ` of ${products.length} total`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Main/All toggle */}
          <div className="flex items-center gap-1 bg-surface-active rounded-lg p-0.5">
            <button
              onClick={() => setShowMainOnly(true)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                showMainOnly
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Main
            </button>
            <button
              onClick={() => setShowMainOnly(false)}
              className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                !showMainOnly
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              All
            </button>
          </div>

          {/* Date range pills */}
          <div className="flex items-center gap-1 bg-surface-active rounded-lg p-0.5">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => setActivePreset(preset.key)}
                className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                  activePreset === preset.key
                    ? 'bg-surface text-text-primary shadow-sm'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="h-8 rounded-xl border border-border bg-surface pl-8 pr-3 text-xs text-text-primary placeholder:text-text-dimmed focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-100 w-48"
            />
          </div>
        </div>
      </div>

      {/* Summary totals bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Revenue', value: totals.revenue, color: 'text-emerald-600' },
          { label: 'Total Ad Spend', value: totals.adSpend, color: 'text-orange-600' },
          { label: 'Total Fees', value: totals.fees, color: 'text-amber-600' },
          { label: 'Net Profit', value: totals.netProfit, color: totals.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border bg-surface p-3">
            <p className="text-sm font-semibold uppercase tracking-widest text-text-secondary">{item.label}</p>
            <p className={`text-2xl font-bold tabular-nums mt-0.5 ${item.color}`}>{formatCurrency(item.value)}</p>
          </div>
        ))}
      </div>

      {/* Product table */}
      {displayProducts.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-text-secondary">
          {products.length === 0
            ? 'No products with sales in this period'
            : showMainOnly
              ? 'No main products match your search'
              : 'No products match your search'}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <TableHeader />
          {displayProducts.map((product) => (
            <ProductRow
              key={product.product_id}
              product={product}
              cost={costs[product.product_id] ?? 0}
              onChange={handleChange}
              isDigital={!product.requires_shipping}
            />
          ))}
        </div>
      )}

      {/* Save bar */}
      {hasChanges && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-950/30 px-4 py-3">
          <span className="text-xs text-indigo-600 font-medium">You have unsaved COGS changes</span>
          <button
            onClick={handleSave}
            disabled={saving || !onSave}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving\u2026' : saved ? 'Saved \u2713' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  );
}
