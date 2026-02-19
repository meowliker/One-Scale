'use client';

import { useState, useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import type { DateRangePreset as AnalyticsDateRangePreset, DateRange } from '@/types/analytics';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { formatDateInTimezone } from '@/lib/timezone';
import { BarChart3, Layers, TrendingUp, Table } from 'lucide-react';
import {
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface PnLDayPartChartProps {
  dailyPnL: PnLEntry[];
}

type ChartView = 'grouped' | 'stacked' | 'area' | 'table';

interface ChartDataPoint {
  date: string;
  label: string;
  revenue: number;
  adSpend: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  netProfit: number;
  margin: number;
}

type SortField = 'date' | 'revenue' | 'adSpend' | 'cogs' | 'shipping' | 'fees' | 'refunds' | 'netProfit' | 'margin';
type SortDirection = 'asc' | 'desc';

const viewOptions: { id: ChartView; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'grouped', label: 'Grouped Bar', Icon: BarChart3 },
  { id: 'stacked', label: 'Stacked Bar', Icon: Layers },
  { id: 'area', label: 'Area / Line', Icon: TrendingUp },
  { id: 'table', label: 'Data Table', Icon: Table },
];

function formatDateLabel(dateStr: string, shortRange: boolean): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (shortRange) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatYAxisTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export function PnLDayPartChart({ dailyPnL }: PnLDayPartChartProps) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('last7'));
  const [chartView, setChartView] = useState<ChartView>('grouped');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const dayCount = useMemo(() => {
    const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
    return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [dateRange]);

  const shortRange = dayCount <= 7;

  const filteredData: ChartDataPoint[] = useMemo(() => {
    const startStr = formatDateInTimezone(dateRange.start);
    const endStr = formatDateInTimezone(dateRange.end);

    const sorted = [...dailyPnL].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sorted
      .filter((entry) => entry.date >= startStr && entry.date <= endStr)
      .map((entry) => ({
        date: entry.date,
        label: formatDateLabel(entry.date, shortRange),
        revenue: entry.revenue,
        adSpend: entry.adSpend,
        cogs: entry.cogs,
        shipping: entry.shipping,
        fees: entry.fees,
        refunds: entry.refunds,
        netProfit: entry.netProfit,
        margin: entry.revenue > 0 ? (entry.netProfit / entry.revenue) * 100 : 0,
      }));
  }, [dailyPnL, dateRange, shortRange]);

  const summary = useMemo(() => {
    const totalRevenue = filteredData.reduce((sum, d) => sum + d.revenue, 0);
    const totalAdSpend = filteredData.reduce((sum, d) => sum + d.adSpend, 0);
    const totalCogs = filteredData.reduce((sum, d) => sum + d.cogs, 0);
    const totalNetProfit = filteredData.reduce((sum, d) => sum + d.netProfit, 0);
    return { totalRevenue, totalAdSpend, totalCogs, totalNetProfit };
  }, [filteredData]);

  const sortedTableData = useMemo(() => {
    if (chartView !== 'table') return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const numA = aVal as number;
      const numB = bVal as number;
      return sortDirection === 'asc' ? numA - numB : numB - numA;
    });
  }, [filteredData, sortField, sortDirection, chartView]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const barSize = dayCount <= 7 ? 28 : dayCount <= 14 ? 18 : 12;

  const CustomTooltipContent = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartDataPoint; dataKey: string; color: string }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0].payload;
    return (
      <div className="rounded-lg border border-border bg-surface-elevated px-4 py-3 shadow-md">
        <p className="mb-2 text-xs font-medium text-text-muted">{item.label}</p>
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
              <span className="text-xs text-text-secondary">Revenue</span>
            </div>
            <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.revenue)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f97316' }} />
              <span className="text-xs text-text-secondary">Ad Spend</span>
            </div>
            <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.adSpend)}</span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
              <span className="text-xs text-text-secondary">COGS</span>
            </div>
            <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.cogs)}</span>
          </div>
          {item.refunds > 0 && (
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f43f5e' }} />
                <span className="text-xs text-text-secondary">Refunds</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.refunds)}</span>
            </div>
          )}
          <div className="my-1 border-t border-border" />
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
              <span className="text-xs text-text-secondary">Net Profit</span>
            </div>
            <span
              className={cn(
                'text-xs font-semibold',
                item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
              )}
            >
              {formatCurrency(item.netProfit)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const CustomLegendContent = () => (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
      {[
        { label: 'Revenue', color: '#10b981', shape: 'square' },
        { label: 'Ad Spend', color: '#f97316', shape: 'square' },
        { label: 'COGS', color: '#ef4444', shape: 'square' },
        { label: 'Net Profit', color: '#3b82f6', shape: 'line' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          {item.shape === 'square' ? (
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: item.color }}
            />
          ) : (
            <span
              className="inline-block h-0.5 w-4 rounded"
              style={{ backgroundColor: item.color }}
            />
          )}
          <span className="text-xs text-text-muted">{item.label}</span>
        </div>
      ))}
    </div>
  );

  const renderGroupedBarChart = () => (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
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
          tickFormatter={formatYAxisTick}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#10b981"
          opacity={0.85}
          radius={[3, 3, 0, 0]}
          barSize={barSize}
        />
        <Bar
          dataKey="adSpend"
          name="Ad Spend"
          fill="#f97316"
          opacity={0.85}
          radius={[3, 3, 0, 0]}
          barSize={barSize}
        />
        <Bar
          dataKey="cogs"
          name="COGS"
          fill="#ef4444"
          opacity={0.7}
          radius={[3, 3, 0, 0]}
          barSize={barSize}
        />
        <Line
          type="monotone"
          dataKey="netProfit"
          name="Net Profit"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderStackedBarChart = () => (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
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
          tickFormatter={formatYAxisTick}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Bar
          dataKey="revenue"
          name="Revenue"
          fill="#10b981"
          opacity={0.85}
          radius={[3, 3, 0, 0]}
          barSize={barSize}
        />
        <Bar
          dataKey="adSpend"
          name="Ad Spend"
          fill="#f97316"
          opacity={0.85}
          stackId="costs"
          radius={[0, 0, 0, 0]}
          barSize={barSize}
        />
        <Bar
          dataKey="cogs"
          name="COGS"
          fill="#ef4444"
          opacity={0.7}
          stackId="costs"
          radius={[3, 3, 0, 0]}
          barSize={barSize}
        />
        <Line
          type="monotone"
          dataKey="netProfit"
          name="Net Profit"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
          activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );

  const renderAreaChart = () => (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <defs>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradAdSpend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradCogs" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradNetProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
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
          tickFormatter={formatYAxisTick}
        />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#gradRevenue)"
        />
        <Area
          type="monotone"
          dataKey="adSpend"
          name="Ad Spend"
          stroke="#f97316"
          strokeWidth={2}
          fill="url(#gradAdSpend)"
        />
        <Area
          type="monotone"
          dataKey="cogs"
          name="COGS"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#gradCogs)"
        />
        <Area
          type="monotone"
          dataKey="netProfit"
          name="Net Profit"
          stroke="#3b82f6"
          strokeWidth={2.5}
          fill="url(#gradNetProfit)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span className="ml-1 text-text-muted/40">&#8597;</span>;
    return (
      <span className="ml-1 text-brand">
        {sortDirection === 'asc' ? '\u2191' : '\u2193'}
      </span>
    );
  };

  const renderDataTable = () => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {([
              { field: 'date' as SortField, label: 'Date' },
              { field: 'revenue' as SortField, label: 'Revenue' },
              { field: 'adSpend' as SortField, label: 'Ad Spend' },
              { field: 'cogs' as SortField, label: 'COGS' },
              { field: 'shipping' as SortField, label: 'Shipping' },
              { field: 'fees' as SortField, label: 'Fees' },
              { field: 'refunds' as SortField, label: 'Refunds' },
              { field: 'netProfit' as SortField, label: 'Net Profit' },
              { field: 'margin' as SortField, label: 'Margin %' },
            ]).map((col) => (
              <th
                key={col.field}
                onClick={() => handleSort(col.field)}
                className={cn(
                  'cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors',
                  col.field !== 'date' && 'text-right'
                )}
              >
                {col.label}
                <SortIcon field={col.field} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedTableData.map((row) => (
            <tr
              key={row.date}
              className="border-b border-border/50 transition-colors hover:bg-surface-hover/50"
            >
              <td className="whitespace-nowrap px-3 py-2 text-xs text-text-secondary">
                {row.label}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-emerald-400">
                {formatCurrency(row.revenue)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-orange-400">
                {formatCurrency(row.adSpend)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-red-400">
                {formatCurrency(row.cogs)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-text-secondary">
                {formatCurrency(row.shipping)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-text-secondary">
                {formatCurrency(row.fees)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium text-rose-400">
                {formatCurrency(row.refunds)}
              </td>
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-right text-xs font-semibold',
                  row.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {formatCurrency(row.netProfit)}
              </td>
              <td
                className={cn(
                  'whitespace-nowrap px-3 py-2 text-right text-xs font-medium',
                  row.margin >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}
              >
                {formatPercentage(row.margin)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sortedTableData.length === 0 && (
        <div className="py-12 text-center text-sm text-text-muted">
          No data available for the selected date range.
        </div>
      )}
    </div>
  );

  const renderChart = () => {
    switch (chartView) {
      case 'grouped':
        return renderGroupedBarChart();
      case 'stacked':
        return renderStackedBarChart();
      case 'area':
        return renderAreaChart();
      case 'table':
        return renderDataTable();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-6 shadow-sm">
      {/* Header with title + view toggle + date range picker */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          Daily P&L Breakdown
        </h3>
        <div className="flex items-center gap-3">
          {/* View toggle icons */}
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            {viewOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setChartView(opt.id)}
                title={opt.label}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  chartView === opt.id
                    ? 'bg-brand/15 text-brand'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text-secondary'
                )}
              >
                <opt.Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          {/* DateRangePicker */}
          <DateRangePicker dateRange={dateRange} onRangeChange={setDateRange} />
        </div>
      </div>

      {/* Summary stats row */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Revenue', value: summary.totalRevenue, color: 'text-emerald-400' },
          { label: 'Ad Spend', value: summary.totalAdSpend, color: 'text-orange-400' },
          { label: 'COGS', value: summary.totalCogs, color: 'text-red-400' },
          {
            label: 'Net Profit',
            value: summary.totalNetProfit,
            color: summary.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-border bg-surface px-3 py-2"
          >
            <p className="text-xs text-text-muted">{stat.label}</p>
            <p className={cn('text-sm font-semibold', stat.color)}>
              {formatCurrency(stat.value)}
            </p>
          </div>
        ))}
      </div>

      {/* Chart / Table */}
      {renderChart()}
    </div>
  );
}
