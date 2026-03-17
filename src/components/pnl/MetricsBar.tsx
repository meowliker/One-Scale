'use client';

import type { ProductPnLData } from '@/types/productPnl';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency, cn } from '@/lib/utils';

interface MetricsBarProps {
  entry: PnLEntry;
  products: ProductPnLData[];
  currency?: string;
}

export function MetricsBar({ entry, products, currency = 'USD' }: MetricsBarProps) {
  const safeProducts = products ?? [];

  // Calculate metrics from active date range entry
  const totalRevenue = entry?.revenue ?? 0;
  const totalAdSpend = entry?.adSpend ?? 0;
  const totalRefunds = entry?.refunds ?? 0;
  const totalOrders = entry?.orderCount ?? 0;

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

  // Upsell metrics from product data (empty during date-range loading)
  const hasProducts = safeProducts.length > 0;
  const upsellProducts = safeProducts.filter(p => {
    const cat = (p.category || '').toLowerCase();
    return cat === 'upsell' || cat === 'downsell' || cat === 'addon';
  });
  const upsellRevenue = upsellProducts.reduce((s, p) => s + p.revenue, 0);
  const totalProductOrders = safeProducts.reduce((s, p) => s + p.unitsSold, 0);
  const upsellOrders = upsellProducts.reduce((s, p) => s + p.unitsSold, 0);
  const upsellRate = totalProductOrders > 0 ? (upsellOrders / totalProductOrders) * 100 : 0;

  const metrics = [
    {
      label: 'AVG ORDER VALUE',
      value: formatCurrency(aov, currency),
      highlight: true,
    },
    {
      label: 'TOTAL ORDERS',
      value: totalOrders.toLocaleString(),
    },
    {
      label: 'UPSELL RATE',
      value: hasProducts ? `${upsellRate.toFixed(0)}%` : '—',
    },
    {
      label: 'UPSELL REVENUE',
      value: hasProducts ? formatCurrency(upsellRevenue, currency) : '—',
    },
    {
      label: 'REFUND RATE',
      value: `${refundRate.toFixed(1)}%`,
      valueColor: refundRate > 5 ? 'text-red-500' : undefined,
    },
    {
      label: 'ROAS',
      value: totalAdSpend > 0 ? `${roas.toFixed(2)}x` : '—',
      valueColor: totalAdSpend > 0 ? (roas >= 1 ? 'text-emerald-500' : 'text-red-500') : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-border border border-border rounded-xl overflow-hidden">
      {metrics.map((metric, i) => (
        <div key={i} className="bg-surface px-4 py-3">
          <p className="text-[10px] text-text-muted font-medium tracking-wide uppercase mb-1">
            {metric.label}
          </p>
          <span className={cn(
            'font-semibold tabular-nums',
            metric.highlight ? 'text-base' : 'text-sm',
            metric.valueColor ?? 'text-text-primary',
          )}>
            {metric.value}
          </span>
        </div>
      ))}
    </div>
  );
}
