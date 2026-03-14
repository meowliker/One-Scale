'use client';

import type { ProductPnLData, ProductCategory } from '@/types/productPnl';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { Package, Megaphone } from 'lucide-react';
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
  const shippingAndFees = product.shipping + product.fees;

  return (
    <div className={cn('rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors', product.category === 'excluded' && 'opacity-50')}>
      {/* Product info */}
      <div className="flex items-center gap-3">
        {product.productImage ? (
          <img
            src={product.productImage}
            alt={product.productName}
            className="h-10 w-10 rounded object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-elevated">
            <Package className="h-5 w-5 text-text-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-text-primary">
            {product.productName}
          </h4>
          <div className="flex items-center gap-2">
            {product.sku && (
              <span className="text-xs text-text-muted font-mono">{product.sku}</span>
            )}
            {product.isAdvertised && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-secondary">
                <Megaphone className="h-2.5 w-2.5" />
                Ad
              </span>
            )}
          </div>
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

      {/* Confidence bar + parent product */}
      {product.classificationConfidence != null && product.classificationConfidence > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-surface overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                product.classificationConfidence >= 75 ? 'bg-emerald-500' :
                product.classificationConfidence >= 50 ? 'bg-amber-500' : 'bg-red-400'
              )}
              style={{ width: `${product.classificationConfidence}%` }}
            />
          </div>
          <span className="text-[9px] text-text-muted font-medium">{product.classificationConfidence}%</span>
        </div>
      )}
      {product.parentProduct && (
        <div className="mt-1 text-[10px] text-text-muted">
          {product.category === 'downsell' ? 'Downsell of' : 'Upsell for'}: <span className="text-text-secondary font-medium">{product.parentProduct}</span>
        </div>
      )}

      {/* P&L grid */}
      <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2">
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Revenue</p>
          <p className="text-sm font-semibold text-text-primary">{formatCurrency(product.revenue, currency)}</p>
        </div>
        {!isDigital && (
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">COGS</p>
          <p className="text-sm font-semibold text-text-primary">{formatCurrency(product.cogs, currency)}</p>
        </div>
        )}
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Net Profit</p>
          <p className={cn('text-sm font-semibold', isPositiveProfit ? 'text-emerald-500' : 'text-red-500')}>
            {formatCurrency(product.netProfit, currency)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Margin</p>
          <p className={cn('text-sm font-semibold', isPositiveProfit ? 'text-emerald-500' : 'text-red-500')}>
            {formatPercentage(product.margin)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Units</p>
          <p className="text-sm font-semibold text-text-primary">{product.unitsSold.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wide">Fees</p>
          <p className="text-sm font-semibold text-text-primary">{formatCurrency(shippingAndFees, currency)}</p>
        </div>
      </div>

      {/* Ad spend row — only if advertised */}
      {product.isAdvertised && product.fbMetrics.spend > 0 && (
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="text-text-muted">Ad Spend</span>
          <span className="text-text-primary font-semibold">{formatCurrency(product.fbMetrics.spend, currency)}</span>
          <span className="text-text-muted">ROAS</span>
          <span className="text-text-primary font-semibold">{product.fbMetrics.roas.toFixed(2)}x</span>
        </div>
      )}
    </div>
  );
}
