'use client';

import { useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import type { HourlyBudgetRule } from '@/types/automation';

interface DayPartingScheduleEditorProps {
  schedule: HourlyBudgetRule[];
  onChange: (schedule: HourlyBudgetRule[]) => void;
}

const DAY_LABELS = ['All Days', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KEYS = ['All', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const MULTIPLIER_CYCLE = [1.0, 1.2, 1.3, 1.5, 0.8, 0.7, 0];

function hourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function getActionForMultiplier(m: number): HourlyBudgetRule['action'] {
  if (m > 1) return 'scale_up';
  if (m < 1 && m > 0) return 'scale_down';
  if (m === 0) return 'pause';
  return 'normal';
}

function getCellColor(multiplier: number): string {
  if (multiplier === 0) return 'bg-red-900/60 text-red-300';
  if (multiplier >= 1.5) return 'bg-green-700/70 text-green-100';
  if (multiplier >= 1.3) return 'bg-green-600/60 text-green-100';
  if (multiplier >= 1.2) return 'bg-green-500/50 text-green-100';
  if (multiplier > 1.0) return 'bg-green-400/40 text-green-200';
  if (multiplier === 1.0) return 'bg-surface-hover text-text-muted';
  if (multiplier >= 0.8) return 'bg-orange-600/40 text-orange-200';
  if (multiplier >= 0.7) return 'bg-orange-700/50 text-orange-200';
  return 'bg-red-700/50 text-red-200';
}

function formatMultiplier(m: number): string {
  if (m === 0) return 'X';
  if (m === 1.0) return '-';
  const sign = m > 1 ? '+' : '';
  return `${sign}${Math.round((m - 1) * 100)}%`;
}

export function DayPartingScheduleEditor({ schedule, onChange }: DayPartingScheduleEditorProps) {
  // Build a lookup: dayKey -> hour -> multiplier
  const grid = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    for (const dk of DAY_KEYS) {
      map[dk] = {};
      for (let h = 0; h < 24; h++) {
        map[dk][h] = 1.0; // default normal
      }
    }

    for (const rule of schedule) {
      for (const day of rule.days) {
        if (map[day]) {
          map[day][rule.hour] = rule.budgetMultiplier;
        }
      }
    }

    return map;
  }, [schedule]);

  // Get effective multiplier for a day/hour (resolving "All" fallback)
  const getMultiplier = useCallback(
    (dayKey: string, hour: number): number => {
      if (dayKey === 'All') {
        return grid['All']?.[hour] ?? 1.0;
      }
      // Specific day overrides "All"
      const specific = grid[dayKey]?.[hour];
      if (specific !== undefined && specific !== 1.0) return specific;
      // Fallback to "All"
      return grid['All']?.[hour] ?? 1.0;
    },
    [grid]
  );

  const updateCell = useCallback(
    (dayKey: string, hour: number, multiplier: number) => {
      // Remove existing rules for this day+hour combination
      let updated = schedule.filter(
        (r) => !(r.hour === hour && r.days.includes(dayKey))
      );

      // Add new rule if not normal
      if (multiplier !== 1.0) {
        updated = [
          ...updated,
          {
            hour,
            days: [dayKey],
            action: getActionForMultiplier(multiplier),
            budgetMultiplier: multiplier,
          },
        ];
      }

      onChange(updated);
    },
    [schedule, onChange]
  );

  const handleCellClick = useCallback(
    (dayKey: string, hour: number, shiftKey: boolean) => {
      if (shiftKey) {
        updateCell(dayKey, hour, 1.0);
        return;
      }

      const current = getMultiplier(dayKey, hour);
      const currentIndex = MULTIPLIER_CYCLE.indexOf(current);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % MULTIPLIER_CYCLE.length;
      updateCell(dayKey, hour, MULTIPLIER_CYCLE[nextIndex]);
    },
    [getMultiplier, updateCell]
  );

  const handleRowClick = useCallback(
    (dayKey: string) => {
      // Set all hours in this row to next multiplier based on first cell
      const firstMultiplier = getMultiplier(dayKey, 0);
      const currentIndex = MULTIPLIER_CYCLE.indexOf(firstMultiplier);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % MULTIPLIER_CYCLE.length;
      const newMultiplier = MULTIPLIER_CYCLE[nextIndex];

      let updated = schedule.filter(
        (r) => !r.days.includes(dayKey)
      );

      if (newMultiplier !== 1.0) {
        for (let h = 0; h < 24; h++) {
          updated.push({
            hour: h,
            days: [dayKey],
            action: getActionForMultiplier(newMultiplier),
            budgetMultiplier: newMultiplier,
          });
        }
      }

      onChange(updated);
    },
    [schedule, onChange, getMultiplier]
  );

  const handleColumnClick = useCallback(
    (hour: number) => {
      // Set all days for this hour to next multiplier based on "All" row
      const firstMultiplier = getMultiplier('All', hour);
      const currentIndex = MULTIPLIER_CYCLE.indexOf(firstMultiplier);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % MULTIPLIER_CYCLE.length;
      const newMultiplier = MULTIPLIER_CYCLE[nextIndex];

      let updated = schedule.filter((r) => r.hour !== hour);

      if (newMultiplier !== 1.0) {
        for (const dk of DAY_KEYS) {
          updated.push({
            hour,
            days: [dk],
            action: getActionForMultiplier(newMultiplier),
            budgetMultiplier: newMultiplier,
          });
        }
      }

      onChange(updated);
    },
    [schedule, onChange, getMultiplier]
  );

  // Summary calculations
  const summary = useMemo(() => {
    const peakHours: string[] = [];
    const offPeakHours: string[] = [];
    let normalCount = 0;

    for (let h = 0; h < 24; h++) {
      const m = getMultiplier('All', h);
      if (m > 1) {
        peakHours.push(hourLabel(h));
      } else if (m < 1) {
        offPeakHours.push(hourLabel(h));
      } else {
        normalCount++;
      }
    }

    const parts: string[] = [];

    if (peakHours.length > 0) {
      // Group consecutive hours
      const grouped = groupConsecutiveHours(peakHours);
      const m = getMultiplier('All', HOURS.find((h) => getMultiplier('All', h) > 1) ?? 0);
      parts.push(`Peak: ${grouped} (+${Math.round((m - 1) * 100)}%)`);
    }

    if (offPeakHours.length > 0) {
      const grouped = groupConsecutiveHours(offPeakHours);
      const m = getMultiplier('All', HOURS.find((h) => getMultiplier('All', h) < 1 && getMultiplier('All', h) > 0) ?? 0);
      const pct = m < 1 && m > 0 ? Math.round((1 - m) * 100) : 0;
      if (pct > 0) {
        parts.push(`Off-peak: ${grouped} (-${pct}%)`);
      }
    }

    if (normalCount > 0) {
      parts.push(`${normalCount} hours normal`);
    }

    return parts.join(' | ');
  }, [getMultiplier]);

  return (
    <div className="space-y-3">
      {/* Grid */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface-elevated px-2 py-1.5 text-left text-text-muted font-medium border-b border-border min-w-[80px]">
                Day / Hour
              </th>
              {HOURS.map((h) => (
                <th
                  key={h}
                  onClick={() => handleColumnClick(h)}
                  className="cursor-pointer px-0.5 py-1.5 text-center text-text-muted font-medium border-b border-border hover:bg-surface-hover transition-colors min-w-[32px]"
                  title={`Click to set all days for ${hourLabel(h)}`}
                >
                  {h % 2 === 0 ? hourLabel(h) : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((dayKey, rowIndex) => (
              <tr
                key={dayKey}
                className={cn(
                  rowIndex === 0 && 'border-b-2 border-border'
                )}
              >
                <td
                  onClick={() => handleRowClick(dayKey)}
                  className={cn(
                    'sticky left-0 z-10 cursor-pointer px-2 py-1 font-medium text-text-secondary bg-surface-elevated hover:bg-surface-hover transition-colors border-b border-border',
                    rowIndex === 0 && 'text-text-primary font-semibold'
                  )}
                  title={`Click to set all hours for ${DAY_LABELS[rowIndex]}`}
                >
                  {DAY_LABELS[rowIndex]}
                </td>
                {HOURS.map((h) => {
                  const m = getMultiplier(dayKey, h);
                  return (
                    <td
                      key={h}
                      onClick={(e) => handleCellClick(dayKey, h, e.shiftKey)}
                      className={cn(
                        'cursor-pointer px-0 py-1 text-center font-mono text-[10px] border-b border-r border-border/50 transition-colors hover:ring-1 hover:ring-primary/50',
                        getCellColor(m)
                      )}
                      title={`${DAY_LABELS[rowIndex]} ${hourLabel(h)}: ${m === 0 ? 'Paused' : m === 1 ? 'Normal' : `${Math.round(m * 100)}%`} — Click to cycle, Shift+click to reset`}
                    >
                      {formatMultiplier(m)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
        <span className="font-medium text-text-secondary">Legend:</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-green-600/60" /> Scale Up
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-surface-hover" /> Normal
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-orange-600/40" /> Scale Down
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-red-900/60" /> Pause
        </span>
        <span className="ml-auto text-text-dimmed">Click to cycle | Shift+click to reset</span>
      </div>

      {/* Summary bar */}
      {summary && (
        <div className="rounded-md bg-surface-elevated border border-border px-3 py-2 text-xs text-text-secondary">
          {summary}
        </div>
      )}
    </div>
  );
}

// Helper: group consecutive hour labels like ["8am","9am","10am","11am"] -> "8am-11am"
function groupConsecutiveHours(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];

  // Just show first-last range for simplicity
  return `${labels[0]}-${labels[labels.length - 1]}`;
}
