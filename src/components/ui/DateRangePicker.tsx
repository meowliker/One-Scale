'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateRange } from '@/lib/dateUtils';
import {
  STORE_REPORTING_TIMEZONE,
  endOfStoreDayInTz,
  formatInTimezone,
  formatDateInTimezone,
  startOfStoreDayInTz,
  storeDayInTimezone,
  todayStoreDayInTimezone,
} from '@/lib/timezone';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { DateRangePreset } from '@/types/analytics';

export interface DateRangePickerProps {
  dateRange: { start: Date; end: Date; preset?: DateRangePreset };
  onRangeChange: (range: { start: Date; end: Date; preset?: DateRangePreset }) => void;
}

// ── Presets ──────────────────────────────────────────────────────────────────

interface PresetDef {
  label: string;
  value: DateRangePreset;
  shortLabel?: string;
}

const presets: PresetDef[] = [
  { label: 'Today', value: 'today', shortLabel: 'Today' },
  { label: 'Yesterday', value: 'yesterday', shortLabel: 'Yest.' },
  { label: 'Last 7 days', value: 'last7', shortLabel: '7D' },
  { label: 'Last 14 days', value: 'last14', shortLabel: '14D' },
  { label: 'Last 28 days', value: 'last28', shortLabel: '28D' },
  { label: 'Last 30 days', value: 'last30', shortLabel: '30D' },
  { label: 'This month', value: 'thisMonth', shortLabel: 'MTD' },
  { label: 'Last month', value: 'lastMonth', shortLabel: 'Prev.' },
];

const presetLabels: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last3: 'Last 3 Days',
  last7: 'Last 7 Days',
  last7today: '7D + Today',
  last14: 'Last 14 Days',
  last28: 'Last 28 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function getDaysInMonth(year: number, month: number): number {
  // Use UTC to avoid timezone edge cases
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Monday-first day index (0=Mon, 6=Sun). Uses UTC to avoid timezone shifts. */
function getFirstDayOfWeek(year: number, month: number): number {
  const d = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return d === 0 ? 6 : d - 1;
}

function formatTriggerLabel(start: Date, end: Date, preset?: DateRangePreset, tz?: string): string {
  if (preset && preset !== 'custom' && presetLabels[preset]) return presetLabels[preset];
  const timezone = tz || STORE_REPORTING_TIMEZONE;
  const startStr = storeDayInTimezone(start, timezone);
  const endStr = storeDayInTimezone(end, timezone);
  const startDisplayDate = fromZonedTime(`${startStr}T12:00:00`, timezone);
  const endDisplayDate = fromZonedTime(`${endStr}T12:00:00`, timezone);
  if (startStr === endStr) return formatInTimezone(startDisplayDate, 'MMM d, yyyy', timezone);
  const startYear = toZonedTime(startDisplayDate, timezone).getFullYear();
  const endYear = toZonedTime(endDisplayDate, timezone).getFullYear();
  if (startYear === endYear)
    return `${formatInTimezone(startDisplayDate, 'MMM d', timezone)} – ${formatInTimezone(endDisplayDate, 'MMM d', timezone)}`;
  return `${formatInTimezone(startDisplayDate, 'MMM d, yyyy', timezone)} – ${formatInTimezone(endDisplayDate, 'MMM d, yyyy', timezone)}`;
}

function formatCompact(date: Date, tz: string): string {
  return formatInTimezone(date, 'MMM d, yyyy', tz);
}

function getSelectionLabels(
  range: { start: Date; end: Date; preset?: DateRangePreset },
  tz: string,
): { start: string; end: string } {
  if (range.preset && range.preset !== 'custom') {
    return {
      start: storeDayInTimezone(range.start, tz),
      end: storeDayInTimezone(range.end, tz),
    };
  }
  return {
    start: storeDayInTimezone(range.start, tz),
    end: storeDayInTimezone(range.end, tz),
  };
}

// ── Calendar Grid ───────────────────────────────────────────────────────────

interface CalendarGridProps {
  year: number;
  month: number;
  timezone: string;
  selectedStart: string | null; // YYYY-MM-DD
  selectedEnd: string | null;   // YYYY-MM-DD
  hoverDate: string | null;     // YYYY-MM-DD
  onDateClick: (dateStr: string) => void;
  onDateHover: (dateStr: string | null) => void;
}

