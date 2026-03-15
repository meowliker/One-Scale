'use client';

import type { ProductPnLData } from '@/types/productPnl';
import type { PnLSummary } from '@/types/pnl';
import { formatCurrency, cn } from '@/lib/utils';

interface MetricsBarProps {
  summary: PnLSummary;
  products: ProductPnLData[];
  currency?: string;
}

export function MetricsBar({ summary, products, currency = 'USD' }: MetricsBarProps) {
  const safeProducts = products ?? [];
  const today = summary?.today;

  // Calculate metrics from available data
  const totalRevenue = today?.revenue ?? 0;
  const totalAdSpend = today?.adSpend ?? 0;
  const totalRefunds = today?.refunds ?? 0;
  const totalOrders = today?.orderCount ?? 0;

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

  // Upsell metrics from product data
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
      value: `${upsellRate.toFixed(0)}%`,
    },
    {
      label: 'UPSELL REVENUE',
      value: formatCurrency(upsellRevenue, currency),
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
