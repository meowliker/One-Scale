'use client';

import { useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { AnimatedCounter } from './AnimatedCounter';
import { MiniSparkline } from './MiniSparkline';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface PnLDayPartChartProps {
  dailyPnL: PnLEntry[];
}

interface DayPoint {
  label: string;
  revenue: number;
  adSpend: number;
  netProfit: number;
}

function formatDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PnLDayPartChart({ dailyPnL }: PnLDayPartChartProps) {
  const data = useMemo<DayPoint[]>(() => {
    const sorted = [...dailyPnL].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((d) => ({
      label: sorted.length <= 7 ? formatDay(d.date) : formatShort(d.date),
      revenue: d.revenue,
      adSpend: d.adSpend,
      netProfit: d.netProfit,
    }));
  }, [dailyPnL]);

  const totalRevenue = useMemo(() => data.reduce((s, d) => s + d.revenue, 0), [data]);
  const sparkData = useMemo(() => data.map((d) => d.revenue), [data]);
  const changePct = useMemo(() => {
    if (data.length < 2) return 0;
    const first = data[0].revenue;
    const last = data[data.length - 1].revenue;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [data]);

  const barSize = data.length <= 7 ? 24 : data.length <= 14 ? 16 : 10;

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-lg">
        <p className="text-xs text-text-secondary mb-1.5">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-[12px]">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-text-secondary">{p.name}:</span>
            <span className="font-semibold text-text-primary tabular-nums">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden h-full flex flex-col">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-text-secondary">Daily P&L</p>
            <div className="flex items-baseline gap-2.5 mt-0.5">
              <AnimatedCounter value={totalRevenue} format={formatCurrency} className="text-2xl font-extrabold tabular-nums tracking-tight text-text-primary" />
              {changePct !== 0 && (
                <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-md ${changePct >= 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30' : 'bg-red-50 text-red-600 dark:bg-red-950/30'}`}>
                  {changePct >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(changePct).toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">total revenue &middot; {data.length} days</p>
          </div>
          <MiniSparkline data={sparkData} color="#334155" width={56} height={24} />
        </div>
      </div>
      <div className="flex-1 px-1 pb-1">
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id="barRevGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34d399" /><stop offset="100%" stopColor="#10b981" />
              </linearGradient>
              <linearGradient id="barAdGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" /><stop offset="100%" stopColor="#f97316" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48}
              tickFormatter={(v: number) => { const a = Math.abs(v); return a >= 1000 ? `$${(a/1000).toFixed(1)}k` : `$${a.toFixed(0)}`; }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" name="Revenue" fill="url(#barRevGrad)" radius={[4, 4, 0, 0]} barSize={barSize} />
            <Bar dataKey="adSpend" name="Ad Spend" fill="url(#barAdGrad)" radius={[4, 4, 0, 0]} barSize={barSize} />
            <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1', stroke: '#fff', strokeWidth: 1.5 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-5 px-5 py-2 border-t border-border-light">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium"><span className="w-2 h-2 rounded-full bg-emerald-500"/> Revenue</div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium"><span className="w-2 h-2 rounded-full bg-orange-500"/> Ad Spend</div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary font-medium"><span className="w-2 h-2 rounded-full bg-indigo-500"/> Net Profit</div>
      </div>
    </div>
  );
}
