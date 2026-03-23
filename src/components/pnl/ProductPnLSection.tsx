'use client';

import { useState, useMemo } from 'react';
import type { ProductPnLData, ProductSortKey, ProductViewMode, ProductCategory } from '@/types/productPnl';
import { REVIEW_CONFIDENCE_THRESHOLD } from '@/lib/intelligence/constants';
import { useStoreStore } from '@/stores/storeStore';
import { ProductPnLCard } from '@/components/pnl/ProductPnLCard';
import { ProductPnLListRow } from '@/components/pnl/ProductPnLListRow';
import { formatCurrency, cn } from '@/lib/utils';
import { Search, ArrowUpDown, ChevronDown, LayoutGrid, List, ChevronUp } from 'lucide-react';

interface ProductPnLSectionProps {
  products: ProductPnLData[];
  isDigital?: boolean;
  currency?: string;
}

const sortOptions: { label: string; key: ProductSortKey }[] = [
  { label: 'Revenue', key: 'revenue' },
  { label: 'Net Profit', key: 'netProfit' },
  { label: 'Margin', key: 'margin' },
  { label: 'Units Sold', key: 'unitsSold' },
  { label: 'Ad Spend', key: 'spend' },
  { label: 'Product Name', key: 'productName' },
];

type ClassificationFilter = 'all' | 'main' | 'upsells' | 'needs-review';

const listHeaders = [
  { label: 'Product', align: 'left' as const },
  { label: 'Revenue', align: 'right' as const },
  { label: 'COGS', align: 'right' as const },
  { label: 'Net Profit', align: 'right' as const },
  { label: 'Margin', align: 'right' as const },
  { label: 'Units', align: 'right' as const },
  { label: 'Ad Spend', align: 'right' as const },
  { label: 'ROAS', align: 'right' as const },
  { label: 'CPC', align: 'right' as const },
  { label: 'CTR', align: 'right' as const },
  { label: 'Purchases', align: 'right' as const },
  { label: 'Cost/Purch', align: 'right' as const },
  { label: 'Type', align: 'center' as const },
  { label: '', align: 'center' as const },
];

