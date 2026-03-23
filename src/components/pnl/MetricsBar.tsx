'use client';

import type { PnLEntry } from '@/types/pnl';
import { formatCurrency, cn } from '@/lib/utils';

interface MetricsBarProps {
  entry: PnLEntry;
  currency?: string;
}

export function MetricsBar({ entry, currency = 'USD' }: MetricsBarProps) {
  // Calculate metrics from active date range entry
  const totalRevenue = entry?.revenue ?? 0;
  const totalAdSpend = entry?.adSpend ?? 0;
  const totalRefunds = entry?.refunds ?? 0;
  const totalOrders = entry?.orderCount ?? 0;
  const chargebackLoss = entry?.chargebackLoss ?? 0;
  const chargebackWon = entry?.chargebackWon ?? 0;

  const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const roas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0;
  const refundRate = totalOrders > 0 ? ((entry?.fullRefundCount ?? 0) + (entry?.partialRefundCount ?? 0)) / totalOrders * 100 : 0;

  // Chargeback win/loss rate
  const totalChargebacks = chargebackLoss + chargebackWon;
  const chargebackWinRate = totalChargebacks > 0 ? (chargebackWon / totalChargebacks) * 100 : 0;

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
      value: totalOrders > 0 ? `${refundRate.toFixed(1)}%` : '—',
      valueColor: refundRate > 5 ? 'text-red-500' : refundRate > 0 ? 'text-amber-500' : undefined,
    },
    {
      label: 'CB WIN RATE',
      value: totalChargebacks > 0 ? `${chargebackWinRate.toFixed(0)}%` : '—',
      valueColor: totalChargebacks > 0 ? (chargebackWinRate >= 50 ? 'text-emerald-500' : 'text-red-500') : undefined,
    },
    {
      label: 'NET CHARGEBACKS',
      value: totalChargebacks > 0 ? formatCurrency(chargebackLoss - chargebackWon, currency) : '—',
      valueColor: totalChargebacks > 0 ? (chargebackLoss > chargebackWon ? 'text-red-500' : 'text-emerald-500') : undefined,
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
