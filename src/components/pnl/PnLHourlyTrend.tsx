'use client';

import React, { useMemo, useState, useCallback } from 'react';
import type { HourlyPnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { Grid3X3, TrendingUp, BarChart3 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface PnLHourlyTrendProps {
  hourlyPnL: HourlyPnLEntry[];
  previousHourlyPnL?: HourlyPnLEntry[];
  comparisonDateLabel?: { current: string; previous: string };
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function fmtHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}

// Short hour labels for axis (every 3 hours)
const HEATMAP_HOUR_LABELS = Array.from({ length: 24 }, (_, i) => {
  if (i % 3 !== 0) return '';
  return fmtHour(i);
});

// Minimal monochrome scale — subtle greens for profit, muted reds for loss
const PROFIT_OPACITIES = [0.06, 0.12, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85];
const LOSS_OPACITIES = [0.08, 0.15, 0.25, 0.4, 0.55];

function getHeatColor(value: number, maxProfit: number, maxLoss: number): string {
  if (value === 0) return 'var(--color-surface-hover)';
  if (value > 0) {
    const idx = Math.min(Math.floor((value / (maxProfit || 1)) * (PROFIT_OPACITIES.length - 1)), PROFIT_OPACITIES.length - 1);
    const op = PROFIT_OPACITIES[Math.max(idx, 0)];
    return `rgba(16, 185, 129, ${op})`;
  }
  const idx = Math.min(Math.floor((Math.abs(value) / (maxLoss || 1)) * (LOSS_OPACITIES.length - 1)), LOSS_OPACITIES.length - 1);
  const op = LOSS_OPACITIES[Math.max(idx, 0)];
  return `rgba(239, 68, 68, ${op})`;
}

interface HeatCell {
  day: number;
  hour: number;
  value: number;
  revenue: number;
  spend: number;
}

type ViewMode = 'heatmap' | 'line' | 'bar';
type DateFilter = 'today' | 'yesterday' | '7d' | '14d' | '30d';

interface HourData {
  hour: number;
  revenue: number;
  spend: number;
  profit: number;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getYesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function filterByDays(hourlyPnL: HourlyPnLEntry[], filter: DateFilter): HourlyPnLEntry[] {
  if (hourlyPnL.length === 0) return hourlyPnL;
  if (filter === 'today') {
    const today = getTodayStr();
    return hourlyPnL.filter(h => h.date === today);
  }
  if (filter === 'yesterday') {
    const yesterday = getYesterdayStr();
    return hourlyPnL.filter(h => h.date === yesterday);
  }
  const days = filter === '7d' ? 7 : filter === '14d' ? 14 : 30;
  const sorted = [...hourlyPnL].sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(sorted.map(h => h.date))];
  const cutoff = dates.slice(-days);
  const cutoffSet = new Set(cutoff);
  return sorted.filter(h => cutoffSet.has(h.date));
}

function aggregateByHour(entries: HourlyPnLEntry[]): HourData[] {
  const byHour: Record<number, { revenue: number; spend: number; count: number }> = {};
  for (const e of entries) {
    if (!byHour[e.hour]) byHour[e.hour] = { revenue: 0, spend: 0, count: 0 };
    byHour[e.hour].revenue += e.revenue;
    byHour[e.hour].spend += e.spend;
    byHour[e.hour].count += 1;
  }
  return Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    revenue: byHour[h] ? byHour[h].revenue / byHour[h].count : 0,
    spend: byHour[h] ? byHour[h].spend / byHour[h].count : 0,
    profit: byHour[h] ? (byHour[h].revenue - byHour[h].spend) / byHour[h].count : 0,
  }));
}

