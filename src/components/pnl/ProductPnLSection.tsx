'use client';

import { useState, useMemo } from 'react';
import type { ProductPnLData, ProductSortKey, ProductViewMode } from '@/types/productPnL';
import { ProductPnLCard } from '@/components/pnl/ProductPnLCard';
import { ProductPnLListRow } from '@/components/pnl/ProductPnLListRow';
import { cn } from '@/lib/utils';
import { Search, ArrowUpDown, ChevronDown, LayoutGrid, List, Megaphone, ChevronUp } from 'lucide-react';

interface ProductPnLSectionProps {
  products: ProductPnLData[];
}

const sortOptions: { label: string; key: ProductSortKey }[] = [
  { label: 'Revenue', key: 'revenue' },
  { label: 'Net Profit', key: 'netProfit' },
  { label: 'Margin', key: 'margin' },
  { label: 'Units Sold', key: 'unitsSold' },
  { label: 'Ad Spend', key: 'spend' },
  { label: 'Ad ROAS', key: 'adRoas' },
  { label: 'Product Name', key: 'productName' },
];

type FilterMode = 'all' | 'advertised' | 'not-advertised';

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
  { label: '', align: 'center' as const },
];

export function ProductPnLSection({ products }: ProductPnLSectionProps) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProductSortKey>('revenue');
  const [sortAsc, setSortAsc] = useState(false);
  const [viewMode, setViewMode] = useState<ProductViewMode>('card');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const advertisedCount = useMemo(
    () => products.filter((p) => p.isAdvertised).length,
    [products],
  );

  const filteredAndSorted = useMemo(() => {
    const query = search.toLowerCase().trim();

    // Filter by search
    let filtered = query
      ? products.filter(
          (p) =>
            p.productName.toLowerCase().includes(query) ||
            p.sku.toLowerCase().includes(query) ||
            (p.adName && p.adName.toLowerCase().includes(query)) ||
            (p.campaignName && p.campaignName.toLowerCase().includes(query))
        )
      : products;

    // Filter by ad status
    if (filterMode === 'advertised') {
      filtered = filtered.filter((p) => p.isAdvertised);
    } else if (filterMode === 'not-advertised') {
      filtered = filtered.filter((p) => !p.isAdvertised);
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      let cmp: number;
      if (sortKey === 'productName') {
        cmp = a.productName.localeCompare(b.productName);
      } else if (sortKey === 'spend') {
        cmp = a.fbMetrics.spend - b.fbMetrics.spend;
      } else if (sortKey === 'adRoas') {
        cmp = a.fbMetrics.roas - b.fbMetrics.roas;
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortAsc ? cmp : -cmp;
    });

    return sorted;
  }, [products, search, sortKey, sortAsc, filterMode]);

  function handleSortChange(newKey: ProductSortKey) {
    if (newKey === sortKey) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(newKey);
      setSortAsc(newKey === 'productName');
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-primary">
            Product Performance
          </h3>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted">
            {filteredAndSorted.length} of {products.length}
          </span>
          {advertisedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">
              <Megaphone className="h-3 w-3" />
              {advertisedCount} with ads
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex rounded-md border border-border bg-surface">
            {(['all', 'advertised', 'not-advertised'] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-medium transition-colors first:rounded-l-md last:rounded-r-md',
                  filterMode === mode
                    ? 'bg-brand/15 text-brand'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {mode === 'all' ? 'All' : mode === 'advertised' ? 'Running Ads' : 'No Ads'}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search products, ads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-48 rounded-md border border-border bg-surface pl-8 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <select
              value={sortKey}
              onChange={(e) => handleSortChange(e.target.value as ProductSortKey)}
              className="h-8 appearance-none rounded-md border border-border bg-surface pl-3 pr-8 text-xs text-text-primary focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            >
              {sortOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          </div>

          {/* Sort direction toggle */}
          <button
            onClick={() => setSortAsc((prev) => !prev)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted hover:text-text-primary transition-colors',
              sortAsc && 'text-brand'
            )}
            title={sortAsc ? 'Sort ascending' : 'Sort descending'}
          >
            {sortAsc ? <ChevronUp className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
          </button>

          {/* View mode toggle */}
          <div className="flex rounded-md border border-border bg-surface">
            <button
              onClick={() => setViewMode('card')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-l-md transition-colors',
                viewMode === 'card'
                  ? 'bg-brand/15 text-brand'
                  : 'text-text-muted hover:text-text-primary'
              )}
              title="Card view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-r-md transition-colors',
                viewMode === 'list'
                  ? 'bg-brand/15 text-brand'
                  : 'text-text-muted hover:text-text-primary'
              )}
              title="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Products */}
      {filteredAndSorted.length > 0 ? (
        viewMode === 'card' ? (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredAndSorted.map((product) => (
              <ProductPnLCard key={product.productId} product={product} />
            ))}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="border-b border-border">
                  {listHeaders.map((h) => (
                    <th
                      key={h.label || 'actions'}
                      className={cn(
                        'py-2 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted',
                        h.align === 'right' && 'text-right',
                        h.align === 'center' && 'text-center',
                        h.align === 'left' && 'text-left pl-4',
                      )}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((product) => (
                  <ProductPnLListRow key={product.productId} product={product} />
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="mt-8 flex flex-col items-center justify-center py-12">
          <Search className="mb-3 h-8 w-8 text-text-muted" />
          <p className="text-sm text-text-muted">
            {search
              ? `No products match "${search}"`
              : filterMode === 'advertised'
                ? 'No products with active ads'
                : 'No products without ads'}
          </p>
          <button
            onClick={() => {
              setSearch('');
              setFilterMode('all');
            }}
            className="mt-2 text-xs text-brand hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
