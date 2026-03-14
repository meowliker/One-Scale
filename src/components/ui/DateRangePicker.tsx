'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateRange } from '@/lib/dateUtils';
import { formatInTimezone, formatDateInTimezone, nowInTimezone, getStoreTimezone } from '@/lib/timezone';
import { fromZonedTime } from 'date-fns-tz';
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
  { label: 'Last 28 days', value: 'last3' },
  { label: 'Last 30 days', value: 'last30' },
  { label: 'This week', value: 'last7today' },
  { label: 'Last week', value: 'lastMonth' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'Last month', value: 'lastMonth' },
];


/** Map preset values to their display labels */
const presetLabels: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last3: 'Last 3 Days',
  last7: 'Last 7 Days',
  last7today: '7D + Today',
  last14: 'Last 14 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

const quickPresets: { label: string; shortLabel: string; value: DateRangePreset }[] = [
  { label: 'Last 3 Days', shortLabel: '3D', value: 'last3' },
  { label: '7 Days + Today', shortLabel: '7D+T', value: 'last7today' },
  { label: 'Last 14 Days', shortLabel: '14D', value: 'last14' },
];

function formatTriggerLabel(start: Date, end: Date, preset?: DateRangePreset): string {
  if (preset && preset !== 'custom' && presetLabels[preset]) return presetLabels[preset];
  const startStr = formatDateInTimezone(start);
  const endStr = formatDateInTimezone(end);
  if (startStr === endStr) return formatInTimezone(start, 'MMM d, yyyy');
  if (preset && preset !== 'custom' && presetLabels[preset]) {
    return presetLabels[preset];
  }
  const startStr = formatDateInTimezone(start);
  const endStr = formatDateInTimezone(end);
  if (startStr === endStr) {
    return formatInTimezone(start, 'MMM d, yyyy');
  }
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear === endYear) return `${formatInTimezone(start, 'MMM d')} – ${formatInTimezone(end, 'MMM d, yyyy')}`;
  return `${formatInTimezone(start, 'MMM d, yyyy')} – ${formatInTimezone(end, 'MMM d, yyyy')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MiniCalendar({
  selectedStart,
  selectedEnd,
  onSelect,
}: {
  selectedStart: string;
  selectedEnd: string;
  onSelect: (dateStr: string) => void;
}) {
  const today = new Date();
  const todayStr = toYMD(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const days = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, dateStr });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const isInRange = (dateStr: string) => {
    if (!selectedStart || !selectedEnd) return false;
    return dateStr >= selectedStart && dateStr <= selectedEnd;
  };

  return (
    <div className="w-[260px]">
      {/* Month/Year header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <button onClick={goPrev} className="p-1 rounded hover:bg-surface-hover text-text-secondary transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={goNext} className="p-1 rounded hover:bg-surface-hover text-text-secondary transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[10px] font-semibold text-text-secondary/50 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((cell, i) => {
          if (!cell) return <div key={`empty-${i}`} />;
          const { day, dateStr } = cell;
          const isFuture = dateStr > todayStr;
          const isStart = dateStr === selectedStart;
          const isEnd = dateStr === selectedEnd;
          const isSelected = isStart || isEnd;
          const inRange = isInRange(dateStr) && !isSelected;
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              disabled={isFuture}
              onClick={() => onSelect(dateStr)}
              className={cn(
                'h-8 text-xs font-medium rounded-md transition-all relative',
                isFuture && 'text-text-secondary/20 cursor-not-allowed',
                !isFuture && !isSelected && !inRange && 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                isSelected && 'bg-primary text-white font-bold',
                inRange && 'bg-primary/10 text-primary',
                isToday && !isSelected && !inRange && 'ring-1 ring-primary/30',
/** Format date for display in the picker footer - use local date parts directly */
function formatFooterDate(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()].slice(0, 3);
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/** Get days in a month */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Get day of week for first day of month (0 = Sunday) */
function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Check if two dates are the same day */
function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

/** Check if date is between start and end (inclusive) */
function isInRange(date: Date, start: Date | null, end: Date | null): boolean {
  if (!start || !end) return false;
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

/** Check if date is today */
function isToday(date: Date): boolean {
  const today = nowInTimezone();
  return isSameDay(date, today);
}

/** Check if date is in the future */
function isFuture(date: Date): boolean {
  const today = nowInTimezone();
  today.setHours(23, 59, 59, 999);
  return date.getTime() > today.getTime();
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthProps {
  year: number;
  month: number;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  hoverDate: Date | null;
  onDateClick: (date: Date) => void;
  onDateHover: (date: Date | null) => void;
  onMonthChange: (delta: number) => void;
  showNavigation: 'left' | 'right' | 'none';
}

function CalendarMonth({
  year,
  month,
  selectedStart,
  selectedEnd,
  hoverDate,
  onDateClick,
  onDateHover,
  onMonthChange,
  showNavigation,
}: CalendarMonthProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days: (number | null)[] = [];

  // Add empty cells for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  // Add days of the month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  // Determine the effective range for highlighting
  const effectiveStart = selectedStart;
  const effectiveEnd = selectedEnd || hoverDate;

  // Ensure start <= end for range highlighting
  let rangeStart = effectiveStart;
  let rangeEnd = effectiveEnd;
  if (rangeStart && rangeEnd && rangeStart.getTime() > rangeEnd.getTime()) {
    [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
  }

  return (
    <div className="w-[280px]">
      {/* Month header with navigation */}
      <div className="flex items-center justify-between px-2 mb-3">
        {showNavigation === 'left' ? (
          <button
            onClick={() => onMonthChange(-1)}
            className="p-1 rounded hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-text-secondary" />
          </button>
        ) : (
          <div className="w-6" />
        )}
        <span className="text-sm font-semibold text-text-primary">
          {MONTH_NAMES[month]} {year}
        </span>
        {showNavigation === 'right' ? (
          <button
            onClick={() => onMonthChange(1)}
            className="p-1 rounded hover:bg-surface-hover transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-text-secondary" />
          </button>
        ) : (
          <div className="w-6" />
        )}
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((day) => (
          <div key={day} className="text-center text-[11px] font-medium text-text-muted py-1">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="h-8" />;
          }

          const date = new Date(year, month, day);
          const isStart = selectedStart && isSameDay(date, selectedStart);
          const isEnd = selectedEnd && isSameDay(date, selectedEnd);
          const inRange = isInRange(date, rangeStart, rangeEnd);
          const isCurrentDay = isToday(date);
          const disabled = isFuture(date);
          const isSingleDay = isStart && isEnd;
          const hasRange = rangeStart && rangeEnd && !isSameDay(rangeStart, rangeEnd);

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
                // Range background - continuous rectangle
                inRange && !isStart && !isEnd && 'bg-blue-100 dark:bg-blue-950/40',
                // Start date - rounded left only when there's a range
                isStart && hasRange && !isSingleDay && 'bg-blue-500 text-white rounded-l-full z-10',
                // End date - rounded right only when there's a range
                isEnd && hasRange && !isSingleDay && 'bg-blue-500 text-white rounded-r-full z-10',
                // Single day selection - fully rounded
                isSingleDay && 'bg-blue-500 text-white rounded-full z-10',
                // Start without end yet selected - fully rounded
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
  const [showCustom, setShowCustom] = useState(dateRange.preset === 'custom');
  const [pickingStart, setPickingStart] = useState(true);
  const [customStart, setCustomStart] = useState(formatDateInTimezone(dateRange.start));
  const [customEnd, setCustomEnd] = useState(formatDateInTimezone(dateRange.end));
  const [selectedPreset, setSelectedPreset] = useState<DateRangePreset | null>(dateRange.preset || null);
  
  // Calendar state
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = dateRange.start;
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  
  // Selection state for click-to-select
  const [selectionStart, setSelectionStart] = useState<Date | null>(dateRange.start);
  const [selectionEnd, setSelectionEnd] = useState<Date | null>(dateRange.end);
  const [hoverDate, setHoverDate] = useState<Date | null>(null);
  const [isSelectingEnd, setIsSelectingEnd] = useState(false);
  
  const ref = useRef<HTMLDivElement>(null);

  // Right month is always one month after left
  const rightMonth = useMemo(() => {
    let m = leftMonth.month + 1;
    let y = leftMonth.year;
    if (m > 11) {
      m = 0;
      y++;
    }
    return { year: y, month: m };
  }, [leftMonth]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Reset selection state when opening
  useEffect(() => {
    if (open) {
      setSelectionStart(dateRange.start);
      setSelectionEnd(dateRange.end);
      setIsSelectingEnd(false);
      setSelectedPreset(dateRange.preset || null);
      // Set left month to show the start date
      setLeftMonth({
        year: dateRange.start.getFullYear(),
        month: dateRange.start.getMonth(),
      });
    }
  }, [open, dateRange]);

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = getDateRange(preset);
    setSelectionStart(range.start);
    setSelectionEnd(range.end);
    setSelectedPreset(preset);
    setIsSelectingEnd(false);
    // Update left month to show the range
    setLeftMonth({
      year: range.start.getFullYear(),
      month: range.start.getMonth(),
    });
  };

  const handleDateClick = (date: Date) => {
    if (!isSelectingEnd) {
      // First click - set start date
      setSelectionStart(date);
      setSelectionEnd(null);
      setIsSelectingEnd(true);
      setSelectedPreset(null);
    } else {
      // Second click - set end date
      if (selectionStart && date.getTime() < selectionStart.getTime()) {
        // If clicked date is before start, make it the new start
        setSelectionStart(date);
        setSelectionEnd(null);
        // Stay in selecting end mode
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
      if (m < 0) {
        m = 11;
        y--;
      } else if (m > 11) {
        m = 0;
        y++;
      }
      return { year: y, month: m };
    });
  };

  const buildRange = (startDateStr: string, endDateStr: string) => {
    const tz = getStoreTimezone();
    return {
      start: fromZonedTime(`${startDateStr}T00:00:00`, tz),
      end: fromZonedTime(`${endDateStr}T23:59:59`, tz),
    };
  };

  const handleCalendarSelect = (dateStr: string) => {
    if (pickingStart) {
      setCustomStart(dateStr);
      setCustomEnd(dateStr);
      setPickingStart(false);
    } else {
      // Ensure start <= end
      if (dateStr < customStart) {
        setCustomStart(dateStr);
        setCustomEnd(customStart);
      } else {
        setCustomEnd(dateStr);
      }
      setPickingStart(true);
      // Auto-apply
      const start = dateStr < customStart ? dateStr : customStart;
      const end = dateStr < customStart ? customStart : dateStr;
      const range = buildRange(start, end);
      if (!isNaN(range.start.getTime()) && !isNaN(range.end.getTime())) {
        onRangeChange({ ...range, preset: 'custom' });
      }
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={ref}>
      {/* Quick-select pills */}
      {quickPresets.map((qp) => {
        const isActive = dateRange.preset === qp.value;
        return (
          <button
            key={qp.value}
            onClick={() => handlePresetClick(qp.value)}
            title={qp.label}
            className={cn(
              'inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-150 border',
              isActive
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-surface border-border text-text-secondary hover:border-primary/40 hover:text-primary hover:bg-primary/5'
            )}
          >
            {qp.shortLabel}
          </button>
        );
      })}

      <span className="h-4 w-px bg-border" />

      {/* Calendar trigger */}
  const handleCancel = () => {
    setOpen(false);
  };

  const handleUpdate = () => {
    if (selectionStart) {
      const tz = getStoreTimezone();
      // Use local date parts directly to avoid timezone offset issues
      const startYear = selectionStart.getFullYear();
      const startMonth = String(selectionStart.getMonth() + 1).padStart(2, '0');
      const startDay = String(selectionStart.getDate()).padStart(2, '0');
      const startStr = `${startYear}-${startMonth}-${startDay}`;
      
      const endDate = selectionEnd || selectionStart;
      const endYear = endDate.getFullYear();
      const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDate.getDate()).padStart(2, '0');
      const endStr = `${endYear}-${endMonth}-${endDay}`;
      
      const start = fromZonedTime(`${startStr}T00:00:00`, tz);
      const end = fromZonedTime(`${endStr}T23:59:59`, tz);
      onRangeChange({ start, end, preset: selectedPreset || 'custom' });
    }
    setOpen(false);
  };

  // Format the footer date range display
  const footerDateRange = useMemo(() => {
    if (!selectionStart) return '';
    const startStr = formatFooterDate(selectionStart);
    if (!selectionEnd || isSameDay(selectionStart, selectionEnd)) {
      return startStr;
    }
    return `${startStr} - ${formatFooterDate(selectionEnd)}`;
  }, [selectionStart, selectionEnd]);

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      {/* Calendar trigger - single button showing date range */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
          open
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
            ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
            : 'border-border bg-surface-elevated text-text-primary hover:bg-surface-hover'
        )}
      >
        <Calendar className="h-4 w-4" />
        <span>{formatTriggerLabel(dateRange.start, dateRange.end, dateRange.preset)}</span>
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 rounded-xl border border-border bg-surface-elevated shadow-xl overflow-hidden">
          <div className="flex">
            {/* Left column: Presets */}
            <div className="w-40 border-r border-border py-2">
      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 rounded-xl border border-border bg-surface-elevated shadow-xl">
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
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2 flex items-center justify-center',
                      selectedPreset === preset.value
                        ? 'border-blue-500'
                        : 'border-text-muted'
                    )}
                  >
                    {selectedPreset === preset.value && (
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                    )}
                  </div>
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => { setShowCustom(true); setPickingStart(true); }}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors text-left',
                  showCustom
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface-hover'
                )}
              >
                Custom
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Right column: Calendar */}
            {showCustom && (
              <div className="p-4">
                {/* Selection indicator */}
                <div className="flex items-center gap-2 mb-3 text-xs">
                  <button
                    onClick={() => setPickingStart(true)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-center transition-colors',
                      pickingStart ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-border text-text-secondary'
                    )}
                  >
                    {customStart ? formatInTimezone(new Date(customStart + 'T12:00:00'), 'MMM d') : 'Start'}
            </div>

            {/* Right column: Dual calendars */}
            <div className="p-4">
              <div className="flex gap-6">
                <CalendarMonth
                  year={leftMonth.year}
                  month={leftMonth.month}
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
                  <span className="text-text-secondary/30">–</span>
                  <button
                    onClick={() => setPickingStart(false)}
                    className={cn(
                      'flex-1 rounded-md border px-2 py-1.5 text-center transition-colors',
                      !pickingStart ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-border text-text-secondary'
                    )}
                  >
                    {customEnd ? formatInTimezone(new Date(customEnd + 'T12:00:00'), 'MMM d') : 'End'}
                  </button>
                </div>

                <MiniCalendar
                  selectedStart={customStart}
                  selectedEnd={customEnd}
                  onSelect={handleCalendarSelect}
                />
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
