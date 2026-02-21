'use client';

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
}

interface TrendDataPoint {
  date: string;
  label: string;
  netProfit: number;
  positive: number | null;
  negative: number | null;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function PnLTrendChart({ dailyPnL }: PnLTrendChartProps) {
  const data: TrendDataPoint[] = dailyPnL.map((entry) => ({
    date: entry.date,
    label: formatDateLabel(entry.date),
    netProfit: entry.netProfit,
    positive: entry.netProfit >= 0 ? entry.netProfit : null,
    negative: entry.netProfit < 0 ? entry.netProfit : null,
  }));

  const CustomTooltipContent = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: TrendDataPoint }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    const isPositive = item.netProfit >= 0;
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-lg">
        <p className="text-xs text-gray-400 mb-1">{item.label}</p>
        <p className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatCurrency(item.netProfit)}
        </p>
      </div>
    );
  };

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <defs>
          <linearGradient id="gradientPositiveTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradientNegativeTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.02} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="4 4" />
        <Area
          type="monotone"
          dataKey="netProfit"
          stroke="#6366f1"
          strokeWidth={2.5}
          fill="url(#gradientPositiveTrend)"
          dot={false}
          activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
