'use client';

import { useState, useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface PnLTrendChartProps {
  dailyPnL: PnLEntry[];
  previousDailyPnL?: PnLEntry[];
  comparisonDateLabel?: { current: string; previous: string };
  currency?: string;
}

interface TrendDataPoint {
  date: string;
  label: string;
  netProfit: number;
  prevNetProfit: number | null;
  prevRevenue: number | null;
  prevCosts: number | null;
  revenue: number;
  costs: number;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type TrendMetric = 'netProfit' | 'revenue' | 'costs';
export function PnLTrendChart({ dailyPnL, previousDailyPnL = [], comparisonDateLabel, currency = 'USD' }: PnLTrendChartProps) {
  const [metric, setMetric] = useState<TrendMetric>('netProfit');
  const [showComparison, setShowComparison] = useState(false);

  const data: TrendDataPoint[] = useMemo(() => {
    return dailyPnL.map((entry, i) => {
      const costs = entry.cogs + entry.adSpend + entry.shipping + entry.fees + entry.refunds;
      const prevEntry = previousDailyPnL[i] ?? null;
      const prevCosts = prevEntry ? prevEntry.cogs + prevEntry.adSpend + prevEntry.shipping + prevEntry.fees + prevEntry.refunds : null;

      return {
        date: entry.date,
        label: formatDateLabel(entry.date),
        netProfit: entry.netProfit,
        prevNetProfit: prevEntry?.netProfit ?? null,
        prevRevenue: prevEntry?.revenue ?? null,
        prevCosts,
        revenue: entry.revenue,
        costs,
      };
    });
  }, [dailyPnL, previousDailyPnL]);

  const metricConfig = {
    netProfit: { label: 'Net Profit', color: '#10b981', key: 'netProfit' as const, prevKey: 'prevNetProfit' as const },
    revenue: { label: 'Revenue', color: '#3b82f6', key: 'revenue' as const, prevKey: 'prevRevenue' as const },
    costs: { label: 'Total Costs', color: '#ef4444', key: 'costs' as const, prevKey: 'prevCosts' as const },
  };

  const active = metricConfig[metric];

  // Summary stats
  const summary = useMemo(() => {
    if (data.length === 0) return { total: 0, avg: 0, best: 0, worst: 0 };
    const values = data.map(d => d[active.key]);
    return {
      total: values.reduce((s, v) => s + v, 0),
      avg: values.reduce((s, v) => s + v, 0) / values.length,
      best: Math.max(...values),
      worst: Math.min(...values),
    };
  }, [data, active.key]);

  const CustomTooltipContent = ({
    active: isActive,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: TrendDataPoint }>;
  }) => {
    if (!isActive || !payload || !payload.length) return null;
    const item = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2.5 shadow-lg min-w-[150px]">
        <p className="text-xs font-semibold text-text-primary mb-1">{item.label}</p>
        <div className="flex justify-between text-xs">
          <span className="text-text-secondary">Net Profit</span>
          <span className={`font-bold ${item.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {formatCurrency(item.netProfit, currency)}
          </span>
        </div>
        <div className="flex justify-between text-xs mt-0.5">
          <span className="text-text-secondary">Revenue</span>
          <span className="font-semibold text-text-primary">{formatCurrency(item.revenue, currency)}</span>
        </div>
        <div className="flex justify-between text-xs mt-0.5">
          <span className="text-text-secondary">Costs</span>
          <span className="font-semibold text-red-500">{formatCurrency(item.costs, currency)}</span>
        </div>
        {showComparison && (() => {
          const prevVal = metric === 'netProfit' ? item.prevNetProfit : metric === 'revenue' ? item.prevRevenue : item.prevCosts;
          if (prevVal === null) return null;
          const currentVal = item[active.key];
          const diff = currentVal - prevVal;
          const pct = prevVal !== 0 ? ((diff / Math.abs(prevVal)) * 100).toFixed(1) : '—';
          return (
            <div className="mt-1 pt-1 border-t border-border space-y-0.5">
              <div className="flex justify-between text-xs">
                <span className="text-amber-500 font-medium">{comparisonDateLabel?.previous ?? 'Prev Period'}</span>
                <span className="font-semibold text-amber-500">{formatCurrency(prevVal, currency)}</span>
              </div>
              <div className="flex justify-end text-xs">
                <span className={diff >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                  {diff >= 0 ? '+' : ''}{formatCurrency(diff, currency)} ({pct}%)
                </span>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-surface-hover rounded-lg p-0.5">
          {(['netProfit', 'revenue', 'costs'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={
                metric === m
                  ? 'px-3 py-1.5 text-xs font-semibold rounded-md bg-surface shadow-sm text-text-primary transition-all'
                  : 'px-3 py-1.5 text-xs font-semibold rounded-md text-text-secondary/50 hover:text-text-secondary transition-colors'
              }
            >
              {metricConfig[m].label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowComparison(prev => !prev)}
            className={
              showComparison
                ? 'border-2 border-blue-500 bg-blue-500/15 text-blue-400 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm shadow-blue-500/20'
                : 'border-2 border-border bg-surface text-text-secondary hover:border-blue-400 hover:text-blue-400 hover:bg-blue-500/5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all'
            }
          >
            ↔ Compare
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total', value: summary.total },
          { label: 'Daily Avg', value: summary.avg },
          { label: 'Best Day', value: summary.best },
          { label: 'Worst Day', value: summary.worst },
        ].map(s => (
          <div key={s.label} className="text-center">
            <div className="text-xs font-semibold text-text-secondary/50 uppercase tracking-wide">{s.label}</div>
            <div className={`text-sm font-bold tabular-nums ${s.value >= 0 ? 'text-text-primary' : 'text-red-500'}`}>
              {formatCurrency(s.value, currency)}
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={active.color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={active.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
          />
          <Tooltip content={<CustomTooltipContent />} cursor={{ stroke: 'var(--color-border)', strokeDasharray: '4 2' }} />
          {metric === 'netProfit' && <ReferenceLine y={0} stroke="var(--color-text-secondary)" strokeOpacity={0.2} strokeDasharray="3 3" />}

          {/* Comparison line */}
          {showComparison && (
            <Area
              type="monotone"
              dataKey={active.prevKey}
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="6 3"
              strokeOpacity={0.8}
              fill="none"
              dot={false}
              connectNulls={false}
            />
          )}

          {/* Main area */}
          <Area
            type="monotone"
            dataKey={active.key}
            stroke={active.color}
            strokeWidth={2.5}
            fill="url(#trendGradient)"
            dot={false}
            activeDot={{ r: 5, fill: active.color, stroke: 'var(--color-surface)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Legend with date ranges */}
      {showComparison && (
        <div className="flex items-center gap-5 mt-2 justify-end">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-[2px] rounded-full" style={{ background: active.color }} />
            <span className="text-xs font-medium text-text-primary">{comparisonDateLabel?.current ?? 'Current'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-[2px] rounded-full bg-amber-500" style={{ opacity: 0.8 }} />
            <span className="text-xs font-medium text-text-secondary">{comparisonDateLabel?.previous ?? 'Previous'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
