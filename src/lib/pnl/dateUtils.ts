/**
 * Server-side timezone-aware date range utilities for P&L queries.
 *
 * All PostgREST date queries should use these functions to produce
 * timezone-offset timestamps, so that "March 1" in America/New_York
 * maps to the correct UTC window.
 */

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/** Offset at the requested instant, including that date's daylight saving rules. */
export function getTzOffset(ianaTimezone: string, at: Date = new Date()): string {
  return formatInTimeZone(at, ianaTimezone, 'xxx');
}

export function getStoreDateRange(
  date: string,
  ianaTimezone: string,
): { start: string; end: string } {
  return getStoreDateRangeForPeriod(date, date, ianaTimezone);
}

/** Convert each boundary independently; a local day can be 23 or 25 hours. */
export function getStoreDateRangeForPeriod(
  startDate: string,
  endDate: string,
  ianaTimezone: string,
): { start: string; end: string } {
  return {
    start: fromZonedTime(`${startDate}T00:00:00.000`, ianaTimezone).toISOString(),
    end: fromZonedTime(`${endDate}T23:59:59.999`, ianaTimezone).toISOString(),
  };
}
