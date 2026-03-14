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
  { label: 'Last 3 Days', value: 'last3' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: '7 Days + Today', value: 'last7today' },
  { label: 'Last 14 Days', value: 'last14' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
];

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handlePresetClick = (preset: DateRangePreset) => {
    const range = getDateRange(preset);
    onRangeChange(range);
    setShowCustom(false);
    setOpen(false);
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
      <button
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors',
          open
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
        )}
      >
        <Calendar className="h-3.5 w-3.5" />
        {formatTriggerLabel(dateRange.start, dateRange.end, dateRange.preset)}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 rounded-xl border border-border bg-surface-elevated shadow-xl overflow-hidden">
          <div className="flex">
            {/* Left column: Presets */}
            <div className="w-40 border-r border-border py-2">
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
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
