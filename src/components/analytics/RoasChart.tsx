'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { TimeSeriesDataPoint, DateRangePreset } from '@/types/analytics';
import { cn, formatCurrency } from '@/lib/utils';

export interface RoasChartProps {
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
  payload?: Array<{ value: number; payload: TimeSeriesDataPoint }>;
  label?: string;
  hourly?: boolean;
}) {
  if (!active || !payload?.length || !label) return null;

  const dp = payload[0].payload;
  const roas = dp.roas;
  const isAboveBreakeven = roas >= 1;

  // Format the header date/time
  let headerText: string;
  if (hourly && dp.hourLabel != null) {
    headerText = `Today, ${dp.hourLabel}`;
  } else {
    try {
      headerText = format(parseISO(label), 'EEEE, MMM d');
    } catch {
      headerText = label;
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-4 shadow-xl min-w-[220px]">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {headerText}
      </p>
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold',
            isAboveBreakeven
              ? 'bg-success/15 text-success-light'
              : 'bg-danger/15 text-danger-light'
          )}
        >
          {roas.toFixed(1)}x
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{roas.toFixed(2)}x ROAS</p>
          <p className={cn(
            'text-xs',
            isAboveBreakeven ? 'text-success-light' : 'text-danger-light'
          )}>
            {isAboveBreakeven ? 'Above break-even' : 'Below break-even'}
          </p>
        </div>
      </div>
      {/* Additional metrics */}
      <div className="border-t border-border pt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Revenue</span>
          <span className="text-xs font-semibold text-text-primary">{formatCurrency(dp.revenue)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-text-muted">Ad Spend</span>
          <span className="text-xs font-semibold text-text-primary">{formatCurrency(dp.spend)}</span>
        </div>
      </div>
    </div>
  );
}

export function RoasChart({ data, datePreset }: RoasChartProps) {
  const hourly = isHourlyData(data);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-text-primary">ROAS Trend</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          {hourly ? 'Hourly return on ad spend' : 'Return on ad spend over time'}
        </p>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
            <defs>
              <linearGradient id="roasGradientFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c5cfc" stopOpacity={0.25} />
                <stop offset="40%" stopColor="#7c5cfc" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#7c5cfc" stopOpacity={0} />
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
              tickFormatter={(value: number) => `${value.toFixed(1)}x`}
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={false}
              width={45}
              domain={[0, 'auto']}
            />
            <Tooltip content={<CustomTooltip hourly={hourly} />} />
            <ReferenceLine
              y={1}
              stroke="#ef4444"
              strokeDasharray="8 4"
              strokeWidth={1.5}
              label={{
                value: 'Break-even (1.0x)',
                position: 'insideBottomRight',
                fill: '#ef4444',
                fontSize: 10,
                fontWeight: 600,
              }}
            />
            <Area
              type="monotone"
              dataKey="roas"
              name="ROAS"
              stroke="#7c5cfc"
              strokeWidth={2.5}
              fill="url(#roasGradientFill)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, fill: '#7c5cfc', stroke: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
