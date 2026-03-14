/**
 * Server-side timezone-aware date range utilities for P&L queries.
 *
 * All PostgREST date queries should use these functions to produce
 * timezone-offset timestamps, so that "March 1" in America/New_York
 * maps to the correct UTC window.
 */

/**
 * Compute the UTC offset string (e.g., "-05:00", "+05:30") for an IANA timezone.
 */
export function getTzOffset(ianaTimezone: string): string {
  const now = new Date();
  const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tz = new Date(now.toLocaleString('en-US', { timeZone: ianaTimezone }));
  const diffMinutes = (tz.getTime() - utc.getTime()) / 60000;
  const sign = diffMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(diffMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(Math.round(abs % 60)).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

/**
 * Get start-of-day and end-of-day timestamps for a single date in a timezone.
 *
 * Returns ISO strings with timezone offset (e.g., "2026-03-01T00:00:00-05:00").
 * PostgREST handles these correctly for timestamptz columns.
 */
export function getStoreDateRange(
  date: string,
  ianaTimezone: string,
): { start: string; end: string } {
  const offset = getTzOffset(ianaTimezone);
  return {
    start: `${date}T00:00:00${offset}`,
    end: `${date}T23:59:59${offset}`,
  };
}

/**
 * Get start/end timestamps for a date range in a timezone.
 */
export function getStoreDateRangeForPeriod(
  startDate: string,
  endDate: string,
  ianaTimezone: string,
): { start: string; end: string } {
  const offset = getTzOffset(ianaTimezone);
  return {
    start: `${startDate}T00:00:00${offset}`,
    end: `${endDate}T23:59:59${offset}`,
  };
}
