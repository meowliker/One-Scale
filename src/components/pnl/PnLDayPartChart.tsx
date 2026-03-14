'use client';

import { useState, useMemo } from 'react';
import type { PnLEntry } from '@/types/pnl';
import { formatCurrency, formatPercentage, cn } from '@/lib/utils';
import { BarChart3, Layers, TrendingUp, Table, ArrowUp, ArrowDown } from 'lucide-react';
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
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface PnLDayPartChartProps {
  isDigital?: boolean;
  dailyPnL: PnLEntry[];
  currency?: string;
}

type ChartView = 'grouped' | 'stacked' | 'area' | 'table';

interface ChartDataPoint {
  date: string;
  label: string;
  dayOfWeek: string;
  revenue: number;
  adSpend: number;
  cogs: number;
  shipping: number;
  fees: number;
  refunds: number;
  totalCosts: number;
  netProfit: number;
  margin: number;
  orderCount: number;
}

type SortField = 'date' | 'revenue' | 'adSpend' | 'cogs' | 'shipping' | 'fees' | 'refunds' | 'netProfit' | 'margin';
type SortDirection = 'asc' | 'desc';

const viewOptions: { id: ChartView; label: string; Icon: typeof BarChart3 }[] = [
  { id: 'grouped', label: 'Revenue vs Costs', Icon: BarChart3 },
  { id: 'stacked', label: 'Cost Breakdown', Icon: Layers },
  { id: 'area', label: 'Trend Lines', Icon: TrendingUp },
  { id: 'table', label: 'Data Table', Icon: Table },
];

