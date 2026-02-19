import {
  subDays,
} from 'date-fns';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import { getStoreTimezone, formatInTimezone, getDaysInRangeTimezone, getDateRangeInTimezone } from '@/lib/timezone';

export function getDateRange(preset: DateRangePreset): DateRange {
  const tz = getStoreTimezone();
  const result = getDateRangeInTimezone(preset, tz);
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
  const tz = getStoreTimezone();
  return `${formatInTimezone(range.start, 'MMM d, yyyy', tz)} - ${formatInTimezone(range.end, 'MMM d, yyyy', tz)}`;
}

export function formatShortDate(date: Date): string {
  const tz = getStoreTimezone();
  return formatInTimezone(date, 'MMM d', tz);
}

export function getDaysInRange(range: DateRange): Date[] {
  return getDaysInRangeTimezone(range.start, range.end);
}
