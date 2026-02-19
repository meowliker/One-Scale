'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  dayLabels,
  hourLabels,
} from '@/data/mockDayParting';
import type { DayPartingCell } from '@/data/mockDayParting';

type HeatmapMetric = 'roas' | 'spend' | 'cpa' | 'conversions';

interface HeatmapChartProps {
  data: DayPartingCell[];
}

const metricConfig: Record<
  HeatmapMetric,
  { label: string; format: (v: number) => string; higherBetter: boolean }
> = {
  roas: { label: 'ROAS', format: (v) => `${v.toFixed(2)}x`, higherBetter: true },
  spend: { label: 'Spend', format: (v) => `$${v.toFixed(0)}`, higherBetter: false },
  cpa: { label: 'CPA', format: (v) => `$${v.toFixed(2)}`, higherBetter: false },
  conversions: { label: 'Conversions', format: (v) => `${v}`, higherBetter: true },
};

function getColor(value: number, min: number, max: number, higherBetter: boolean): string {
  const range = max - min;
  if (range === 0) return 'bg-surface-hover';
  const normalized = (value - min) / range;
  const intensity = higherBetter ? normalized : 1 - normalized;

  if (intensity >= 0.8) return 'bg-emerald-600 text-white';
  if (intensity >= 0.6) return 'bg-emerald-500/70 text-white';
  if (intensity >= 0.4) return 'bg-amber-500/50 text-white';
  if (intensity >= 0.2) return 'bg-orange-500/60 text-white';
  return 'bg-red-500/70 text-white';
}

export function HeatmapChart({ data }: HeatmapChartProps) {
  const [metric, setMetric] = useState<HeatmapMetric>('roas');
  const [hoveredCell, setHoveredCell] = useState<DayPartingCell | null>(null);

  const config = metricConfig[metric];

  const { min, max } = useMemo(() => {
    const values = data.map((c) => c[metric]);
    return { min: Math.min(...values), max: Math.max(...values) };
  }, [data, metric]);

  return (
    <div>
      {/* Metric selector */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs font-medium text-text-muted">Metric:</span>
        {(Object.keys(metricConfig) as HeatmapMetric[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              metric === m
                ? 'bg-brand text-white'
                : 'bg-surface-hover text-text-secondary hover:text-text-primary'
            )}
          >
            {metricConfig[m].label}
          </button>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div className="mb-3 rounded-lg border border-border bg-surface-elevated p-3 text-xs shadow-sm">
          <span className="font-semibold text-text-primary">
            {hoveredCell.day} {hourLabels[hoveredCell.hour]}
          </span>
          <div className="mt-1 flex gap-4 text-text-secondary">
            <span>Spend: ${hoveredCell.spend.toFixed(2)}</span>
            <span>Revenue: ${hoveredCell.revenue.toFixed(2)}</span>
            <span>ROAS: {hoveredCell.roas.toFixed(2)}x</span>
            <span>Conv: {hoveredCell.conversions}</span>
            <span>CPA: ${hoveredCell.cpa.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Hour labels */}
          <div className="mb-1 flex">
            <div className="w-12 shrink-0" />
            {hourLabels.map((label, i) => (
              <div
                key={i}
                className="flex-1 text-center text-[10px] text-text-muted"
              >
                {i % 2 === 0 ? label : ''}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {dayLabels.map((day) => (
            <div key={day} className="mb-0.5 flex items-center">
              <div className="w-12 shrink-0 text-right pr-2 text-xs font-medium text-text-secondary">
                {day}
              </div>
              {Array.from({ length: 24 }, (_, hour) => {
                const cell = data.find(
                  (c) => c.day === day && c.hour === hour
                );
                if (!cell) return null;
                const colorClass = getColor(
                  cell[metric],
                  min,
                  max,
                  config.higherBetter
                );
                return (
                  <div
                    key={hour}
                    className={cn(
                      'flex flex-1 cursor-pointer items-center justify-center rounded-sm p-1 text-[9px] font-medium transition-opacity',
                      colorClass,
                      hoveredCell?.day === day && hoveredCell?.hour === hour
                        ? 'ring-2 ring-brand ring-offset-1'
                        : ''
                    )}
                    style={{ minHeight: '32px' }}
                    onMouseEnter={() => setHoveredCell(cell)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {config.format(cell[metric])}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-text-muted">
        <span>{config.higherBetter ? 'Low' : 'High'}</span>
        <div className="flex gap-0.5">
          <div className="h-3 w-6 rounded-sm bg-red-500/70" />
          <div className="h-3 w-6 rounded-sm bg-orange-500/60" />
          <div className="h-3 w-6 rounded-sm bg-amber-500/50" />
          <div className="h-3 w-6 rounded-sm bg-emerald-500/70" />
          <div className="h-3 w-6 rounded-sm bg-emerald-600" />
        </div>
        <span>{config.higherBetter ? 'High' : 'Low'}</span>
      </div>
    </div>
  );
}
