'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateRange } from '@/lib/dateUtils';
import { formatInTimezone, formatDateInTimezone, getStoreTimezone } from '@/lib/timezone';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { DateRangePreset } from '@/types/analytics';

export interface DateRangePickerProps {
  dateRange: { start: Date; end: Date; preset?: DateRangePreset };
  onRangeChange: (range: { start: Date; end: Date; preset?: DateRangePreset }) => void;
}

const presets: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last7' },
  { label: 'Last 14 days', value: 'last14' },
  { label: 'Last 28 days', value: 'last28' },
  { label: 'Last 30 days', value: 'last30' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'Last month', value: 'lastMonth' },
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

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTriggerLabel(start: Date, end: Date, preset?: DateRangePreset, tz?: string): string {
  if (preset && preset !== 'custom' && presetLabels[preset]) return presetLabels[preset];
  const timezone = tz || getStoreTimezone();
  const startStr = formatDateInTimezone(start, timezone);
  const endStr = formatDateInTimezone(end, timezone);
  if (startStr === endStr) return formatInTimezone(start, 'MMM d, yyyy', timezone);
  const startYear = toZonedTime(start, timezone).getFullYear();
  const endYear = toZonedTime(end, timezone).getFullYear();
  if (startYear === endYear) return `${formatInTimezone(start, 'MMM d', timezone)} – ${formatInTimezone(end, 'MMM d, yyyy', timezone)}`;
  return `${formatInTimezone(start, 'MMM d, yyyy', timezone)} – ${formatInTimezone(end, 'MMM d, yyyy', timezone)}`;
}

/**
 * Format a Date for footer display using the store timezone (NOT the browser/local TZ).
 */
