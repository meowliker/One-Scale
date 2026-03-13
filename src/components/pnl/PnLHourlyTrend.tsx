'use client';

import React, { useMemo } from 'react';
import type { HourlyPnLEntry } from '@/types/pnl';
import { formatCurrency } from '@/lib/utils';
import { AnimatedCounter } from './AnimatedCounter';

interface PnLHourlyTrendProps {
  hourlyPnL: HourlyPnLEntry[];
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_LABELS = ['12a', '', '', '3a', '', '', '6a', '', '', '9a', '', '', '12p', '', '', '3p', '', '', '6p', '', '', '9p', '', ''];

// Green intensity scale for profit, red for loss
const PROFIT_COLORS = ['#f8fafc', '#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857'];
const LOSS_COLORS = ['#f8fafc', '#fef2f2', '#fecaca', '#fca5a5', '#f87171', '#ef4444'];

function getHeatColor(value: number, maxProfit: number, maxLoss: number): string {
  if (value === 0) return '#f8fafc';
  if (value > 0) {
    const idx = Math.min(Math.floor((value / (maxProfit || 1)) * (PROFIT_COLORS.length - 1)), PROFIT_COLORS.length - 1);
    return PROFIT_COLORS[Math.max(idx, 1)];
  }
  const idx = Math.min(Math.floor((Math.abs(value) / (maxLoss || 1)) * (LOSS_COLORS.length - 1)), LOSS_COLORS.length - 1);
  return LOSS_COLORS[Math.max(idx, 1)];
}

interface HeatCell {
  day: number;
  hour: number;
  value: number; // net = revenue - spend
  revenue: number;
  spend: number;
}

export function PnLHourlyTrend({ hourlyPnL }: PnLHourlyTrendProps) {
  const { grid, peakHour, maxProfit, maxLoss } = useMemo(() => {
    // Group by day-of-week and hour, average the values
    const buckets: Record<string, { total: number; rev: number; spend: number; count: number }> = {};
    for (const h of hourlyPnL) {
      const dow = new Date(h.date + 'T00:00:00').getDay();
      // Convert Sunday=0 to Monday=0
      const dayIdx = dow === 0 ? 6 : dow - 1;
      const key = `${dayIdx}-${h.hour}`;
      if (!buckets[key]) buckets[key] = { total: 0, rev: 0, spend: 0, count: 0 };
      buckets[key].total += h.revenue - h.spend;
      buckets[key].rev += h.revenue;
      buckets[key].spend += h.spend;
      buckets[key].count += 1;
    }

    const cells: HeatCell[] = [];
    let mxProfit = 0;
    let mxLoss = 0;
    let peakVal = -Infinity;
    let peakH = 0;

    // Hourly totals for peak detection
    const hourTotals = new Array(24).fill(0);

    for (let d = 0; d < 7; d++) {
      for (let hr = 0; hr < 24; hr++) {
        const b = buckets[`${d}-${hr}`];
        const val = b ? b.total / b.count : 0;
        const rev = b ? b.rev / b.count : 0;
        const spend = b ? b.spend / b.count : 0;
        cells.push({ day: d, hour: hr, value: val, revenue: rev, spend });
        if (val > 0) mxProfit = Math.max(mxProfit, val);
        if (val < 0) mxLoss = Math.max(mxLoss, Math.abs(val));
        hourTotals[hr] += val;
      }
    }

    // Find peak hour range
    let bestSum = -Infinity;
    let bestStart = 0;
    for (let start = 0; start < 24; start++) {
      const sum = hourTotals[start] + (hourTotals[(start + 1) % 24] || 0) + (hourTotals[(start + 2) % 24] || 0);
      if (sum > bestSum) { bestSum = sum; bestStart = start; }
    }

    return { grid: cells, peakHour: bestStart, maxProfit: mxProfit, maxLoss: mxLoss };
  }, [hourlyPnL]);

  const peakLabel = useMemo(() => {
    const startH = peakHour;
    const endH = (peakHour + 3) % 24;
    const fmt = (h: number) => {
      if (h === 0) return '12am';
      if (h === 12) return '12pm';
      return h < 12 ? `${h}am` : `${h - 12}pm`;
    };
    return `${fmt(startH)}\u2013${fmt(endH)}`;
  }, [peakHour]);

  const totalProfit = useMemo(() => hourlyPnL.reduce((s, h) => s + h.revenue - h.spend, 0), [hourlyPnL]);

  if (hourlyPnL.length === 0) {
    return (
      <div className="rounded-2xl bg-surface border border-border shadow-sm p-5 h-full flex items-center justify-center">
        <p className="text-sm text-text-secondary">No hourly data available</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface border border-border shadow-sm overflow-hidden h-full flex flex-col">
      <div className="px-5 pt-4 pb-2">
        <p className="text-sm font-bold uppercase tracking-widest text-text-secondary">Peak Hours</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-extrabold tracking-tight text-text-primary">{peakLabel}</span>
        </div>
        <p className="text-sm text-text-secondary mt-0.5">highest profit window</p>
      </div>

      <div className="flex-1 px-5 pb-3 overflow-x-auto">
        {/* Heatmap grid */}
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: '36px repeat(24, 1fr)', minWidth: 400 }}>
          {DAYS.map((day, dayIdx) => (
            <React.Fragment key={`day-${dayIdx}`}>
              <div className="text-[9px] font-semibold text-text-secondary flex items-center justify-end pr-1.5" style={{ height: 18 }}>
                {day}
              </div>
              {Array.from({ length: 24 }, (_, hr) => {
                const cell = grid.find((c) => c.day === dayIdx && c.hour === hr);
                const val = cell?.value ?? 0;
                return (
                  <div
                    key={`${dayIdx}-${hr}`}
                    className="rounded-[3px] hover:scale-125 hover:shadow-md hover:z-10 transition-transform cursor-default relative group"
                    style={{ height: 18, background: getHeatColor(val, maxProfit, maxLoss) }}
                    title={cell ? `${DAYS[dayIdx]} ${hr}:00 — ${formatCurrency(cell.revenue)} rev, ${formatCurrency(cell.spend)} spend` : ''}
                  />
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Hour labels */}
        <div className="grid gap-[2px] mt-1" style={{ gridTemplateColumns: '36px repeat(24, 1fr)', minWidth: 400 }}>
          <div />
          {HOUR_LABELS.map((lbl, i) => (
            <div key={i} className="text-xs text-text-secondary text-center">{lbl}</div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1 mt-3 justify-end">
          <span className="text-xs text-text-secondary">Less</span>
          {['#f1f5f9', '#d1fae5', '#6ee7b7', '#10b981', '#047857'].map((c) => (
            <div key={c} className="w-3.5 h-3.5 rounded-[2px]" style={{ background: c }} />
          ))}
          <span className="text-xs text-text-secondary">More</span>
          <span className="text-xs text-text-dimmed ml-2">|</span>
          <div className="w-3.5 h-3.5 rounded-[2px] ml-1" style={{ background: '#fca5a5' }} />
          <span className="text-xs text-text-secondary">Loss</span>
        </div>
      </div>
    </div>
  );
}