function CalendarGrid({
  year, month, timezone,
  selectedStart, selectedEnd, hoverDate,
  onDateClick, onDateHover,
}: CalendarGridProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const todayStr = todayStoreDayInTimezone(timezone);

  // Compute effective range for highlight
  const effectiveEnd = selectedEnd || hoverDate;
  let rangeStart = selectedStart;
  let rangeEnd = effectiveEnd;
  if (rangeStart && rangeEnd && rangeStart > rangeEnd) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="h-7 flex items-center justify-center text-[10px] font-semibold text-text-muted uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`e-${idx}`} className="h-8" />;

          const m = String(month + 1).padStart(2, '0');
          const d = String(day).padStart(2, '0');
          const dateStr = `${year}-${m}-${d}`;

          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const isStart = dateStr === rangeStart;
          const isEnd = dateStr === rangeEnd;
          const inRange = rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd;
          const isSingle = isStart && isEnd;
          const hasRange = rangeStart && rangeEnd && rangeStart !== rangeEnd;

          return (
            <div
              key={day}
              className={cn(
                'relative h-8 flex items-center justify-center',
                // Range background band
                inRange && 'bg-blue-50 dark:bg-blue-950/30',
                isStart && hasRange && !isSingle && 'bg-gradient-to-r from-transparent via-blue-50 to-blue-50 dark:from-transparent dark:via-blue-950/30 dark:to-blue-950/30',
                isEnd && hasRange && !isSingle && 'bg-gradient-to-l from-transparent via-blue-50 to-blue-50 dark:from-transparent dark:via-blue-950/30 dark:to-blue-950/30',
              )}
            >
              <button
                disabled={isFuture}
                onClick={() => !isFuture && onDateClick(dateStr)}
                onMouseEnter={() => !isFuture && onDateHover(dateStr)}
                onMouseLeave={() => onDateHover(null)}
                className={cn(
                  'relative z-10 h-7 w-7 rounded-full text-[13px] font-medium transition-all duration-150',
                  isFuture && 'text-text-dimmed/40 cursor-not-allowed',
                  // Default
                  !isFuture && !isStart && !isEnd && !inRange && 'text-text-primary hover:bg-surface-hover',
                  // In range
                  inRange && !isStart && !isEnd && 'text-blue-700 dark:text-blue-300',
                  // Endpoints
                  (isStart || isEnd) && 'bg-blue-500 text-white font-semibold shadow-sm shadow-blue-500/30',
                  // Today ring
                  isToday && !isStart && !isEnd && 'ring-1 ring-blue-400/50 font-semibold text-blue-600 dark:text-blue-400',
                )}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function DateRangePicker({ dateRange, onRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const tz = STORE_REPORTING_TIMEZONE;
  const ref = useRef<HTMLDivElement>(null);

  // Calendar navigation — always derive from dateRange when not open
  const [viewMonth, setViewMonth] = useState(() => {
    const startStr = formatDateInTimezone(dateRange.start, tz);
    const [y, m] = startStr.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  // Custom selection state (only used when user clicks calendar dates)
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);

  // The active preset (highlighted in sidebar)
  const activePreset = dateRange.preset;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const resetSelectionFromCurrentRange = useCallback(() => {
    const { start: startStr, end: endStr } = getSelectionLabels(dateRange, tz);
    setSelStart(startStr);
    setSelEnd(endStr);
    setIsSelectingEnd(false);
    setHoverDate(null);
    const [ey, em] = endStr.split('-').map(Number);
    setViewMonth({ year: ey, month: em - 1 });
  }, [dateRange, tz]);

  const handleTriggerClick = useCallback(() => {
    if (!open) resetSelectionFromCurrentRange();
    setOpen((p) => !p);
  }, [open, resetSelectionFromCurrentRange]);

  // ── Preset click → immediate apply ──
  const handlePresetClick = useCallback((preset: DateRangePreset) => {
    const range = getDateRange(preset);
    onRangeChange({
      start: range.start,
      end: range.end,
      preset,
    });
    setOpen(false);
  }, [onRangeChange]);

  // ── Calendar date click ──
  const handleDateClick = useCallback((dateStr: string) => {
    if (!isSelectingEnd || !selStart) {
      // First click — set start
      setSelStart(dateStr);
      setSelEnd(null);
      setIsSelectingEnd(true);
    } else {
      // Second click — set end (swap if before start)
      if (dateStr < selStart) {
        setSelStart(dateStr);
        setSelEnd(selStart);
      } else {
        setSelEnd(dateStr);
      }
      setIsSelectingEnd(false);
    }
  }, [isSelectingEnd, selStart]);

  // ── Apply custom range ──
  const handleApply = useCallback(() => {
    if (!selStart) return;
    const endStr = selEnd || selStart;
    const rangeStart = selStart <= endStr ? selStart : endStr;
    const rangeEnd = selStart <= endStr ? endStr : selStart;
    const currentStoreDay = todayStoreDayInTimezone(tz);
    onRangeChange({
      start: startOfStoreDayInTz(rangeStart, tz),
      end: rangeEnd >= currentStoreDay ? new Date() : endOfStoreDayInTz(rangeEnd, tz),
      preset: 'custom',
    });
    setOpen(false);
  }, [selStart, selEnd, tz, onRangeChange]);

  // ── Month navigation (clamp: don't go past current month) ──
  const navigateMonth = useCallback((delta: number) => {
    setViewMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      else if (m > 11) { m = 0; y++; }
      // Don't allow navigating past current month
      const nowStr = formatDateInTimezone(new Date(), tz);
      const [ny, nm] = nowStr.split('-').map(Number);
      if (y > ny || (y === ny && m > nm - 1)) {
        return prev; // block forward navigation past current month
      }
      return { year: y, month: m };
    });
  }, [tz]);

  // ── Footer date display ──
  const footerLabel = useMemo(() => {
    if (!selStart) return '';
    const s = fromZonedTime(`${selStart}T12:00:00`, tz);
    if (!selEnd || selStart === selEnd) return formatCompact(s, tz);
    const e = fromZonedTime(`${selEnd}T12:00:00`, tz);
    return `${formatCompact(s, tz)}  →  ${formatCompact(e, tz)}`;
  }, [selStart, selEnd, tz]);

  const hasCustomSelection = selStart && (isSelectingEnd || (selEnd && selEnd !== selStart));

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      {/* ── Trigger Button ── */}
      <button
        onClick={handleTriggerClick}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-200',
          open
            ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-sm shadow-blue-500/10 dark:bg-blue-950/30 dark:text-blue-400'
            : 'border-border bg-surface-elevated text-text-primary hover:bg-surface-hover hover:border-text-muted/30',
        )}
      >
        <Calendar className="h-4 w-4 opacity-60" />
        <span className="tracking-tight">{formatTriggerLabel(dateRange.start, dateRange.end, dateRange.preset, tz)}</span>
        <ChevronRight className={cn('h-3.5 w-3.5 opacity-40 transition-transform duration-200', open && 'rotate-90')} />
      </button>

      {/* ── Dropdown Panel ── */}
      {open && (
        <div
          className={cn(
            'absolute right-0 top-full z-[100] mt-2',
            'w-auto rounded-2xl border border-border bg-surface-elevated',
            'shadow-2xl shadow-black/12 dark:shadow-black/40',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          <div className="flex">
            {/* ── Left: Presets ── */}
            <div className="w-[160px] border-r border-border py-2 flex flex-col">
              <div className="px-3 py-1.5 mb-1">
                <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Date Range</span>
              </div>

              <div className="flex-1 overflow-y-auto px-1.5 space-y-0.5">
                {presets.map((p) => {
                  const isActive = activePreset === p.value && !hasCustomSelection;
                  return (
                    <button
                      key={p.value}
                      onClick={() => handlePresetClick(p.value)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 text-left group',
                        isActive
                          ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400'
                          : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                      )}
                    >
                      <div className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full border-[1.5px] transition-colors shrink-0',
                        isActive
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-text-muted/40 group-hover:border-text-muted/60',
                      )}>
                        {isActive && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                      </div>
                      {p.label}
                    </button>
                  );
                })}
              </div>

              {/* Custom range indicator */}
              {activePreset === 'custom' && !hasCustomSelection && (
                <div className="px-3 pt-2 mt-auto border-t border-border">
                  <span className="text-[10px] text-blue-500 font-semibold">Custom range active</span>
                </div>
              )}
            </div>

            {/* ── Right: Calendar ── */}
            <div className="p-4 w-[296px]">
              {/* Month header + nav */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-text-secondary" />
                </button>
                <span className="text-sm font-bold text-text-primary tracking-tight">
                  {MONTH_NAMES[viewMonth.month]} {viewMonth.year}
                </span>
                <button
                  onClick={() => navigateMonth(1)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <ChevronRight className="h-4 w-4 text-text-secondary" />
                </button>
              </div>

              {/* Calendar grid */}
              <CalendarGrid
                year={viewMonth.year}
                month={viewMonth.month}
                timezone={tz}
                selectedStart={selStart}
                selectedEnd={isSelectingEnd ? null : selEnd}
                hoverDate={isSelectingEnd ? hoverDate : null}
                onDateClick={handleDateClick}
                onDateHover={setHoverDate}
              />

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-[12px] font-semibold text-text-primary truncate tabular-nums">
                    {footerLabel || 'Select dates'}
                  </p>
                  {isSelectingEnd && (
                    <p className="text-[10px] text-blue-500 font-medium mt-0.5">Click end date</p>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg border border-border hover:bg-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={!selStart || isSelectingEnd}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-150',
                      selStart && !isSelectingEnd
                        ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-500/25'
                        : 'bg-surface-hover text-text-dimmed cursor-not-allowed',
                    )}
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
