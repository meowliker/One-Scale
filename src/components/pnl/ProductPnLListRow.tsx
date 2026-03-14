'use client';

import type { ProductPnLData, ProductCategory } from '@/types/productPnl';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { ExternalLink, Package, Megaphone } from 'lucide-react';
import { ClassificationBadge } from './ClassificationBadge';

interface ProductPnLListRowProps {
  product: ProductPnLData;
  isDigital?: boolean;
  storeId: string;
  onClassificationChange?: (productId: string, newClassification: ProductCategory) => void;
}

export function ProductPnLListRow({ product, isDigital = false, storeId, onClassificationChange }: ProductPnLListRowProps) {
  const isPositiveProfit = product.netProfit >= 0;

  return (
    <tr className={cn('border-b border-border hover:bg-surface-hover transition-colors', product.category === 'excluded' && 'opacity-50')}>
      {/* Product */}
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-3">
          {product.productImage ? (
            <img
              src={product.productImage}
              alt={product.productName}
              className="h-8 w-8 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-surface-elevated flex-shrink-0">
              <Package className="h-4 w-4 text-text-muted" />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('truncate text-sm font-medium text-text-primary', product.category === 'excluded' && 'line-through')}>
                {product.productName}
              </span>
              {product.isAdvertised && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-medium text-text-secondary flex-shrink-0">
                  <Megaphone className="h-2.5 w-2.5" />
                  Ad
                </span>
              )}
            </div>
            {product.sku && (
              <span className="text-[10px] text-text-muted font-mono">{product.sku}</span>
            )}
          </div>
        </div>
      </td>

      {/* Revenue */}
      <td className="px-2 py-3 text-right">
        <span className="text-sm font-medium text-text-primary">{formatCurrency(product.revenue)}</span>
      </td>

      {/* COGS */}
      {!isDigital && (
      <td className="px-2 py-3 text-right">
        <span className="text-sm text-text-primary">{formatCurrency(product.cogs)}</span>
      </td>
      )}

      {/* Net Profit */}
      <td className="px-2 py-3 text-right">
        <span className={cn('text-sm font-medium', isPositiveProfit ? 'text-emerald-500' : 'text-red-500')}>
          {formatCurrency(product.netProfit)}
        </span>
      </td>

      {/* Margin */}
      <td className="px-2 py-3 text-right">
        <span className={cn('text-sm', isPositiveProfit ? 'text-emerald-500' : 'text-red-500')}>
          {formatPercentage(product.margin)}
        </span>
      </td>

      {/* Units */}
      <td className="px-2 py-3 text-right">
        <span className="text-sm text-text-primary">{product.unitsSold.toLocaleString()}</span>
      </td>

      {/* Ad Spend */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-text-primary">{formatCurrency(product.fbMetrics.spend)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* ROAS */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm font-medium text-text-primary">
            {product.fbMetrics.roas.toFixed(2)}x
          </span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* CPC */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-text-primary">{formatCurrency(product.fbMetrics.cpc)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* CTR */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-text-primary">{formatPercentage(product.fbMetrics.ctr)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Purchases */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-text-primary">{product.fbMetrics.purchases}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Cost/Purchase */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-text-primary">{formatCurrency(product.fbMetrics.costPerPurchase)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Attribution Method */}
      <td className="px-2 py-3 text-center">
        {product.attributionMethod ? (
          <span className="text-[10px] font-medium text-text-secondary">{product.attributionMethod}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Confidence Score */}
      <td className="px-2 py-3 text-right">
        {product.confidenceScore != null ? (
          <span className="text-sm text-text-primary">{product.confidenceScore}%</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Type */}
      <td className="px-2 py-3 text-center">
        <ClassificationBadge
          productId={product.productId}
          storeId={storeId}
          classification={product.category}
          confidence={product.classificationConfidence}
          method={product.classificationMethod}
          signals={product.classificationSignals}
          needsReview={product.needsReview}
          manualOverride={product.manualOverride}
          lastAnalyzed={product.lastAnalyzed}
          shopifyUrl={product.shopifyUrl}
          onClassificationChange={onClassificationChange}
        />
      </td>

      {/* Link */}
      <td className="px-2 py-3 text-center">
        {product.shopifyUrl && (
          <a
            href={product.shopifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </td>
    </tr>
  );
}