function formatDateLabel(dateStr: string, shortRange: boolean): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (shortRange) {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getDayOfWeek(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
}

function formatYAxisTick(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toFixed(0)}`;
}

export function PnLDayPartChart({ dailyPnL, isDigital = false, currency = 'USD' }: PnLDayPartChartProps) {
  const [chartView, setChartView] = useState<ChartView>('grouped');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const shortRange = dailyPnL.length <= 7;

  const filteredData: ChartDataPoint[] = useMemo(() => {
    const sorted = [...dailyPnL].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    return sorted.map((entry) => {
      const totalCosts = entry.adSpend + entry.cogs + entry.shipping + entry.fees + entry.refunds;
      return {
        date: entry.date,
        label: formatDateLabel(entry.date, shortRange),
        dayOfWeek: getDayOfWeek(entry.date),
        revenue: entry.revenue,
        adSpend: entry.adSpend,
        cogs: entry.cogs,
        shipping: entry.shipping,
        fees: entry.fees,
        refunds: entry.refunds,
        totalCosts,
        netProfit: entry.netProfit,
        margin: entry.revenue > 0 ? (entry.netProfit / entry.revenue) * 100 : 0,
        orderCount: entry.orderCount || 0,
      };
    });
  }, [dailyPnL, shortRange]);

  const summary = useMemo(() => {
    const totalRevenue = filteredData.reduce((sum, d) => sum + d.revenue, 0);
    const totalAdSpend = filteredData.reduce((sum, d) => sum + d.adSpend, 0);
    const totalCogs = filteredData.reduce((sum, d) => sum + d.cogs, 0);
    const totalNetProfit = filteredData.reduce((sum, d) => sum + d.netProfit, 0);
    const totalOrders = filteredData.reduce((sum, d) => sum + d.orderCount, 0);
    const avgDailyProfit = filteredData.length > 0 ? totalNetProfit / filteredData.length : 0;
    const totalMargin = totalRevenue > 0 ? (totalNetProfit / totalRevenue) * 100 : 0;
    const bestDay = filteredData.length > 0
      ? filteredData.reduce((best, d) => d.netProfit > best.netProfit ? d : best, filteredData[0])
      : null;
    const worstDay = filteredData.length > 0
      ? filteredData.reduce((worst, d) => d.netProfit < worst.netProfit ? d : worst, filteredData[0])
      : null;
    const profitableDays = filteredData.filter(d => d.netProfit > 0).length;
    return { totalRevenue, totalAdSpend, totalCogs, totalNetProfit, totalOrders, avgDailyProfit, totalMargin, bestDay, worstDay, profitableDays };
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

  const barSize = dailyPnL.length <= 7 ? 28 : dailyPnL.length <= 14 ? 18 : 12;

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
      <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3 shadow-lg min-w-[220px]">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-text-primary">{item.label}</p>
          {item.orderCount > 0 && (
            <span className="text-[10px] text-text-muted">{item.orderCount} orders</span>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#10b981' }} />
              <span className="text-xs text-text-secondary">Revenue</span>
            </div>
            <span className="text-xs font-semibold text-emerald-400">{formatCurrency(item.revenue, currency)}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f97316' }} />
              <span className="text-xs text-text-secondary">Ad Spend</span>
            </div>
            <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.adSpend, currency)}</span>
          </div>
          {!isDigital && item.cogs > 0 && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-xs text-text-secondary">COGS</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.cogs, currency)}</span>
            </div>
          )}
          {(item.shipping > 0 || item.fees > 0) && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#8b5cf6' }} />
                <span className="text-xs text-text-secondary">Ship + Fees</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.shipping + item.fees, currency)}</span>
            </div>
          )}
          {item.refunds > 0 && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: '#f43f5e' }} />
                <span className="text-xs text-text-secondary">Refunds</span>
              </div>
              <span className="text-xs font-semibold text-text-primary">{formatCurrency(item.refunds, currency)}</span>
            </div>
          )}
          <div className="my-1.5 border-t border-border" />
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className={cn(
                'inline-block h-2.5 w-2.5 rounded-full',
                item.netProfit >= 0 ? 'bg-emerald-400' : 'bg-red-400'
              )} />
              <span className="text-xs font-medium text-text-secondary">Net Profit</span>
            </div>
            <span className={cn('text-xs font-bold', item.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {formatCurrency(item.netProfit, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] text-text-muted pl-[18px]">Margin</span>
            <span className={cn('text-[10px] font-semibold', item.margin >= 0 ? 'text-emerald-400/80' : 'text-red-400/80')}>
              {formatPercentage(item.margin)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const CustomLegendContent = () => (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
      {[
        { label: 'Revenue', color: '#10b981', shape: 'square' as const },
        { label: 'Ad Spend', color: '#f97316', shape: 'square' as const },
        ...(!isDigital ? [{ label: 'COGS', color: '#ef4444', shape: 'square' as const }] : []),
        { label: 'Net Profit', color: '#3b82f6', shape: 'line' as const },
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
    <div style={{ width: '100%', minHeight: 360 }}>
    <ResponsiveContainer width="100%" height={360} minHeight={360}>
      <ComposedChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #1e2235)" opacity={0.5} />
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
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Bar dataKey="revenue" name="Revenue" fill="#10b981" opacity={0.9} radius={[4, 4, 0, 0]} barSize={barSize} />
        <Bar dataKey="adSpend" name="Ad Spend" fill="#f97316" opacity={0.85} radius={[4, 4, 0, 0]} barSize={barSize} />
        {!isDigital && <Bar dataKey="cogs" name="COGS" fill="#ef4444" opacity={0.75} radius={[4, 4, 0, 0]} barSize={barSize} />}
        <Line
          type="monotone"
          dataKey="netProfit"
          name="Net Profit"
          stroke="#3b82f6"
          strokeWidth={2.5}
          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#1e293b' }}
          activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );

  const renderStackedBarChart = () => (
    <div style={{ width: '100%', minHeight: 360 }}>
    <ResponsiveContainer width="100%" height={360} minHeight={360}>
      <ComposedChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #1e2235)" opacity={0.5} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatYAxisTick} />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Bar dataKey="revenue" name="Revenue" fill="#10b981" opacity={0.9} radius={[4, 4, 0, 0]} barSize={barSize} />
        <Bar dataKey="adSpend" name="Ad Spend" fill="#f97316" opacity={0.85} stackId="costs" radius={[0, 0, 0, 0]} barSize={barSize} />
        {!isDigital && <Bar dataKey="cogs" name="COGS" fill="#ef4444" opacity={0.75} stackId="costs" radius={[4, 4, 0, 0]} barSize={barSize} />}
        <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#3b82f6" strokeWidth={2.5}
          dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#1e293b' }}
          activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
        />
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );

  const renderAreaChart = () => (
    <div style={{ width: '100%', minHeight: 360 }}>
    <ResponsiveContainer width="100%" height={360} minHeight={360}>
      <AreaChart data={filteredData} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <defs>
          <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradNetProfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border, #1e2235)" opacity={0.5} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={formatYAxisTick} />
        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
        <Tooltip content={<CustomTooltipContent />} />
        <Legend content={<CustomLegendContent />} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" strokeWidth={2} fill="url(#gradRevenue)" />
        <Area type="monotone" dataKey="adSpend" name="Ad Spend" stroke="#f97316" strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" />
        {!isDigital && <Area type="monotone" dataKey="cogs" name="COGS" stroke="#ef4444" strokeWidth={1.5} fill="transparent" strokeDasharray="4 2" />}
        <Area type="monotone" dataKey="netProfit" name="Net Profit" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gradNetProfit)" />
      </AreaChart>
    </ResponsiveContainer>
    </div>
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
              ...(!isDigital ? [{ field: 'cogs' as SortField, label: 'COGS' }] : []),
              { field: 'shipping' as SortField, label: 'Shipping' },
              { field: 'fees' as SortField, label: 'Fees' },
              { field: 'refunds' as SortField, label: 'Refunds' },
              { field: 'netProfit' as SortField, label: 'Net Profit' },
              { field: 'margin' as SortField, label: 'Margin' },
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
          {sortedTableData.map((row, i) => (
            <tr
              key={row.date}
              className={cn(
                'border-b border-border/50 transition-colors hover:bg-surface-hover/50',
                i % 2 === 0 && 'bg-surface/30'
              )}
            >
              <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                <div className="text-text-secondary">{row.label}</div>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-emerald-400">
                {formatCurrency(row.revenue, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-orange-400">
                {formatCurrency(row.adSpend, currency)}
              </td>
              {!isDigital && <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-red-400">
                {formatCurrency(row.cogs, currency)}
              </td>}
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-text-secondary">
                {formatCurrency(row.shipping, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-text-secondary">
                {formatCurrency(row.fees, currency)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium text-rose-400">
                {row.refunds > 0 ? formatCurrency(row.refunds, currency) : '-'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-bold">
                <span className={cn(
                  'inline-flex items-center gap-1',
                  row.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                )}>
                  {row.netProfit >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                  {formatCurrency(Math.abs(row.netProfit), currency)}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs">
                <span className={cn(
                  'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold',
                  row.margin >= 20 ? 'bg-emerald-500/15 text-emerald-400' :
                  row.margin >= 0 ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-red-500/15 text-red-400'
                )}>
                  {formatPercentage(row.margin)}
                </span>
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
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Daily P&L Breakdown
          </h3>
          {filteredData.length > 0 && (
            <p className="mt-0.5 text-[11px] text-text-muted">
              {summary.profitableDays}/{filteredData.length} profitable days
              {summary.totalMargin !== 0 && <> &middot; {formatPercentage(summary.totalMargin)} avg margin</>}
            </p>
          )}
        </div>
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
      </div>

      {/* Summary stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Revenue</p>
          <p className="text-sm font-bold text-emerald-400">{formatCurrency(summary.totalRevenue, currency)}</p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Ad Spend</p>
          <p className="text-sm font-bold text-orange-400">{formatCurrency(summary.totalAdSpend, currency)}</p>
        </div>
        {!isDigital && (
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">COGS</p>
            <p className="text-sm font-bold text-red-400">{formatCurrency(summary.totalCogs, currency)}</p>
          </div>
        )}
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Net Profit</p>
          <p className={cn('text-sm font-bold', summary.totalNetProfit >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {formatCurrency(summary.totalNetProfit, currency)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-surface px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-muted">Daily Avg</p>
          <p className={cn('text-sm font-bold', summary.avgDailyProfit >= 0 ? 'text-blue-400' : 'text-red-400')}>
            {formatCurrency(summary.avgDailyProfit, currency)}
          </p>
        </div>
      </div>

      {/* Best / Worst day indicators */}
      {filteredData.length > 1 && summary.bestDay && summary.worstDay && (
        <div className="mb-4 flex flex-wrap gap-3 text-[11px]">
          <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1">
            <ArrowUp className="h-3 w-3 text-emerald-400" />
            <span className="text-text-muted">Best:</span>
            <span className="font-semibold text-emerald-400">
              {formatDateLabel(summary.bestDay.date, true)} ({formatCurrency(summary.bestDay.netProfit, currency)})
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-red-500/10 px-2.5 py-1">
            <ArrowDown className="h-3 w-3 text-red-400" />
            <span className="text-text-muted">Worst:</span>
            <span className="font-semibold text-red-400">
              {formatDateLabel(summary.worstDay.date, true)} ({formatCurrency(summary.worstDay.netProfit, currency)})
            </span>
          </div>
        </div>
      )}

      {/* Chart / Table */}
      {renderChart()}
    </div>
  );
}
