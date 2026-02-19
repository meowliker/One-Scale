'use client';

import { Activity } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export interface LivePerformanceStripProps {
  metrics: Record<string, number>;
}

function FBBadge() {
  return (
    <span className="text-[8px] font-semibold uppercase leading-none bg-blue-500/15 text-blue-400 rounded px-1 py-0.5">
      FB
    </span>
  );
}

function ShopifyBadge() {
  return (
    <span className="text-[8px] font-semibold uppercase leading-none bg-emerald-500/15 text-emerald-400 rounded px-1 py-0.5">
      Shopify
    </span>
  );
}

export function LivePerformanceStrip({ metrics }: LivePerformanceStripProps) {
  const spend = metrics.totalSpend ?? 0;
  const fbRevenue = metrics.totalRevenue ?? 0;
  const shopifyRevenue = metrics.shopifyRevenue ?? fbRevenue;
  const conversions = metrics.totalConversions ?? 0;
  const roas = spend > 0 ? fbRevenue / spend : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-surface-elevated to-primary/5" />

      <div className="relative flex flex-wrap items-center justify-between gap-4 px-6 py-3">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5 items-center justify-center">
            <span className="absolute h-full w-full rounded-full bg-success opacity-40 status-dot-active" />
            <span className="relative h-2 w-2 rounded-full bg-success" />
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-success-light" />
            <span className="text-xs font-semibold uppercase tracking-wider text-success-light">
              Live
            </span>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 lg:gap-8">
          {/* Live Spend */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-text-muted">
              Live Spend
            </span>
            <span className="text-sm font-bold tabular-nums text-text-primary transition-all duration-300">
              {formatCurrency(spend)}
            </span>
          </div>

          {/* FB Revenue */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
              FB Rev
              <FBBadge />
            </span>
            <span className="text-sm font-bold tabular-nums text-blue-400 transition-all duration-300">
              {formatCurrency(fbRevenue)}
            </span>
          </div>

          {/* Shopify Revenue */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
              Shopify Rev
              <ShopifyBadge />
            </span>
            <span className="text-sm font-bold tabular-nums text-emerald-400 transition-all duration-300">
              {formatCurrency(shopifyRevenue)}
            </span>
          </div>

          {/* Live ROAS */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-text-muted">
              Live ROAS
            </span>
            <span className="text-sm font-bold tabular-nums text-text-primary transition-all duration-300">
              {roas.toFixed(2)}x
            </span>
          </div>

          {/* Live CPA */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-text-muted">
              Live CPA
            </span>
            <span className="text-sm font-bold tabular-nums text-text-primary transition-all duration-300">
              {formatCurrency(cpa)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