export function ProductPnLSection({ products, isDigital = false, currency = 'USD' }: ProductPnLSectionProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProductSortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ProductViewMode>('card');
  const [filterMode, setFilterMode] = useState<ClassificationFilter>('main');
  const activeStoreId = useStoreStore((s) => s.activeStoreId) || 'default';
  const [localClassifications, setLocalClassifications] = useState<Record<string, ProductCategory>>({});

  function handleClassificationChange(productId: string, newClassification: ProductCategory) {
    setLocalClassifications(prev => ({ ...prev, [productId]: newClassification }));
  }

  // Tab counts
  const tabCounts = useMemo(() => {
    const withOverrides = products.map(p => {
      const override = localClassifications[p.productId];
      return override ? { ...p, category: override } : p;
    });
    return {
      main: withOverrides.filter(p => (p.category || '').toLowerCase() === 'main').length,
      upsells: withOverrides.filter(p => {
        const cat = (p.category || '').toLowerCase();
        return cat === 'upsell' || cat === 'downsell' || cat === 'addon';
      }).length,
      review: withOverrides.filter(p =>
        p.needsReview || (p.category || '').toLowerCase() === 'pending' ||
        (p.classificationConfidence != null && p.classificationConfidence > 0 && p.classificationConfidence < REVIEW_CONFIDENCE_THRESHOLD)
      ).length,
      all: withOverrides.length,
    };
  }, [products, localClassifications]);

  const filteredAndSorted = useMemo(() => {
    const query = search.toLowerCase().trim();
    let withOverrides = products.map(p => {
      const override = localClassifications[p.productId];
      if (override) return { ...p, category: override, manualOverride: true };
      return p;
    });

    // Filter by classification
    switch (filterMode) {
      case 'main':
        withOverrides = withOverrides.filter(p => (p.category || '').toLowerCase() === 'main');
        break;
      case 'upsells':
        withOverrides = withOverrides.filter(p => {
          const cat = (p.category || '').toLowerCase();
          return cat === 'upsell' || cat === 'downsell' || cat === 'addon';
        });
        break;
      case 'needs-review':
        withOverrides = withOverrides.filter(p =>
          p.needsReview || (p.category || '').toLowerCase() === 'pending' ||
          (p.classificationConfidence != null && p.classificationConfidence > 0 && p.classificationConfidence < REVIEW_CONFIDENCE_THRESHOLD)
        );
        break;
    }

    // Search
    const filtered = query
      ? withOverrides.filter(p =>
          p.productName.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          (p.adName && p.adName.toLowerCase().includes(query)) ||
          (p.campaignName && p.campaignName.toLowerCase().includes(query))
        )
      : withOverrides;

    // Sort
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'productName') cmp = a.productName.localeCompare(b.productName);
      else if (sortKey === 'spend') cmp = a.fbMetrics.spend - b.fbMetrics.spend;
      else if (sortKey === 'adRoas') cmp = a.fbMetrics.roas - b.fbMetrics.roas;
      else cmp = a[sortKey] - b[sortKey];
      return sortAsc ? cmp : -cmp;
    });
  }, [products, search, sortKey, sortAsc, filterMode, localClassifications]);

  function handleSortChange(newKey: ProductSortKey) {
    if (newKey === sortKey) setSortAsc(prev => !prev);
    else { setSortKey(newKey); setSortAsc(newKey === 'productName'); }
  }

  // Totals for main tab
  const totals = useMemo(() => {
    if (filterMode !== 'main') return null;
    const mainProducts = filteredAndSorted;
    return {
      revenue: mainProducts.reduce((s, p) => s + p.revenue, 0),
      adSpend: mainProducts.reduce((s, p) => s + (p.fbMetrics?.spend ?? 0), 0),
      fees: mainProducts.reduce((s, p) => s + p.fees, 0),
      netProfit: mainProducts.reduce((s, p) => s + p.netProfit, 0),
      count: mainProducts.length,
    };
  }, [filteredAndSorted, filterMode]);

  const tabs: Array<{ id: ClassificationFilter; label: string; count: number; color: string }> = [
    { id: 'main', label: 'Main', count: tabCounts.main, color: 'emerald' },
    { id: 'upsells', label: 'Upsells', count: tabCounts.upsells, color: 'blue' },
    { id: 'needs-review', label: 'Review', count: tabCounts.review, color: 'amber' },
    { id: 'all', label: 'All', count: tabCounts.all, color: 'text-muted' },
  ];

  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-5 pt-3 pb-4 shadow-sm">
      {/* Header + controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">Product Performance</h3>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text" placeholder="Search..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-40 rounded-md border border-border bg-surface pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="relative">
            <select value={sortKey} onChange={(e) => handleSortChange(e.target.value as ProductSortKey)}
              className="h-8 appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-xs text-text-primary focus:border-brand focus:outline-none">
              {sortOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          </div>
          <button onClick={() => setSortAsc(p => !p)} title={sortAsc ? 'Ascending' : 'Descending'}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:text-text-primary">
            {sortAsc ? <ChevronUp className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          </button>
          <div className="flex rounded-md border border-border bg-surface">
            <button onClick={() => setViewMode('card')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-l-md transition-colors', viewMode === 'card' ? 'bg-brand/15 text-brand' : 'text-text-muted hover:text-text-primary')} title="Card view">
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setViewMode('list')}
              className={cn('flex h-8 w-8 items-center justify-center rounded-r-md transition-colors', viewMode === 'list' ? 'bg-brand/15 text-brand' : 'text-text-muted hover:text-text-primary')} title="List view">
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Estimated fees banner */}
      {products.some(p => p.feesEstimated) && (
        <div className="flex items-center gap-2.5 text-sm rounded-lg px-4 py-2.5 mb-3 border" style={{ backgroundColor: '#fffbeb', borderColor: '#fbbf24', color: '#92400e' }}>
          <span className="text-base">&#9203;</span>
          <span className="font-medium">Today&apos;s fees are estimated — final figures available after settlement (1-3 days).</span>
        </div>
      )}

      {/* Tabs with count badges */}
      <div className="flex items-center gap-1 mb-3">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterMode(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors',
              filterMode === tab.id
                ? 'bg-surface shadow-sm text-text-primary border border-border'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {tab.label}
            <span className={cn(
              'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
              filterMode === tab.id
                ? tab.color === 'emerald' ? 'bg-emerald-500/15 text-emerald-500'
                  : tab.color === 'blue' ? 'bg-blue-500/15 text-blue-500'
                  : tab.color === 'amber' ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-surface-hover text-text-muted'
                : 'bg-surface-hover text-text-muted',
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Products */}
      {filteredAndSorted.length > 0 ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredAndSorted.map(product => (
              <ProductPnLCard key={product.productId} product={product} isDigital={isDigital} storeId={activeStoreId} onClassificationChange={handleClassificationChange} currency={currency} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-border">
                  {listHeaders.filter(h => !(isDigital && h.label === 'COGS')).map(h => (
                    <th key={h.label || 'actions'} className={cn('py-2 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted', h.align === 'right' && 'text-right', h.align === 'center' && 'text-center', h.align === 'left' && 'text-left pl-4')}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map(product => (
                  <ProductPnLListRow key={product.productId} product={product} isDigital={isDigital} storeId={activeStoreId} onClassificationChange={handleClassificationChange} currency={currency} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center py-10">
          <Search className="mb-3 h-7 w-7 text-text-muted" />
          <p className="text-sm text-text-muted">{search ? `No products match "${search}"` : 'No products match the current filter'}</p>
          <button onClick={() => { setSearch(''); setFilterMode('all'); }} className="mt-2 text-xs text-brand hover:underline">Clear filters</button>
        </div>
      )}

      {/* Totals row (main tab only) */}
      {totals && totals.count > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
          <span className="text-text-muted font-medium">Totals ({totals.count} main)</span>
          <div className="flex items-center gap-4">
            <span className="text-text-secondary">Revenue: <span className="text-text-primary font-semibold">{formatCurrency(totals.revenue, currency)}</span></span>
            <span className="text-text-secondary">Ad Spend: <span className="text-orange-500 font-semibold">{formatCurrency(totals.adSpend, currency)}</span></span>
            <span className="text-text-secondary">Fees: <span className="text-text-primary font-semibold">{formatCurrency(totals.fees, currency)}</span></span>
            <span className="text-text-secondary">Net: <span className={cn('font-semibold', totals.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500')}>{formatCurrency(totals.netProfit, currency)}</span></span>
          </div>
        </div>
      )}
    </div>
  );
}
