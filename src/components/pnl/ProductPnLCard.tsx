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

export function ProductPnLCard({ product, isDigital = false, storeId, onClassificationChange, currency = 'USD' }: ProductPnLCardProps) {
  const isPositiveProfit = product.netProfit >= 0;
  const adSpend = product.fbMetrics?.spend ?? 0;

  return (
    <div className={cn(
      'rounded-xl border border-border bg-surface p-4 shadow-sm hover:bg-surface-hover transition-colors',
      product.category === 'excluded' && 'opacity-50',
    )}>
      {/* Header row: image + name + badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {product.productImage ? (
            <img
              src={product.productImage}
              alt={product.productName}
              className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.nextElementSibling?.classList.remove('hidden');
              }}
            />
          ) : null}
          {!product.productImage && (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated flex-shrink-0">
              <Package className="h-5 w-5 text-text-muted" />
            </div>
          )}
          {/* Hidden fallback for broken images */}
          <div className="hidden h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated flex-shrink-0">
            <Package className="h-5 w-5 text-text-muted" />
          </div>
          <span className="text-sm font-medium text-text-primary truncate max-w-[160px]">
            {product.productName}
          </span>
        </div>
        <ClassificationBadge
          productId={product.productId}
          storeId={storeId}
          classification={product.category}
          confidence={product.classificationConfidence}
          method={product.classificationMethod}
          signals={product.classificationSignals}
          behavioralSignals={product.behavioralSignals}
          parentProduct={product.parentProduct}
          needsReview={product.needsReview}
          manualOverride={product.manualOverride}
          lastAnalyzed={product.lastAnalyzed}
          shopifyUrl={product.shopifyUrl}
          onClassificationChange={onClassificationChange}
        />
      </div>

      {/* Confidence bar */}
      {product.classificationConfidence != null && product.classificationConfidence > 0 && (
        <div className="w-full bg-surface rounded-full h-1.5 mb-3">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all',
              product.classificationConfidence >= 75 ? 'bg-emerald-500' :
              product.classificationConfidence >= 50 ? 'bg-amber-500' : 'bg-red-400',
            )}
            style={{ width: `${product.classificationConfidence}%` }}
          />
        </div>
      )}

      {/* Metrics grid — row 1 */}
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

      {/* Metrics grid — row 2 */}
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
    </div>
  );
}