function splitWeekData(hourlyPnL: HourlyPnLEntry[]) {
  const sorted = [...hourlyPnL].sort((a, b) => a.date.localeCompare(b.date));
  const dates = [...new Set(sorted.map(h => h.date))];
  const midpoint = Math.max(0, dates.length - 7);
  const currentDates = new Set(dates.slice(midpoint));
  const prevDates = new Set(dates.slice(Math.max(0, midpoint - 7), midpoint));

  const aggregate = (entries: HourlyPnLEntry[]): HourData[] => {
    const byHour: Record<number, { revenue: number; spend: number; count: number }> = {};
    for (const e of entries) {
      if (!byHour[e.hour]) byHour[e.hour] = { revenue: 0, spend: 0, count: 0 };
      byHour[e.hour].revenue += e.revenue;
      byHour[e.hour].spend += e.spend;
      byHour[e.hour].count += 1;
    }
    return Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      revenue: byHour[h] ? byHour[h].revenue / byHour[h].count : 0,
      spend: byHour[h] ? byHour[h].spend / byHour[h].count : 0,
      profit: byHour[h] ? (byHour[h].revenue - byHour[h].spend) / byHour[h].count : 0,
    }));
  };

  return {
    current: aggregate(sorted.filter(h => currentDates.has(h.date))),
    previous: aggregate(sorted.filter(h => prevDates.has(h.date))),
  };
}

