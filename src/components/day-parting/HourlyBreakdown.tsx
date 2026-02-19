'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { hourLabels } from '@/data/mockDayParting';
import type { DayPartingCell } from '@/data/mockDayParting';

interface HourlyBreakdownProps {
  data: DayPartingCell[];
}

export function HourlyBreakdown({ data }: HourlyBreakdownProps) {
  const hourlyAvg = useMemo(() => {
    const grouped: Record<number, { spend: number[]; roas: number[] }> = {};
    for (let h = 0; h < 24; h++) {
      grouped[h] = { spend: [], roas: [] };
    }
    for (const cell of data) {
      grouped[cell.hour].spend.push(cell.spend);
      grouped[cell.hour].roas.push(cell.roas);
    }
    return Array.from({ length: 24 }, (_, h) => {
      const spendArr = grouped[h].spend;
      const roasArr = grouped[h].roas;
      return {
        hour: hourLabels[h],
        spend: Math.round(
          spendArr.reduce((a, b) => a + b, 0) / spendArr.length
        ),
        roas:
          Math.round(
            (roasArr.reduce((a, b) => a + b, 0) / roasArr.length) * 100
          ) / 100,
      };
    });
  }, [data]);

  return (
    <div>
      <h3 className="mb-4 text-sm font-semibold text-text-primary">
        Average Hourly Performance (All Days)
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={hourlyAvg}>
          <defs>
            <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="roasGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2235" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={{ stroke: '#1e2235' }}
            tickLine={false}
            interval={1}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={{ stroke: '#1e2235' }}
            tickLine={false}
            tickFormatter={(v: number) => `$${v}`}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={{ stroke: '#1e2235' }}
            tickLine={false}
            tickFormatter={(v: number) => `${v}x`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: '8px',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-elevated)',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
            }}
            formatter={(value?: number, name?: string) => {
              const v = value ?? 0;
              return name === 'spend' ? [`$${v}`, 'Avg Spend'] : [`${v}x`, 'Avg ROAS'];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: '#94a3b8' }}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="spend"
            stroke="#3b82f6"
            fill="url(#spendGrad)"
            strokeWidth={2}
            name="Avg Spend ($)"
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="roas"
            stroke="#10b981"
            fill="url(#roasGrad)"
            strokeWidth={2}
            name="Avg ROAS (x)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
