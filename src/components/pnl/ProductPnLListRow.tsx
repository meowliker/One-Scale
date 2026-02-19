'use client';

import type { ProductPnLData } from '@/types/productPnL';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { ExternalLink, Package, Megaphone, Globe } from 'lucide-react';

interface ProductPnLListRowProps {
  product: ProductPnLData;
}

function fmtMetric(key: string, value: number): string {
  if (key === 'roas') return `${value.toFixed(2)}x`;
  if (key === 'cpc' || key === 'cpm' || key === 'aov' || key === 'spend' || key === 'costPerPurchase')
    return formatCurrency(value);
  if (key === 'ctr' || key === 'atcRate') return formatPercentage(value);
  if (key === 'impressions' || key === 'clicks' || key === 'purchases' || key === 'reach')
    return value.toLocaleString();
  if (key === 'frequency') return value.toFixed(2);
  return value.toFixed(2);
}

export function ProductPnLListRow({ product }: ProductPnLListRowProps) {
  const isPositiveProfit = product.netProfit >= 0;
  const isPositiveMargin = product.margin >= 0;

  return (
    <tr className="border-b border-border hover:bg-surface-hover transition-colors">
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
              <span className="truncate text-sm font-medium text-text-primary">
                {product.productName}
              </span>
              {product.isAdvertised && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/15 px-1.5 py-0.5 text-[9px] font-medium text-brand flex-shrink-0">
                  <Megaphone className="h-2.5 w-2.5" />
                  Ad
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-text-muted">
              <span className="font-mono">{product.sku}</span>
              {product.isAdvertised && product.adName && (
                <>
                  <span className="text-border">|</span>
                  <Globe className="h-2.5 w-2.5 text-brand" />
                  <span className="truncate max-w-[200px]">{product.adName}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Revenue */}
      <td className="px-2 py-3 text-right">
        <span className="text-sm font-medium text-emerald-400">
          {formatCurrency(product.revenue)}
        </span>
      </td>

      {/* COGS */}
      <td className="px-2 py-3 text-right">
        <span className="text-sm text-red-400">{formatCurrency(product.cogs)}</span>
      </td>

      {/* Net Profit */}
      <td className="px-2 py-3 text-right">
        <span className={cn('text-sm font-medium', isPositiveProfit ? 'text-emerald-400' : 'text-red-400')}>
          {formatCurrency(product.netProfit)}
        </span>
      </td>

      {/* Margin */}
      <td className="px-2 py-3 text-right">
        <span className={cn('text-sm', isPositiveMargin ? 'text-emerald-400' : 'text-red-400')}>
          {formatPercentage(product.margin)}
        </span>
      </td>

      {/* Units */}
      <td className="px-2 py-3 text-right">
        <span className="text-sm text-text-primary">{product.unitsSold.toLocaleString()}</span>
      </td>

      {/* FB Spend */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-orange-400">{formatCurrency(product.fbMetrics.spend)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* ROAS */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className={cn(
            'text-sm font-medium',
            product.fbMetrics.roas >= 2 ? 'text-emerald-400' : product.fbMetrics.roas >= 1 ? 'text-amber-400' : 'text-red-400'
          )}>
            {product.fbMetrics.roas.toFixed(2)}x
          </span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* CPC */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-sky-400">{formatCurrency(product.fbMetrics.cpc)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* CTR */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-amber-400">{formatPercentage(product.fbMetrics.ctr)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Purchases */}
      <td className="px-2 py-3 text-right">
        {product.isAdvertised ? (
          <span className="text-sm text-teal-400">{product.fbMetrics.purchases}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
      </td>

      {/* Cost/Purchase */}
      <td className="px-2 py-3 text-right pr-4">
        {product.isAdvertised ? (
          <span className="text-sm text-rose-400">{formatCurrency(product.fbMetrics.costPerPurchase)}</span>
        ) : (
          <span className="text-xs text-text-muted">-</span>
        )}
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
