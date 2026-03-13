'use client';

import { useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import type { DateRange } from '@/types/analytics';
import { formatCurrency } from '@/lib/utils';
import { formatDateInTimezone } from '@/lib/timezone';
import { AnimatedCounter } from './AnimatedCounter';
import { MiniSparkline } from './MiniSparkline';
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

interface PnLTrendChartProps {
  dailyPnL: PnLEntry[];
  dateRange: DateRange;
}

interface TrendPoint {
  date: string;
  label: string;
  netProfit: number;
  positive: number | null;
  negative: number | null;
  prevNetProfit: number | null;
}

function formatLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildTrendData(dailyPnL: PnLEntry[], dateRange: DateRange) {
  const startStr = formatDateInTimezone(dateRange.start);
  const endStr = formatDateInTimezone(dateRange.end);
  const periodMs = dateRange.end.getTime() - dateRange.start.getTime();
  const periodDays = Math.round(periodMs / 86400000) + 1;

  const current = dailyPnL
    .filter((d) => d.date >= startStr && d.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  const prevEnd = new Date(dateRange.start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (periodDays - 1) * 86400000);
  const previous = dailyPnL
    .filter((d) => d.date >= formatDateInTimezone(prevStart) && d.date <= formatDateInTimezone(prevEnd))
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentTotal = current.reduce((s, d) => s + d.netProfit, 0);
  const prevTotal = previous.reduce((s, d) => s + d.netProfit, 0);

  const result: TrendPoint[] = [];
  for (let i = 0; i < current.length; i++) {
    const entry = current[i];
    const np = entry.netProfit;
    if (i > 0) {
      const prevNp = current[i - 1].netProfit;
      if ((prevNp < 0 && np > 0) || (prevNp > 0 && np < 0)) {
        result.push({ date: `${current[i-1].date}_x`, label: '', netProfit: 0, positive: 0, negative: 0, prevNetProfit: null });
      }
    }
    result.push({
      date: entry.date, label: formatLabel(entry.date), netProfit: np,
      positive: np >= 0 ? np : null, negative: np <= 0 ? np : null,
      prevNetProfit: previous[i]?.netProfit ?? null,
    });
  }
  return { data: result, currentTotal, prevTotal };
}

export function PnLTrendChart({ dailyPnL, dateRange }: PnLTrendChartProps) {
  const { data, currentTotal, prevTotal } = useMemo(() => buildTrendData(dailyPnL, dateRange), [dailyPnL, dateRange]);
  const sparkData = useMemo(() => data.filter((d) => !d.date.includes('_x')).map((d) => d.netProfit), [data]);
  const isPos = currentTotal >= 0;
  const changePct = prevTotal !== 0 ? ((currentTotal - prevTotal) / Math.abs(prevTotal)) * 100 : 0;
  const changeAbs = currentTotal - prevTotal;

  const values = data.map((d) => d.netProfit);
  const prevVals = data.map((d) => d.prevNetProfit ?? 0);
  const allVals = [...values, ...prevVals];
  const minV = allVals.length > 0 ? Math.min(...allVals, 0) : -100;
  const maxV = allVals.length > 0 ? Math.max(...allVals, 0) : 100;
  const pad = Math.max((maxV - minV) * 0.15, 100);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint }> }) => {
    if (!active || !payload?.length) return null;
    const item = payload[0].payload;
    if (item.date.includes('_x')) return null;
    return (
      <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-lg">
        <p className="text-sm text-text-secondary mb-1">{item.label}</p>
        <p className={`text-sm font-bold ${item.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(item.netProfit)}</p>
        {item.prevNetProfit !== null && <p className="text-sm text-text-secondary mt-0.5">Prev: {formatCurrency(item.prevNetProfit)}</p>}
      </div>
    );
  };

  const hasChartData = data.length > 0;

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-text-secondary">Net Profit</p>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <AnimatedCounter value={currentTotal} format={formatCurrency} className={`text-2xl font-extrabold tabular-nums tracking-tight ${isPos ? 'text-emerald-600' : 'text-red-600'}`} />
              {changePct !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-sm font-semibold px-2 py-0.5 rounded-md ${changePct >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-red-50 text-red-600 dark:bg-red-950/30'}`}>
                  {changePct >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(changePct).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">
              vs prev <span className={changeAbs >= 0 ? 'text-emerald-500 font-medium' : 'text-red-500 font-medium'}>{changeAbs >= 0 ? '+' : ''}{formatCurrency(changeAbs)}</span>
            </p>
          </div>
          {sparkData.length > 1 && <MiniSparkline data={sparkData} color={isPos ? '#10b981' : '#ef4444'} />}
        </div>
      </div>
      <div className="flex-1 px-1 pb-1">
        {!hasChartData ? (
          <div className="flex items-center justify-center h-[220px]">
            <div className="text-center">
              <div className="h-8 w-8 mx-auto mb-2 rounded-full bg-surface-hover animate-pulse" />
              <p className="text-sm text-text-secondary">Select a wider date range to see trends</p>
            </div>
          </div>
        ) : data.length === 1 ? (
          <div className="flex items-center justify-center h-[220px]">
            <div className="text-center">
              <p className={`text-4xl font-black tabular-nums ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(currentTotal)}</p>
              <p className="text-sm text-text-secondary mt-1">{data[0].label}</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="tgp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.18}/><stop offset="100%" stopColor="#10b981" stopOpacity={0.01}/></linearGradient>
                <linearGradient id="tgn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.01}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0.15}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis domain={[minV - pad, maxV + pad]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={52} tickFormatter={(v: number) => { const a = Math.abs(v); const s = v < 0 ? '-' : ''; return a >= 1000 ? `${s}$${(a/1000).toFixed(1)}k` : `${s}$${a.toFixed(0)}`; }} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" strokeWidth={1} />
              <Line type="monotone" dataKey="prevNetProfit" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="positive" stroke="none" fill="url(#tgp)" dot={false} connectNulls={true} isAnimationActive={false} />
              <Area type="monotone" dataKey="negative" stroke="none" fill="url(#tgn)" dot={false} connectNulls={true} isAnimationActive={false} />
              <Line type="monotone" dataKey="netProfit" stroke={isPos ? '#10b981' : '#ef4444'} strokeWidth={2.5} dot={false} connectNulls={true} activeDot={{ r: 5, fill: isPos ? '#10b981' : '#ef4444', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="flex gap-5 px-5 py-2 border-t border-border-light">
        <div className="flex items-center gap-1.5 text-sm text-text-secondary font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Current</div>
        <div className="flex items-center gap-1.5 text-sm text-text-secondary font-medium"><span className="w-4 border-t-2 border-dashed border-text-dimmed"/> Previous</div>
      </div>
    </div>
  );
}
