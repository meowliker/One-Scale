'use client';

import type { ProductPnLData } from '@/types/productPnL';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { ExternalLink, Package, Megaphone, Globe } from 'lucide-react';

interface ProductPnLCardProps {
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

const fbMetricBadges = [
  { key: 'roas' as const, label: 'ROAS', bg: 'bg-emerald-500/10 text-emerald-400' },
  { key: 'spend' as const, label: 'Spend', bg: 'bg-orange-500/10 text-orange-400' },
  { key: 'cpc' as const, label: 'CPC', bg: 'bg-sky-500/10 text-sky-400' },
  { key: 'cpm' as const, label: 'CPM', bg: 'bg-violet-500/10 text-violet-400' },
  { key: 'ctr' as const, label: 'CTR', bg: 'bg-amber-500/10 text-amber-400' },
  { key: 'purchases' as const, label: 'Purchases', bg: 'bg-teal-500/10 text-teal-400' },
  { key: 'costPerPurchase' as const, label: 'Cost/Purchase', bg: 'bg-rose-500/10 text-rose-400' },
  { key: 'aov' as const, label: 'AOV', bg: 'bg-pink-500/10 text-pink-400' },
  { key: 'impressions' as const, label: 'Impr.', bg: 'bg-blue-500/10 text-blue-400' },
  { key: 'clicks' as const, label: 'Clicks', bg: 'bg-indigo-500/10 text-indigo-400' },
  { key: 'reach' as const, label: 'Reach', bg: 'bg-fuchsia-500/10 text-fuchsia-400' },
  { key: 'frequency' as const, label: 'Freq.', bg: 'bg-lime-500/10 text-lime-400' },
  { key: 'atcRate' as const, label: 'ATC Rate', bg: 'bg-cyan-500/10 text-cyan-400' },
];

export function ProductPnLCard({ product }: ProductPnLCardProps) {
  const isPositiveProfit = product.netProfit >= 0;
  const isPositiveMargin = product.margin >= 0;
  const shippingAndFees = product.shipping + product.fees;

  return (
    <div className="rounded-lg border border-border bg-surface p-4 hover:bg-surface-hover transition-colors">
      {/* Top row: Product info */}
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
            <span className="rounded bg-surface-elevated px-1.5 py-0.5 text-xs font-mono text-text-muted">
              {product.sku}
            </span>
            {product.isAdvertised && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                <Megaphone className="h-2.5 w-2.5" />
                Running Ads
              </span>
            )}
          </div>
        </div>
        {product.shopifyUrl && (
          <a
            href={product.shopifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 text-text-muted hover:text-text-secondary transition-colors"
            title="View in Shopify"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>

      {/* Ad info (if advertised) */}
      {product.isAdvertised && product.adName && (
        <div className="mt-2 rounded bg-brand/5 px-2.5 py-1.5 border border-brand/10">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <Globe className="h-3 w-3 text-brand" />
            <span className="truncate font-medium text-text-secondary">
              {product.adName}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-text-muted">
            {product.campaignName} &middot; {product.adSetName}
          </p>
        </div>
      )}

      {/* Middle section: P&L stats grid */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Revenue</p>
          <p className="text-sm font-semibold text-emerald-400">{formatCurrency(product.revenue)}</p>
        </div>
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">COGS</p>
          <p className="text-sm font-semibold text-red-400">{formatCurrency(product.cogs)}</p>
        </div>
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Net Profit</p>
          <p className={cn('text-sm font-semibold', isPositiveProfit ? 'text-emerald-400' : 'text-red-400')}>
            {formatCurrency(product.netProfit)}
          </p>
        </div>
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Margin %</p>
          <p className={cn('text-sm font-semibold', isPositiveMargin ? 'text-emerald-400' : 'text-red-400')}>
            {formatPercentage(product.margin)}
          </p>
        </div>
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Units Sold</p>
          <p className="text-sm font-semibold text-text-primary">{product.unitsSold.toLocaleString()}</p>
        </div>
        <div className="rounded bg-surface-elevated px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Ship + Fees</p>
          <p className="text-sm font-semibold text-red-400">{formatCurrency(shippingAndFees)}</p>
        </div>
      </div>

      {/* Bottom section: FB metric badges */}
      <div className="mt-3 border-t border-border pt-3">
        <div className="mb-1.5 flex items-center gap-1">
          <Megaphone className="h-3 w-3 text-text-muted" />
          <span className="text-[10px] text-text-muted">
            {product.isAdvertised ? 'Product-level FB metrics' : 'Not actively advertised'}
          </span>
        </div>
        {product.isAdvertised ? (
          <div className="flex flex-wrap gap-1.5">
            {fbMetricBadges.map((badge) => (
              <span
                key={badge.key}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  badge.bg
                )}
              >
                <span className="opacity-70">{badge.label}</span>
                <span>{fmtMetric(badge.key, product.fbMetrics[badge.key])}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-text-muted italic">
            No ads running for this product. Add it to a campaign to see per-product metrics.
          </p>
        )}
      </div>
    </div>
  );
}
