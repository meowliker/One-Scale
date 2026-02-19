'use client';

import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
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
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 14 Days', value: 'last14' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
];

/** Map preset values to their display labels */
const presetLabels: Record<string, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last14: 'Last 14 Days',
  last30: 'Last 30 Days',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
};

function formatTriggerLabel(start: Date, end: Date, preset?: DateRangePreset): string {
  // For named presets, show the preset label instead of the date range
  if (preset && preset !== 'custom' && presetLabels[preset]) {
    return presetLabels[preset];
  }
  // For single-date selection (start == end), show just one date
  const startStr = formatDateInTimezone(start);
  const endStr = formatDateInTimezone(end);
  if (startStr === endStr) {
    return formatInTimezone(start, 'MMM d, yyyy');
  }
  // For custom ranges, show the full date range
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear === endYear) {
    return `${formatInTimezone(start, 'MMM d')} - ${formatInTimezone(end, 'MMM d, yyyy')}`;
  }
  return `${formatInTimezone(start, 'MMM d, yyyy')} - ${formatInTimezone(end, 'MMM d, yyyy')}`;
}

/** Format a Date as YYYY-MM-DD for <input type="date"> using store timezone */
function toDateInputValue(date: Date): string {
  return formatDateInTimezone(date);
}

/** Get "today" in store timezone for the max date constraint */
function todayInputValue(): string {
  return formatDateInTimezone(nowInTimezone());
}

export function DateRangePicker({ dateRange, onRangeChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(dateRange.preset === 'custom');
  const [singleDateMode, setSingleDateMode] = useState(false);
  const [customStart, setCustomStart] = useState(toDateInputValue(dateRange.start));
  const [customEnd, setCustomEnd] = useState(toDateInputValue(dateRange.end));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = getDateRange(preset);
    onRangeChange(range);
    setShowCustom(false);
    setOpen(false);
  };

  /** Build timezone-aware Date objects from YYYY-MM-DD strings in the store timezone */
  const buildRange = (startDateStr: string, endDateStr: string) => {
    const tz = getStoreTimezone();
    const start = fromZonedTime(`${startDateStr}T00:00:00`, tz);
    const end = fromZonedTime(`${endDateStr}T23:59:59`, tz);
    return { start, end };
  };

  const handleCustomApply = () => {
    const endValue = singleDateMode ? customStart : customEnd;
    if (!customStart || !endValue) return;
    const { start, end } = buildRange(customStart, endValue);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      onRangeChange({ start, end, preset: 'custom' });
      setOpen(false);
    }
  };

  // Auto-apply when custom dates change
  useEffect(() => {
    if (showCustom && customStart) {
      const endValue = singleDateMode ? customStart : customEnd;
      if (!endValue) return;
      const { start, end } = buildRange(customStart, endValue);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
        onRangeChange({ start, end, preset: 'custom' });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStart, customEnd, singleDateMode]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-surface-elevated px-3 py-2 text-sm font-medium text-text-secondary shadow-md shadow-black/20 hover:bg-surface-hover transition-colors"
      >
        <Calendar className="h-4 w-4 text-text-muted" />
        {formatTriggerLabel(dateRange.start, dateRange.end, dateRange.preset)}
      </button>
      {open && (
        <div className="absolute left-0 z-[100] mt-1 rounded-lg border border-border bg-surface-elevated shadow-lg">
          <div className="flex">
            {/* Left column: Presets */}
            <div className="w-44 border-r border-border py-2">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetClick(preset.value)}
                  className={cn(
                    'flex w-full px-4 py-2 text-sm transition-colors text-left',
                    dateRange.preset === preset.value && !showCustom
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-text-secondary hover:bg-surface-hover'
                  )}
                >
                  {preset.label}
                </button>
              ))}
              {/* Custom Range toggle */}
              <button
                onClick={() => setShowCustom(true)}
                className={cn(
                  'flex w-full items-center justify-between px-4 py-2 text-sm transition-colors text-left',
                  showCustom
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-text-secondary hover:bg-surface-hover'
                )}
              >
                Custom Range
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Right column: Custom date inputs */}
            {showCustom && (
              <div className="w-56 p-4 space-y-3">
                {/* Single Date / Date Range toggle */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  <button
                    onClick={() => setSingleDateMode(true)}
                    className={cn(
                      'flex-1 px-2 py-1 text-xs font-medium transition-colors',
                      singleDateMode
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                    )}
                  >
                    Single Date
                  </button>
                  <button
                    onClick={() => setSingleDateMode(false)}
                    className={cn(
                      'flex-1 px-2 py-1 text-xs font-medium transition-colors',
                      !singleDateMode
                        ? 'bg-primary text-white'
                        : 'bg-surface-hover text-text-secondary hover:bg-surface-hover/80'
                    )}
                  >
                    Date Range
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">
                    {singleDateMode ? 'Date' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    max={singleDateMode ? todayInputValue() : (customEnd || undefined)}
                    className="w-full rounded-md border border-border bg-surface-hover px-3 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 [color-scheme:dark]"
                  />
                </div>
                {!singleDateMode && (
                  <div>
                    <label className="block text-xs text-text-muted mb-1">End Date</label>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      min={customStart || undefined}
                      max={todayInputValue()}
                      className="w-full rounded-md border border-border bg-surface-hover px-3 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50 [color-scheme:dark]"
                    />
                  </div>
                )}
                <button
                  onClick={handleCustomApply}
                  className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
