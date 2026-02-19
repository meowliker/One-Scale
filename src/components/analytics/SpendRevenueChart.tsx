'use client';

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { TimeSeriesDataPoint, DateRangePreset } from '@/types/analytics';
import { formatCurrency, formatNumber, formatPercentage } from '@/lib/utils';

export interface SpendRevenueChartProps {
  data: TimeSeriesDataPoint[];
  datePreset?: DateRangePreset;
}

function isHourlyData(data: TimeSeriesDataPoint[]): boolean {
  return data.length > 0 && data[0].hourLabel != null;
}

function CustomTooltip({
  active,
  payload,
  label,
  hourly,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string; payload: TimeSeriesDataPoint }>;
  label?: string;
  hourly?: boolean;
}) {
  if (!active || !payload || !payload.length || !label) return null;

  const dp = payload[0].payload;
  const roas = dp.spend > 0 ? dp.revenue / dp.spend : 0;

  // Format the header date/time
  let headerText: string;
  if (hourly && dp.hourLabel != null) {
    headerText = `Today, ${dp.hourLabel}`;
  } else {
    try {
      headerText = format(parseISO(label), 'EEEE, MMM d, yyyy');
    } catch {
      headerText = label;
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 shadow-xl min-w-[260px]">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {headerText}
      </p>
      <div className="space-y-1.5">
        {/* Revenue */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />
            <span className="text-sm text-text-secondary">Revenue</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">
            {formatCurrency(dp.revenue)}
          </span>
        </div>
        {/* Ad Spend */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
            <span className="text-sm text-text-secondary">Ad Spend</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">
            {formatCurrency(dp.spend)}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-border pt-1.5" />

        {/* ROAS */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">ROAS</span>
          <span className="text-xs font-bold text-primary-light">{roas.toFixed(2)}x</span>
        </div>
        {/* Conversions */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Conversions</span>
          <span className="text-xs font-semibold text-text-primary">{formatNumber(dp.conversions)}</span>
        </div>
        {/* AOV */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">AOV</span>
          <span className="text-xs font-semibold text-text-primary">{formatCurrency(dp.aov)}</span>
        </div>

        {/* Divider */}
        <div className="border-t border-border pt-1.5" />

        {/* Impressions */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Impressions</span>
          <span className="text-xs font-semibold text-text-primary">{formatNumber(dp.impressions)}</span>
        </div>
        {/* Clicks */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Clicks</span>
          <span className="text-xs font-semibold text-text-primary">{formatNumber(dp.clicks)}</span>
        </div>
        {/* CTR */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">CTR</span>
          <span className="text-xs font-semibold text-text-primary">{formatPercentage(dp.ctr)}</span>
        </div>
        {/* CPC */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">CPC</span>
          <span className="text-xs font-semibold text-text-primary">{formatCurrency(dp.cpc)}</span>
        </div>
        {/* CPM */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">CPM</span>
          <span className="text-xs font-semibold text-text-primary">{formatCurrency(dp.cpm)}</span>
        </div>
      </div>
    </div>
  );
}

function CustomLegend() {
  return (
    <div className="flex items-center justify-end gap-5 pb-3">
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[#a78bfa]" />
        <span className="text-xs font-medium text-text-secondary">Revenue</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-2.5 rounded-full bg-[#60a5fa]" />
        <span className="text-xs font-medium text-text-secondary">Ad Spend</span>
      </div>
    </div>
  );
}

export function SpendRevenueChart({ data, datePreset }: SpendRevenueChartProps) {
  const hourly = isHourlyData(data);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-text-primary">
            Spend vs Revenue
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">
            {hourly ? 'Hourly performance comparison' : 'Daily performance comparison'}
          </p>
        </div>
      </div>
      <CustomLegend />
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="revenueGradientNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.25} />
                <stop offset="50%" stopColor="#7c5cfc" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#7c5cfc" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="spendGradientNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.2} />
                <stop offset="50%" stopColor="#3b82f6" stopOpacity={0.06} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey={hourly ? 'hourLabel' : 'date'}
              tickFormatter={
                hourly
                  ? (value: string) => value
                  : (value: string) => {
                      try {
                        return format(parseISO(value), 'MMM d');
                      } catch {
                        return value;
                      }
                    }
              }
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              interval={hourly ? 2 : undefined}
            />
            <YAxis
              tickFormatter={(value: number) => `$${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={55}
            />
            <Tooltip content={<CustomTooltip hourly={hourly} />} />
            <Area
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              stroke="#a78bfa"
              strokeWidth={2.5}
              fill="url(#revenueGradientNew)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#a78bfa', stroke: '#fff' }}
            />
            <Area
              type="monotone"
              dataKey="spend"
              name="Spend"
              stroke="#60a5fa"
              strokeWidth={2}
              fill="url(#spendGradientNew)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, fill: '#60a5fa', stroke: '#fff' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
