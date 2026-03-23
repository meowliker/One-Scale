'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency, cn } from '@/lib/utils';

interface MetricsBarProps {
  entry: PnLEntry;
  currency?: string;
}

export function MetricsBar({ entry, currency = 'USD' }: MetricsBarProps) {
  const totalRevenue = entry?.revenue ?? 0;
  const totalAdSpend = entry?.adSpend ?? 0;
  const totalRefunds = entry?.refunds ?? 0;
  const totalOrders = entry?.orderCount ?? 0;
  const chargebackLoss = entry?.chargebackLoss ?? 0;
  const chargebackWon = entry?.chargebackWon ?? 0;

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;

  // Refund rate: % of revenue lost to refunds — always show if there's revenue
  const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0;

  // Chargeback rate: chargebacks as % of orders
  const totalChargebackCount = chargebackLoss + chargebackWon;
  const chargebackRate = totalOrders > 0 ? (totalChargebackCount / totalOrders) * 100 : 0;

  // CB win rate: % of chargebacks that were won
  const chargebackWinRate = totalChargebackCount > 0 ? (chargebackWon / totalChargebackCount) * 100 : 0;

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
      label: 'REFUND RATE',
      value: totalRevenue > 0 ? `${refundRate.toFixed(1)}%` : '0%',
      valueColor: refundRate > 5 ? 'text-red-500' : refundRate > 0 ? 'text-amber-500' : undefined,
    },
    {
      label: 'CHARGEBACK RATE',
      value: totalOrders > 0 ? `${chargebackRate.toFixed(2)}%` : '0%',
      valueColor: chargebackRate > 1 ? 'text-red-500' : chargebackRate > 0 ? 'text-amber-500' : undefined,
    },
    {
      label: 'CB WIN RATE',
      value: totalChargebackCount > 0 ? `${chargebackWinRate.toFixed(0)}%` : '—',
      valueColor: totalChargebackCount > 0 ? (chargebackWinRate >= 50 ? 'text-emerald-500' : 'text-red-500') : undefined,
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
