'use client';

import { useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  isDigital?: boolean;
  currency?: string;
}

interface WaterfallRow {
  name: string;
  amount: number;
  pct: number;
  type: 'income' | 'cost' | 'total';
}

export function PnLWaterfallChart({ entry, isDigital = false, currency = 'USD' }: PnLWaterfallChartProps) {
  const rows: WaterfallRow[] = useMemo(() => {
    const rev = entry.revenue || 1;
    const result: WaterfallRow[] = [];

    result.push({ name: 'Revenue', amount: entry.revenue, pct: 100, type: 'income' });

    const addCost = (name: string, amount: number) => {
      if (amount <= 0) return;
      result.push({ name, amount, pct: (amount / rev) * 100, type: 'cost' });
    };

    if (!isDigital) addCost('COGS', entry.cogs);
    addCost('Ad Spend', entry.adSpend);
    if (!isDigital) addCost('Shipping', entry.shipping);
    addCost(isDigital ? 'Txn Fees' : 'Fees', entry.fees);
    addCost('Refunds', entry.refunds);
    addCost('Chargebacks', entry.chargebackLoss || 0);
    if ((entry.customExpenses || 0) > 0) {
      result.push({ name: 'Custom Expenses', amount: entry.customExpenses!, pct: (entry.customExpenses! / rev) * 100, type: 'cost' });
    }

    const np = entry.netProfit;
    result.push({
      name: 'Net Profit',
      amount: np,
      pct: (Math.abs(np) / rev) * 100,
      type: 'total',
    });

    return result;
  }, [entry, isDigital]);

  const netProfit = entry.netProfit;
  const costRows = rows.filter(r => r.type === 'cost');
  const totalCosts = costRows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="apple-card p-6">
      <h3 className="text-base font-bold text-text-primary mb-5">Profit Waterfall</h3>

      {/* Stacked overview bar */}
      <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-hover mb-6">
        {costRows.map((row, i) => (
          <div
            key={i}
            className="h-full transition-all duration-500 bg-red-400/30"
            style={{ width: `${row.pct}%` }}
          />
        ))}
        {netProfit > 0 && (
          <div
            className="h-full rounded-r-full transition-all duration-500 bg-emerald-500/50"
            style={{ width: `${(netProfit / (entry.revenue || 1)) * 100}%` }}
          />
        )}
      </div>

      {/* Revenue row */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-text-primary">Revenue</span>
          <span className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {formatCurrency(entry.revenue, currency)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500/50 transition-all duration-700" style={{ width: '100%' }} />
        </div>
      </div>

      {/* Cost rows */}
      <div className="space-y-3 mb-4">
        {costRows.map((row, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-text-secondary">{row.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary/40 tabular-nums">{row.pct.toFixed(1)}%</span>
                <span className="text-sm font-semibold tabular-nums text-text-primary">−{formatCurrency(row.amount, currency)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
              <div
                className="h-full rounded-full bg-red-400/35 transition-all duration-700"
                style={{ width: `${Math.min(row.pct, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Divider + totals */}
      <div className="border-t border-border pt-3 mb-4">
        <div className="flex items-center justify-between text-xs text-text-secondary/50">
          <span>Total Costs</span>
          <span className="font-semibold tabular-nums">−{formatCurrency(totalCosts, currency)}</span>
        </div>
      </div>

      {/* Net Profit row */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-text-primary">Net Profit</span>
          <span className={`text-sm font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {formatCurrency(netProfit, currency)}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${netProfit >= 0 ? 'bg-emerald-500/50' : 'bg-red-500/50'}`}
            style={{ width: `${Math.min(rows[rows.length - 1].pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
