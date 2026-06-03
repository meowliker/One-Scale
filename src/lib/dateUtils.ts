import {
  subDays,
} from 'date-fns';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import {
  STORE_REPORTING_TIMEZONE,
  formatInTimezone,
  getDaysInRangeTimezone,
  getDateRangeInTimezone,
} from '@/lib/timezone';

export function getDateRange(preset: DateRangePreset): DateRange {
  const result = getDateRangeInTimezone(preset, STORE_REPORTING_TIMEZONE);
  return { start: result.start, end: result.end, preset };
}

export function getPreviousPeriod(range: DateRange): DateRange {
  const daysDiff = Math.ceil(
    (range.end.getTime() - range.start.getTime()) / (1000 * 60 * 60 * 24)
  );
  return {
    start: subDays(range.start, daysDiff),
    end: subDays(range.end, daysDiff),
  };
}

export function formatDateRange(range: DateRange): string {
  return `${formatInTimezone(range.start, 'MMM d, yyyy', STORE_REPORTING_TIMEZONE)} - ${formatInTimezone(range.end, 'MMM d, yyyy', STORE_REPORTING_TIMEZONE)}`;
}

export function formatShortDate(date: Date): string {
  return formatInTimezone(date, 'MMM d', STORE_REPORTING_TIMEZONE);
}

export function getDaysInRange(range: DateRange): Date[] {
  return getDaysInRangeTimezone(range.start, range.end, STORE_REPORTING_TIMEZONE);
}