// Floating tooltip component
function ChartTooltip({ x, y, data, prevData, containerRef, prevLabel }: {
  x: number;
  y: number;
  data: HourData;
  prevData?: HourData;
  containerRef: React.RefObject<HTMLDivElement | null>;
  prevLabel?: string;
}) {
  if (!containerRef.current) return null;
  const rect = containerRef.current.getBoundingClientRect();
  const tooltipLeft = Math.min(Math.max(x - 80, 0), rect.width - 180);

  return (
    <div
      className="absolute z-50 pointer-events-none bg-surface-elevated border border-border rounded-lg shadow-lg px-3 py-2.5 min-w-[160px]"
      style={{ left: tooltipLeft, top: y - 90 }}
    >
      <div className="text-xs font-bold text-text-primary mb-1">{fmtHour(data.hour)}</div>
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">Revenue</span>
        <span className="font-semibold text-emerald-500">{formatCurrency(data.revenue)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5">
        <span className="text-text-secondary">Spend</span>
        <span className="font-semibold text-red-500">{formatCurrency(data.spend)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5 pt-1 border-t border-border">
        <span className="text-text-secondary">Profit</span>
        <span className={`font-bold ${data.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {formatCurrency(data.profit)}
        </span>
      </div>
      {prevData && (
        <div className="flex justify-between text-xs mt-0.5 text-text-secondary/50">
          <span>{prevLabel ?? 'Previous'}</span>
          <span>{formatCurrency(prevData.profit)}</span>
        </div>
      )}
    </div>
  );
}

interface HourlyChartPoint {
  label: string;
  revenue: number;
  prevRevenue: number | null;
}

function HourlyLineTooltipContent({
  active: isActive,
  payload,
  prevLabel,
}: {
  active?: boolean;
  payload?: Array<{ payload: HourlyChartPoint & { _current: HourData; _prev?: HourData } }>;
  prevLabel?: string;
}) {
  if (!isActive || !payload || !payload.length) return null;
  const item = payload[0].payload;
  const d = item._current;
  const prev = item._prev;
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2.5 shadow-lg min-w-[160px]">
      <p className="text-xs font-bold text-text-primary mb-1">{item.label}</p>
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">Revenue</span>
        <span className="font-semibold text-emerald-500">{formatCurrency(d.revenue)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5">
        <span className="text-text-secondary">Spend</span>
        <span className="font-semibold text-red-400">{formatCurrency(d.spend)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5 pt-1 border-t border-border">
        <span className="text-text-secondary">Profit</span>
        <span className={`font-bold ${d.profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {formatCurrency(d.profit)}
        </span>
      </div>
      {prev && (
        <div className="flex justify-between text-xs mt-0.5 text-text-secondary/50">
          <span>{prevLabel ?? 'Previous'}</span>
          <span>{formatCurrency(prev.profit)}</span>
        </div>
      )}
    </div>
  );
}

function LineChartView({
  hourlyPnL,
  previousHourlyPnL,
  showComparison,
  prevLabel,
}: {
  hourlyPnL: HourlyPnLEntry[];
  previousHourlyPnL: HourlyPnLEntry[];
  showComparison: boolean;
  prevLabel?: string;
}) {
  const current = useMemo(() => aggregateByHour(hourlyPnL), [hourlyPnL]);
  const previous = useMemo(() => aggregateByHour(previousHourlyPnL), [previousHourlyPnL]);

  const data = useMemo(() => {
    return current.map((d, i) => ({
      label: fmtHour(d.hour),
      revenue: d.revenue,
      prevRevenue: showComparison ? previous[i]?.revenue ?? null : null,
      _current: d,
      _prev: showComparison ? previous[i] : undefined,
    }));
  }, [current, previous, showComparison]);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
        <defs>
          <linearGradient id="hourlyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
          axisLine={false}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`}
        />
        <Tooltip
          content={<HourlyLineTooltipContent prevLabel={prevLabel} />}
          cursor={{ stroke: 'var(--color-border)', strokeDasharray: '4 2' }}
        />
        {showComparison && (
          <Area
            type="monotone"
            dataKey="prevRevenue"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="6 3"
            strokeOpacity={0.8}
            fill="none"
            dot={false}
            connectNulls={false}
          />
        )}
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="#3b82f6"
          strokeWidth={2.5}
          fill="url(#hourlyGradient)"
          dot={false}
          activeDot={{ r: 5, fill: '#3b82f6', stroke: 'var(--color-surface)', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BarChartView({
  hourlyPnL,
  previousHourlyPnL,
  showComparison,
  prevLabel,
}: {
  hourlyPnL: HourlyPnLEntry[];
  previousHourlyPnL: HourlyPnLEntry[];
  showComparison: boolean;
  prevLabel?: string;
}) {
  const current = useMemo(() => aggregateByHour(hourlyPnL), [hourlyPnL]);
  const previous = useMemo(() => aggregateByHour(previousHourlyPnL), [previousHourlyPnL]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const maxAbsProfit = useMemo(() => {
    let max = Math.max(...current.map(d => Math.abs(d.profit)), 1);
    if (showComparison) {
      max = Math.max(max, ...previous.map(d => Math.abs(d.profit)));
    }
    return max;
  }, [current, previous, showComparison]);

  const padX = 48;
  const padY = 20;
  const chartW = 720 - padX * 2;
  const chartH = 240 - padY * 2;
  const zeroY = padY + chartH / 2;
  const barGroupW = chartW / 24;
  const barW = showComparison ? barGroupW * 0.35 : barGroupW * 0.6;
  const toBarH = (val: number) => (Math.abs(val) / maxAbsProfit) * (chartH / 2);

  const hourLabels = Array.from({ length: 8 }, (_, i) => i * 3);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = 720 / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    const hour = Math.floor((svgX - padX) / barGroupW);
    if (hour >= 0 && hour <= 23) {
      setHovered(hour);
      setMousePos({ x: (e.clientX - rect.left), y: (e.clientY - rect.top) });
    } else {
      setHovered(null);
    }
  }, [barGroupW]);

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox="0 0 720 240"
        className="w-full text-text-primary"
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
      >
        <line x1={padX} y1={zeroY} x2={720 - padX} y2={zeroY} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />

        {hourLabels.map(h => (
          <text
            key={h}
            x={padX + h * barGroupW + barGroupW / 2}
            y={padY + chartH + 18}
            textAnchor="middle"
            fill="currentColor" opacity="0.4"
            fontSize="10"
            fontWeight="500"
          >
            {fmtHour(h)}
          </text>
        ))}

        {showComparison &&
          previous.map(d => {
            const h = toBarH(d.profit);
            const x = padX + d.hour * barGroupW + barGroupW * 0.08;
            const y = d.profit >= 0 ? zeroY - h : zeroY;
            return (
              <rect
                key={`prev-${d.hour}`}
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx="3"
                fill="currentColor"
                fillOpacity="0.1"
              />
            );
          })}

        {current.map(d => {
          const h = toBarH(d.profit);
          const x = padX + d.hour * barGroupW + (showComparison ? barGroupW * 0.08 + barW + 2 : (barGroupW - barW) / 2);
          const y = d.profit >= 0 ? zeroY - h : zeroY;
          const isHov = hovered === d.hour;
          return (
            <rect
              key={`cur-${d.hour}`}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 1)}
              rx="3"
              fill={d.profit >= 0 ? '#10b981' : '#f87171'}
              opacity={isHov ? 1 : 0.85}
              style={{ transition: 'opacity 0.15s ease' }}
            />
          );
        })}

        {/* Hover highlight */}
        {hovered !== null && (
          <rect
            x={padX + hovered * barGroupW}
            y={padY}
            width={barGroupW}
            height={chartH}
            fill="currentColor"
            fillOpacity="0.04"
            rx="4"
          />
        )}
      </svg>

      {hovered !== null && (
        <ChartTooltip
          x={mousePos.x}
          y={mousePos.y}
          data={current[hovered]}
          prevData={showComparison ? previous[hovered] : undefined}
          containerRef={containerRef}
          prevLabel={prevLabel}
        />
      )}
    </div>
  );
}

// Heatmap tooltip for individual cell hover
function HeatmapTooltip({ cell, dayName, position }: {
  cell: HeatCell;
  dayName: string;
  position: { x: number; y: number };
}) {
  return (
    <div
      className="fixed z-[100] pointer-events-none bg-surface-elevated border border-border rounded-lg shadow-xl px-3 py-2.5 min-w-[170px]"
      style={{ left: position.x + 12, top: position.y - 70 }}
    >
      <div className="text-xs font-bold text-text-primary mb-1.5">{dayName} · {fmtHour(cell.hour)}</div>
      <div className="flex justify-between text-xs">
        <span className="text-text-secondary">Revenue</span>
        <span className="font-semibold text-emerald-500">{formatCurrency(cell.revenue)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5">
        <span className="text-text-secondary">Spend</span>
        <span className="font-semibold text-red-500">{formatCurrency(cell.spend)}</span>
      </div>
      <div className="flex justify-between text-xs mt-0.5 pt-1 border-t border-border">
        <span className="text-text-secondary">Profit</span>
        <span className={`font-bold ${cell.value >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
          {formatCurrency(cell.value)}
        </span>
      </div>
    </div>
  );
}

const VIEW_ICONS: Record<ViewMode, { icon: React.ElementType; label: string }> = {
  heatmap: { icon: Grid3X3, label: 'Heatmap' },
  line: { icon: TrendingUp, label: 'Line' },
  bar: { icon: BarChart3, label: 'Bar' },
};

export function PnLHourlyTrend({ hourlyPnL, previousHourlyPnL = [], comparisonDateLabel }: PnLHourlyTrendProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('line');
  const [showComparison, setShowComparison] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ cell: HeatCell; dayName: string; pos: { x: number; y: number } } | null>(null);

  // Data is already filtered by the global date picker
  const filteredPnL = hourlyPnL;

  const buildHeatGrid = useCallback((entries: HourlyPnLEntry[]) => {
    const buckets: Record<string, { total: number; rev: number; spend: number; count: number }> = {};
    for (const h of entries) {
      const dow = new Date(h.date + 'T00:00:00').getDay();
      const dayIdx = dow === 0 ? 6 : dow - 1;
      const key = `${dayIdx}-${h.hour}`;
      if (!buckets[key]) buckets[key] = { total: 0, rev: 0, spend: 0, count: 0 };
      buckets[key].total += h.revenue - h.spend;
      buckets[key].rev += h.revenue;
      buckets[key].spend += h.spend;
      buckets[key].count += 1;
    }
    const cells: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      for (let hr = 0; hr < 24; hr++) {
        const b = buckets[`${d}-${hr}`];
        cells.push({
          day: d,
          hour: hr,
          value: b ? b.total / b.count : 0,
          revenue: b ? b.rev / b.count : 0,
          spend: b ? b.spend / b.count : 0,
        });
      }
    }
    return cells;
  }, []);

  const { grid, peakHour, maxProfit, maxLoss, prevGrid } = useMemo(() => {
    // Build main grid from current period data
    const cells = buildHeatGrid(filteredPnL);

    // Build previous period grid from the separate previous data
    const previousGrid = buildHeatGrid(previousHourlyPnL);

    let mxProfit = 0;
    let mxLoss = 0;
    const hourTotals = new Array(24).fill(0);

    for (const cell of cells) {
      if (cell.value > 0) mxProfit = Math.max(mxProfit, cell.value);
      if (cell.value < 0) mxLoss = Math.max(mxLoss, Math.abs(cell.value));
      hourTotals[cell.hour] += cell.value;
    }

    let bestSum = -Infinity;
    let bestStart = 0;
    for (let start = 0; start < 24; start++) {
      const sum = hourTotals[start] + (hourTotals[(start + 1) % 24] || 0) + (hourTotals[(start + 2) % 24] || 0);
      if (sum > bestSum) { bestSum = sum; bestStart = start; }
    }

    return {
      grid: cells,
      peakHour: bestStart,
      maxProfit: mxProfit,
      maxLoss: mxLoss,
      prevGrid: previousGrid,
    };
  }, [filteredPnL, previousHourlyPnL, buildHeatGrid]);

  const peakLabel = useMemo(() => {
    const endH = (peakHour + 3) % 24;
    return `${fmtHour(peakHour)}\u2013${fmtHour(endH)}`;
  }, [peakHour]);

  if (hourlyPnL.length === 0) {
    return (
      <div className="apple-card p-10 h-full flex flex-col items-center justify-center">
        <p className="text-sm font-medium text-text-secondary">No hourly data yet</p>
        <p className="text-xs text-text-secondary/50 mt-1.5">Hourly performance data will appear once ad campaigns are running</p>
      </div>
    );
  }

  return (
    <div className="apple-card overflow-hidden h-full flex flex-col">
      <div className="px-5 pt-5 pb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-text-secondary/60">Peak Hours</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-extrabold tracking-tight text-text-primary">{peakLabel}</span>
        </div>
        <p className="text-xs text-text-secondary/50 mt-1">Highest profit window</p>
      </div>

      {/* Toolbar */}
      <div className="px-5 pb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {/* View mode icons */}
          <div className="flex items-center gap-0.5 bg-surface-hover rounded-lg p-0.5">
            {(['heatmap', 'line', 'bar'] as const).map((mode) => {
              const { icon: Icon, label } = VIEW_ICONS[mode];
              return (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`relative p-2 rounded-md transition-all ${
                    viewMode === mode
                      ? 'bg-surface shadow-sm text-text-primary'
                      : 'text-text-secondary/40 hover:text-text-secondary'
                  }`}
                  title={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>

        </div>

        <button
          onClick={() => setShowComparison((prev) => !prev)}
          className={
            showComparison
              ? 'border-2 border-blue-500 bg-blue-500/15 text-blue-400 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all shadow-sm shadow-blue-500/20'
              : 'border-2 border-border bg-surface text-text-secondary hover:border-blue-400 hover:text-blue-400 hover:bg-blue-500/5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all'
          }
        >
          ↔ Compare
        </button>
      </div>

      <div className="flex-1 px-5 pb-4 overflow-x-auto">
        {/* Heatmap view */}
        {viewMode === 'heatmap' && (
          <>
            {showComparison ? (
              /* Side-by-side comparison heatmaps */
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-secondary/50 mb-1.5">{comparisonDateLabel?.current ?? 'Current Period'}</p>
                  <div className="grid gap-[2px]" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', minWidth: 500 }}>
                    {DAYS.map((day, dayIdx) => (
                      <React.Fragment key={`cur-day-${dayIdx}`}>
                        <div className="text-xs font-semibold text-text-secondary flex items-center justify-end pr-2" style={{ height: 20 }}>
                          {day}
                        </div>
                        {Array.from({ length: 24 }, (_, hr) => {
                          const cell = grid.find((c) => c.day === dayIdx && c.hour === hr);
                          const val = cell?.value ?? 0;
                          return (
                            <div
                              key={`cur-${dayIdx}-${hr}`}
                              className="rounded-[3px] hover:scale-[1.3] hover:shadow-md hover:z-10 transition-transform cursor-default"
                              style={{ height: 20, background: getHeatColor(val, maxProfit, maxLoss) }}
                              onMouseEnter={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                              onMouseMove={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                              onMouseLeave={() => setHoveredCell(null)}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-secondary/50 mb-1.5">{comparisonDateLabel?.previous ?? 'Previous Period'}</p>
                  <div className="grid gap-[2px]" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', minWidth: 500 }}>
                    {DAYS.map((day, dayIdx) => (
                      <React.Fragment key={`prev-day-${dayIdx}`}>
                        <div className="text-xs font-semibold text-text-secondary flex items-center justify-end pr-2" style={{ height: 20 }}>
                          {day}
                        </div>
                        {Array.from({ length: 24 }, (_, hr) => {
                          const cell = prevGrid.find((c) => c.day === dayIdx && c.hour === hr);
                          const val = cell?.value ?? 0;
                          return (
                            <div
                              key={`prev-${dayIdx}-${hr}`}
                              className="rounded-[3px] hover:scale-[1.3] hover:shadow-md hover:z-10 transition-transform cursor-default"
                              style={{ height: 20, background: getHeatColor(val, maxProfit, maxLoss) }}
                              onMouseEnter={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                              onMouseMove={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                              onMouseLeave={() => setHoveredCell(null)}
                            />
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Single heatmap */
              <div className="grid gap-[2px]" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', minWidth: 500 }}>
                {DAYS.map((day, dayIdx) => (
                  <React.Fragment key={`day-${dayIdx}`}>
                    <div className="text-xs font-semibold text-text-secondary flex items-center justify-end pr-2" style={{ height: 22 }}>
                      {day}
                    </div>
                    {Array.from({ length: 24 }, (_, hr) => {
                      const cell = grid.find((c) => c.day === dayIdx && c.hour === hr);
                      const val = cell?.value ?? 0;
                      return (
                        <div
                          key={`${dayIdx}-${hr}`}
                          className="rounded-[3px] hover:scale-[1.3] hover:shadow-md hover:z-10 transition-transform cursor-default"
                          style={{ height: 22, background: getHeatColor(val, maxProfit, maxLoss) }}
                          onMouseEnter={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                          onMouseMove={(e) => cell && setHoveredCell({ cell, dayName: day, pos: { x: e.clientX, y: e.clientY } })}
                          onMouseLeave={() => setHoveredCell(null)}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Hour labels */}
            <div className="grid gap-[2px] mt-1.5" style={{ gridTemplateColumns: '40px repeat(24, 1fr)', minWidth: 500 }}>
              <div />
              {HEATMAP_HOUR_LABELS.map((lbl, i) => (
                <div key={i} className="text-xs text-text-secondary/50 text-center font-medium">{lbl}</div>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-1.5 mt-3 justify-end">
              <span className="text-xs text-text-secondary/40">Less</span>
              {[0.06, 0.2, 0.4, 0.7].map((op, i) => (
                <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(16, 185, 129, ${op})` }} />
              ))}
              <span className="text-xs text-text-secondary/40">More</span>
              <span className="text-xs text-text-secondary/15 mx-0.5">|</span>
              <div className="w-3 h-3 rounded-sm" style={{ background: 'rgba(239, 68, 68, 0.35)' }} />
              <span className="text-xs text-text-secondary/40">Loss</span>
            </div>
          </>
        )}

        {/* Line chart */}
        {viewMode === 'line' && (
          <div className="mt-1">
            <LineChartView hourlyPnL={filteredPnL} previousHourlyPnL={previousHourlyPnL} showComparison={showComparison} prevLabel={comparisonDateLabel?.previous} />
            {showComparison && (
              <div className="flex items-center gap-5 mt-3 justify-end">
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-[2px] bg-blue-500 rounded-full" />
                  <span className="text-xs font-medium text-text-primary">{comparisonDateLabel?.current ?? 'Current'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-[2px] rounded-full bg-amber-500" style={{ opacity: 0.8 }} />
                  <span className="text-xs font-medium text-text-secondary">{comparisonDateLabel?.previous ?? 'Previous'}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bar chart */}
        {viewMode === 'bar' && (
          <div className="mt-1">
            <BarChartView hourlyPnL={filteredPnL} previousHourlyPnL={previousHourlyPnL} showComparison={showComparison} prevLabel={comparisonDateLabel?.previous} />
            <div className="flex items-center gap-4 mt-3 justify-end">
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-[3px] bg-emerald-500" />
                <span className="text-xs font-medium text-text-secondary">Profit</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-[3px] bg-red-400" />
                <span className="text-xs font-medium text-text-secondary">Loss</span>
              </div>
              {showComparison && (
                <div className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-[3px] bg-text-secondary/15" />
                  <span className="text-xs font-medium text-text-secondary">{comparisonDateLabel?.previous ?? 'Previous'}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Heatmap floating tooltip */}
      {hoveredCell && (
        <HeatmapTooltip
          cell={hoveredCell.cell}
          dayName={hoveredCell.dayName}
          position={hoveredCell.pos}
        />
      )}
    </div>
  );
}
