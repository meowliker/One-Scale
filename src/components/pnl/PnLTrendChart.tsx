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
    return (
      <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 shadow-md">
        <p className="text-xs text-text-muted">{item.label}</p>
        <p className="text-sm font-semibold text-text-primary">
          {formatCurrency(item.netProfit)}
        </p>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Net Profit Trend
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <defs>
            <linearGradient id="gradientPositive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradientNegative" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.05} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e2235" />
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
          <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="netProfit"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#gradientPositive)"
            dot={false}
            activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
