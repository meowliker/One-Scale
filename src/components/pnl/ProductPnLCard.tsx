'use client';

import type { ProductPnLData, ProductCategory } from '@/types/productPnl';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { Package } from 'lucide-react';
import { ClassificationBadge } from './ClassificationBadge';

interface ProductPnLCardProps {
  product: ProductPnLData;
  isDigital?: boolean;
  storeId: string;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
  currency?: string;
}

const BADGE_CONFIG: Record<string, { label: string; cls: string }> = {
  main: { label: '● MAIN', cls: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
  upsell: { label: '↑ UPSELL', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  downsell: { label: '↓ DOWN', cls: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  bundle: { label: '⊞ BUNDLE', cls: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  pending: { label: '? REVIEW', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
  excluded: { label: '✕ EXCL', cls: 'bg-surface-hover text-text-muted border-border' },
};

export function ProductPnLCard({ product, isDigital = false, storeId, onClassificationChange, currency = 'USD' }: ProductPnLCardProps) {
  const isPositiveProfit = product.netProfit >= 0;
  const adSpend = product.fbMetrics?.spend ?? 0;
  const cat = (product.category || 'pending').toLowerCase();
  const isUpsell = cat === 'upsell' || cat === 'downsell' || cat === 'addon';
  const isReview = cat === 'pending' || product.needsReview;
  const badge = BADGE_CONFIG[cat] ?? BADGE_CONFIG.pending;

  return (
    <div className={cn(
      'rounded-xl border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-hover',
      cat === 'excluded' ? 'opacity-50 border-border' : 'border-border',
    )}>
      {/* Header: image + name + badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {product.productImage ? (
            <img src={product.productImage} alt={product.productName}
              className="h-9 w-9 rounded-lg object-cover flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-elevated flex-shrink-0">
              <Package className="h-4 w-4 text-text-muted" />
            </div>
          )}
          <span className="text-sm font-medium text-text-primary truncate">{product.productName}</span>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0', badge.cls)}>
          {badge.label}
        </span>
      </div>

      {/* Confidence bar */}
      {product.classificationConfidence != null && product.classificationConfidence > 0 && (
        <div className="w-full bg-surface rounded-full h-1 mb-3">
          <div className={cn('h-1 rounded-full', product.classificationConfidence >= 75 ? 'bg-emerald-500' : product.classificationConfidence >= 50 ? 'bg-amber-500' : 'bg-red-400')}
            style={{ width: `${product.classificationConfidence}%` }} />
        </div>
      )}

      {/* Parent product (upsells only) */}
      {isUpsell && product.parentProduct && (
        <div className="text-[10px] text-text-muted mb-2">
          ↳ {cat === 'downsell' ? 'Downsell of' : 'Upsell of'}: <span className="text-text-secondary font-medium">{product.parentProduct}</span>
        </div>
      )}

      {/* Metrics — MAIN product card */}
      {!isUpsell && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Revenue</p>
              <p className="text-sm font-semibold text-text-primary">{formatCurrency(product.revenue, currency)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Net Profit</p>
              <p className={cn('text-sm font-semibold', isPositiveProfit ? 'text-emerald-500' : 'text-red-500')}>
                {formatCurrency(product.netProfit, currency)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Margin</p>
              <p className={cn('text-sm font-semibold', product.margin >= 20 ? 'text-emerald-500' : 'text-red-500')}>
                {formatPercentage(product.margin)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Orders</p>
              <p className="text-sm font-semibold text-text-primary">{product.unitsSold.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Ad Spend</p>
              <p className={cn('text-sm font-semibold', adSpend > 0 ? 'text-orange-500' : 'text-text-muted')}>
                {adSpend > 0 ? formatCurrency(adSpend, currency) : '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wide">Fees</p>
              <p className="text-sm font-semibold text-text-primary">{formatCurrency(product.fees, currency)}</p>
            </div>
          </div>
        </>
      )}

      {/* Metrics — UPSELL card (simpler) */}
      {isUpsell && (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Revenue</p>
            <p className="text-sm font-semibold text-text-primary">{formatCurrency(product.revenue, currency)}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">Orders</p>
            <p className="text-sm font-semibold text-text-primary">{product.unitsSold.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">AOV Lift</p>
            <p className="text-sm font-semibold text-blue-500">
              {product.unitsSold > 0 ? `+${formatCurrency(product.revenue / product.unitsSold, currency)}` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Quick actions — Needs Review cards */}
      {isReview && onClassificationChange && (
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-2">
          <button onClick={() => onClassificationChange(product.productId, 'main')} className="text-[10px] font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-colors">
            ✓ Main
          </button>
          <button onClick={() => onClassificationChange(product.productId, 'upsell')} className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors">
            ↑ Upsell
          </button>
          <button onClick={() => onClassificationChange(product.productId, 'excluded')} className="text-[10px] font-semibold px-2 py-1 rounded bg-surface-hover text-text-muted hover:bg-surface transition-colors">
            ✕ Exclude
          </button>
        </div>
      )}
    </div>
  );
}