function formatFooterDate(date: Date, tz: string): string {
  const zoned = toZonedTime(date, tz);
  const day = zoned.getDate();
  const month = MONTH_NAMES[zoned.getMonth()].slice(0, 3);
  const year = zoned.getFullYear();
  return `${day} ${month} ${year}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/**
 * Compare two dates as calendar days in the store timezone.
 * Uses formatDateInTimezone so the comparison is always TZ-aware.
 */
function isSameDay(d1: Date, d2: Date, tz: string): boolean {
  return formatDateInTimezone(d1, tz) === formatDateInTimezone(d2, tz);
}

/**
 * Check if a date string (YYYY-MM-DD) falls within a range of date strings.
 * All comparisons are lexicographic on YYYY-MM-DD strings — no TZ ambiguity.
 */
function isDateInRange(dateStr: string, startStr: string | null, endStr: string | null): boolean {
  if (!startStr || !endStr) return false;
  return dateStr >= startStr && dateStr <= endStr;
}

/**
 * Check if a date string (YYYY-MM-DD) is today in the store timezone.
 */
function isDateToday(dateStr: string, todayStr: string): boolean {
  return dateStr === todayStr;
}

/**
 * Check if a date string (YYYY-MM-DD) is in the future relative to today in the store timezone.
 */
function isDateFuture(dateStr: string, todayStr: string): boolean {
  return dateStr > todayStr;
}

interface CalendarMonthProps {
  year: number;
  month: number;
  timezone: string;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  hoverDate: Date | null;
  onDateClick: (date: Date) => void;
  onDateHover: (date: Date | null) => void;
  onMonthChange: (delta: number) => void;
  showNavigation: 'left' | 'right' | 'none';
}

function CalendarMonth({
  year, month, timezone, selectedStart, selectedEnd, hoverDate,
  onDateClick, onDateHover, onMonthChange, showNavigation,
}: CalendarMonthProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days: (number | null)[] = [];

  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  // Pre-compute all date strings in store timezone for fast comparison
  const todayStr = formatDateInTimezone(new Date(), timezone);
  const selectedStartStr = selectedStart ? formatDateInTimezone(selectedStart, timezone) : null;
  const selectedEndStr = selectedEnd ? formatDateInTimezone(selectedEnd, timezone) : null;
  const hoverDateStr = hoverDate ? formatDateInTimezone(hoverDate, timezone) : null;

  const effectiveEndStr = selectedEndStr || hoverDateStr;

  let rangeStartStr = selectedStartStr;
  let rangeEndStr = effectiveEndStr;
  if (rangeStartStr && rangeEndStr && rangeStartStr > rangeEndStr) {
    [rangeStartStr, rangeEndStr] = [rangeEndStr, rangeStartStr];
  }

  return (
    <div className="w-[280px]">
      <div className="flex items-center justify-between px-2 mb-3">
        {showNavigation === 'left' ? (
          <button onClick={() => onMonthChange(-1)} className="p-1 rounded hover:bg-surface-hover transition-colors">
            <ChevronLeft className="h-4 w-4 text-text-secondary" />
          </button>
        ) : <div className="w-6" />}
        <span className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[month]} {year}
        </span>
        {showNavigation === 'right' ? (
          <button onClick={() => onMonthChange(1)} className="p-1 rounded hover:bg-surface-hover transition-colors">
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </button>
        ) : <div className="w-6" />}
      </div>

      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((day) => (
          <div key={day} className="text-center text-[11px] font-medium text-text-muted py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          if (day === null) return <div key={`empty-${idx}`} className="h-8" />;

          // Build a YYYY-MM-DD date string for this calendar cell
          const m = String(month + 1).padStart(2, '0');
          const d = String(day).padStart(2, '0');
          const dateStr = `${year}-${m}-${d}`;

          // Create a Date anchored to NOON in the store timezone so it is always
          // within this calendar day regardless of DST or UTC offset.
          const date = fromZonedTime(`${dateStr}T12:00:00`, timezone);

          const isStart = selectedStartStr === dateStr;
          const isEnd = selectedEndStr === dateStr;
          const inRange = isDateInRange(dateStr, rangeStartStr, rangeEndStr);
          const isCurrentDay = isDateToday(dateStr, todayStr);
          const disabled = isDateFuture(dateStr, todayStr);
          const isSingleDay = isStart && isEnd;
          const hasRange = rangeStartStr && rangeEndStr && rangeStartStr !== rangeEndStr;

          return (
            <button
              key={day}
              disabled={disabled}
              onClick={() => !disabled && onDateClick(date)}
              onMouseEnter={() => !disabled && onDateHover(date)}
              onMouseLeave={() => onDateHover(null)}
              className={cn(
                'h-8 w-full text-sm font-medium transition-colors relative',
                disabled && 'text-text-dimmed cursor-not-allowed',
                !disabled && !isStart && !isEnd && !inRange && 'hover:bg-surface-hover text-text-primary',
                inRange && !isStart && !isEnd && 'bg-blue-100 dark:bg-blue-950/40',
                isStart && hasRange && !isSingleDay && 'bg-blue-500 text-white rounded-l-full z-10',
                isEnd && hasRange && !isSingleDay && 'bg-blue-500 text-white rounded-r-full z-10',
                isSingleDay && 'bg-blue-500 text-white rounded-full z-10',
                isStart && !selectedEnd && !isSingleDay && 'bg-blue-500 text-white rounded-full z-10',
                isCurrentDay && !isStart && !isEnd && 'font-bold text-blue-500',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({ dateRange, onRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset | null>(dateRange.preset || null);

  // Always derive timezone from the active ad account, never the browser's local TZ
  const tz = getStoreTimezone();

  const [leftMonth, setLeftMonth] = useState(() => {
    // Use the store timezone to determine which month/year the start date falls in
    const zoned = toZonedTime(dateRange.start, getStoreTimezone());
    return { year: zoned.getFullYear(), month: zoned.getMonth() };
  });

  const [selectionStart, setSelectionStart] = useState<Date | null>(dateRange.start);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(dateRange.end);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  const rightMonth = useMemo(() => {
    let m = leftMonth.month + 1;
    let y = leftMonth.year;
    if (m > 11) { m = 0; y++; }
    return { year: y, month: m };
  }, [leftMonth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSelectionStart(dateRange.start);
      setSelectionEnd(dateRange.end);
      setIsSelectingEnd(false);
      setSelectedPreset(dateRange.preset || null);
      // Determine month/year using store timezone
      const zoned = toZonedTime(dateRange.start, tz);
      setLeftMonth({
        year: zoned.getFullYear(),
        month: zoned.getMonth(),
      });
    }
  }, [open, dateRange, tz]);

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = getDateRange(preset);
    // Apply preset immediately — no need to click "Update"
    const startStr = formatDateInTimezone(range.start, tz);
    const endStr = formatDateInTimezone(range.end, tz);
    const start = fromZonedTime(`${startStr}T00:00:00`, tz);
    const end = fromZonedTime(`${endStr}T23:59:59`, tz);
    onRangeChange({ start, end, preset });
    setOpen(false);
  };

  const handleDateClick = (date: Date) => {
    if (!isSelectingEnd) {
      setSelectionStart(date);
      setSelectionEnd(null);
      setIsSelectingEnd(true);
      setSelectedPreset(null);
    } else {
      if (selectionStart && date.getTime() < selectionStart.getTime()) {
        setSelectionStart(date);
        setSelectionEnd(null);
      } else {
        setSelectionEnd(date);
        setIsSelectingEnd(false);
        setSelectedPreset(null);
      }
    }
  };

  const handleMonthChange = (delta: number) => {
    setLeftMonth((prev) => {
      let m = prev.month + delta;
      let y = prev.year;
      if (m < 0) { m = 11; y--; }
      else if (m > 11) { m = 0; y++; }
      return { year: y, month: m };
    });
  };

  const handleCancel = () => setOpen(false);

  const handleUpdate = () => {
    if (selectionStart) {
      // Extract YYYY-MM-DD in the store timezone — never use .getFullYear()/.getMonth()/.getDate()
      // which would read the local/UTC components instead of the store-tz components.
      const startStr = formatDateInTimezone(selectionStart, tz);
      const endDate = selectionEnd || selectionStart;
      const endStr = formatDateInTimezone(endDate, tz);

      // Re-construct proper start-of-day / end-of-day Date objects in store timezone
      const start = fromZonedTime(`${startStr}T00:00:00`, tz);
      const end = fromZonedTime(`${endStr}T23:59:59`, tz);
      onRangeChange({ start, end, preset: selectedPreset || 'custom' });
    }
    setOpen(false);
  };

  const footerDateRange = useMemo(() => {
    if (!selectionStart) return '';
    const startStr = formatFooterDate(selectionStart, tz);
    if (!selectionEnd || isSameDay(selectionStart, selectionEnd, tz)) return startStr;
    return `${startStr} - ${formatFooterDate(selectionEnd, tz)}`;
  }, [selectionStart, selectionEnd, tz]);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
          open
            ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
            : 'border-border bg-surface-elevated text-text-primary hover:bg-surface-hover'
        )}
      >
        <Calendar className="h-4 w-4" />
        <span>{formatTriggerLabel(dateRange.start, dateRange.end, dateRange.preset, tz)}</span>
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 rounded-xl border border-border bg-surface-elevated shadow-xl overflow-hidden">
          <div className="flex">
            {/* Left column: Presets */}
            <div className="w-44 border-r border-border py-3 max-h-[420px] overflow-y-auto">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-sm transition-colors text-left',
                    selectedPreset === preset.value
                      ? 'text-blue-500 font-medium'
                      : 'text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                    selectedPreset === preset.value ? 'border-blue-500' : 'border-text-muted'
                  )}>
                    {selectedPreset === preset.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Right column: Dual calendars */}
            <div className="p-4">
              <div className="flex gap-6">
                <CalendarMonth
                  year={leftMonth.year}
                  month={leftMonth.month}
                  timezone={tz}
                  selectedStart={selectionStart}
                  selectedEnd={selectionEnd}
                  hoverDate={isSelectingEnd ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                  onMonthChange={handleMonthChange}
                  showNavigation="left"
                />
                <CalendarMonth
                  year={rightMonth.year}
                  month={rightMonth.month}
                  timezone={tz}
                  selectedStart={selectionStart}
                  selectedEnd={selectionEnd}
                  hoverDate={isSelectingEnd ? hoverDate : null}
                  onDateClick={handleDateClick}
                  onDateHover={setHoverDate}
                  onMonthChange={handleMonthChange}
                  showNavigation="right"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <div className="text-sm text-text-secondary">
                  <span className="font-medium text-text-primary">{footerDateRange}</span>
                  <br />
                  <span className="text-xs text-text-muted">Dates are shown in store timezone</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-text-secondary border border-border rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={!selectionStart}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Update
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
