'use client';

import { useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { AnimatedCounter } from './AnimatedCounter';
import { MiniSparkline } from './MiniSparkline';

interface PnLWaterfallChartProps {
  entry: PnLEntry;
  dailyPnL: PnLEntry[];
}

function compact(n: number): string {
  const a = Math.abs(n); const s = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${s}$${(a/1e6).toFixed(1)}M`;
  if (a >= 1_000) return `${s}$${(a/1e3).toFixed(1)}k`;
  return `${s}$${a.toFixed(0)}`;
}

export function PnLWaterfallChart({ entry, dailyPnL }: PnLWaterfallChartProps) {
  const sparkData = useMemo(() => [...dailyPnL].sort((a, b) => a.date.localeCompare(b.date)).map((d) => d.netProfit), [dailyPnL]);
  const isPos = entry.netProfit >= 0;

  const bars = useMemo(() => {
    const b = [
      { label: 'Revenue', value: entry.revenue, color: '#10b981', grad: ['#10b981','#34d399'] },
      { label: 'COGS', value: -entry.cogs, color: '#ef4444', grad: ['#ef4444','#f87171'] },
      { label: 'Ad Spend', value: -entry.adSpend, color: '#f97316', grad: ['#f97316','#fb923c'] },
      { label: 'Fees', value: -(entry.fees + entry.shipping), color: '#f59e0b', grad: ['#f59e0b','#fbbf24'] },
    ];
    if (entry.refunds > 0) b.push({ label: 'Refunds', value: -entry.refunds, color: '#8b5cf6', grad: ['#8b5cf6','#a78bfa'] });
    b.push({ label: 'Profit', value: entry.netProfit, color: isPos ? '#4f46e5' : '#ef4444', grad: isPos ? ['#4f46e5','#818cf8'] : ['#ef4444','#f87171'] });
    return b;
  }, [entry, isPos]);

  const maxVal = Math.max(...bars.map((b) => Math.abs(b.value)), 1);

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-5 pt-4 pb-2">
        <p className="text-sm font-bold uppercase tracking-widest text-text-secondary">P&L Flow</p>
        <div className="flex items-center gap-3 mt-0.5">
          <div>
            <AnimatedCounter value={entry.netProfit} format={formatCurrency} className={`text-2xl font-extrabold tabular-nums tracking-tight ${isPos ? 'text-emerald-600' : 'text-red-600'}`} />
            <p className="text-sm text-text-secondary mt-0.5">from {formatCurrency(entry.revenue)} revenue</p>
          </div>
          <MiniSparkline data={sparkData} color={isPos ? '#10b981' : '#ef4444'} width={48} height={22} />
        </div>
      </div>
      <div className="flex-1 px-5 pb-4 flex items-end">
        <div className="flex items-end justify-around gap-2 w-full" style={{ height: 192 }}>
          {bars.map((bar, i) => {
            const h = Math.max((Math.abs(bar.value) / maxVal) * 160, 4);
            const isResult = i === bars.length - 1;
            return (
              <div key={bar.label} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <span className="text-xs font-bold tabular-nums" style={{ color: bar.color }}>
                  {compact(bar.value)}
                </span>
                <div
                  className="w-full max-w-[40px] rounded-t-md hover:opacity-80 transition-opacity"
                  style={{
                    height: h,
                    background: `linear-gradient(to top, ${bar.grad[0]}, ${bar.grad[1]})`,
                    boxShadow: isResult ? `0 2px 12px ${bar.color}33` : undefined,
                  }}
                />
                <span className="text-xs font-semibold uppercase tracking-wide truncate w-full text-center"
                  style={{ color: isResult ? bar.color : '#94a3b8', fontWeight: isResult ? 700 : 600 }}>
                  {bar.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
