/**
 * Timezone Utilities
 *
 * All date operations in the app should use the Shopify store's timezone,
 * NOT the browser's local timezone. This ensures data consistency between
 * Shopify orders, Meta Ads insights, and dashboard displays.
 *
 * The store timezone comes from the linked ad account's timezone_name
 * (e.g., "America/New_York", "America/Los_Angeles", "Asia/Kolkata").
 */

import { toZonedTime, fromZonedTime, format as formatTz } from 'date-fns-tz';
import {
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
} from 'date-fns';

// Default timezone fallback when no store is selected
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Get the active store's timezone from the Zustand store.
 * Falls back to DEFAULT_TIMEZONE if no store/ad account is active.
 *
 * IMPORTANT: This should only be called from client-side code.
 * For server-side, pass timezone explicitly.
 */
export function getStoreTimezone(): string {
  try {
    // Dynamic import to avoid SSR issues — the store module is loaded lazily
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useStoreStore } = require('@/stores/storeStore');
    const state = useStoreStore.getState();
    const activeStore = state.stores.find((s: any) => s.id === state.activeStoreId);

    if (activeStore?.adAccounts?.length) {
      // Use the timezone from the first active ad account
      const activeAccount = activeStore.adAccounts.find((a: any) => a.isActive);
      if (activeAccount?.timezone) return activeAccount.timezone;
      // Fallback to first account's timezone
      if (activeStore.adAccounts[0]?.timezone) return activeStore.adAccounts[0].timezone;
    }

    return DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Get the current date/time in the store's timezone.
 * This replaces all `new Date()` calls for date calculations.
 */
export function nowInTimezone(tz?: string): Date {
  const timezone = tz || getStoreTimezone();
  return toZonedTime(new Date(), timezone);
}

/**
 * Format a date as YYYY-MM-DD in the store's timezone.
 * This replaces `new Date().toISOString().split('T')[0]` and `formatLocalDate()`.
 */
export function formatDateInTimezone(date?: Date, tz?: string): string {
  const timezone = tz || getStoreTimezone();
  const zonedDate = date ? toZonedTime(date, timezone) : nowInTimezone(timezone);
  return formatTz(zonedDate, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Get "today" as YYYY-MM-DD string in the store's timezone.
 */
export function todayInTimezone(tz?: string): string {
  return formatDateInTimezone(new Date(), tz);
}

/**
 * Get "N days ago" as YYYY-MM-DD string in the store's timezone.
 */
export function daysAgoInTimezone(n: number, tz?: string): string {
  const timezone = tz || getStoreTimezone();
  const now = nowInTimezone(timezone);
  const past = subDays(now, n);
  return formatTz(past, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Get start of month as YYYY-MM-DD in the store's timezone.
 */
export function monthStartInTimezone(tz?: string): string {
  const timezone = tz || getStoreTimezone();
  const now = nowInTimezone(timezone);
  const monthStart = startOfMonth(now);
  return formatTz(monthStart, 'yyyy-MM-dd', { timeZone: timezone });
}

/**
 * Create a Date representing the start of a day (00:00:00) in the store timezone.
 *
 * Uses `fromZonedTime` to convert "midnight in the store TZ" to the correct UTC
 * Date object. This ensures that when the Date is later formatted via
 * `formatInTimezone` or `formatDateInTimezone` (which use `toZonedTime`),
 * it round-trips correctly regardless of the browser's local timezone.
 *
 * IMPORTANT: We parse the dateStr with explicit UTC ('Z' suffix) and pass to
 * fromZonedTime which interprets the UTC fields (year, month, day, hour, etc.)
 * as wall-clock time in the target timezone. This avoids the browser's local
 * timezone affecting the parse.
 *
 * Example: Store TZ = America/New_York (ET = UTC-5)
 *   dateStr = "2026-02-14"
 *   We create Date("2026-02-14T00:00:00Z") → UTC midnight Feb 14
 *   fromZonedTime reads year=2026 month=Feb day=14 hour=0 min=0 as "midnight ET"
 *   Returns UTC Date = 2026-02-14T05:00:00Z (midnight ET = 5AM UTC)
 *   formatDateInTimezone() → toZonedTime → "2026-02-14" ✓
 */
function startOfDayInTz(dateStr: string, tz: string): Date {
  // Parse as UTC to avoid browser local TZ affecting the date components
  return fromZonedTime(`${dateStr}T00:00:00`, tz);
}

/**
 * Create a Date representing the end of a day (23:59:59) in the store timezone.
 */
function endOfDayInTz(dateStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T23:59:59`, tz);
}

/**
 * Get a date range for a preset, using the store's timezone.
 *
 * IMPORTANT: We compute date strings (YYYY-MM-DD) in the store timezone first,
 * then construct Date objects from those strings. This avoids the double-timezone
 * bug where date-fns's startOfDay/endOfDay/startOfMonth use the BROWSER's
 * local timezone instead of the store timezone, causing off-by-one errors
 * when the browser and store are in different timezones.
 */
export function getDateRangeInTimezone(
  preset: string,
  tz?: string
): { start: Date; end: Date; preset: string } {
  const timezone = tz || getStoreTimezone();

  // Get today's date string in the store timezone — this is always correct
  const todayStr = todayInTimezone(timezone);
  const yesterdayStr = daysAgoInTimezone(1, timezone);

  switch (preset) {
    case 'today':
      return { start: startOfDayInTz(todayStr, timezone), end: endOfDayInTz(todayStr, timezone), preset };
    case 'yesterday':
      return { start: startOfDayInTz(yesterdayStr, timezone), end: endOfDayInTz(yesterdayStr, timezone), preset };
    case 'last7': {
      // 7 complete days ending yesterday (matches Shopify's "Last 7 days")
      const startStr = daysAgoInTimezone(7, timezone);
      return { start: startOfDayInTz(startStr, timezone), end: endOfDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last14': {
      const startStr = daysAgoInTimezone(14, timezone);
      return { start: startOfDayInTz(startStr, timezone), end: endOfDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last30': {
      const startStr = daysAgoInTimezone(30, timezone);
      return { start: startOfDayInTz(startStr, timezone), end: endOfDayInTz(yesterdayStr, timezone), preset };
    }
    case 'thisMonth': {
      const monthStartStr = monthStartInTimezone(timezone);
      return { start: startOfDayInTz(monthStartStr, timezone), end: endOfDayInTz(todayStr, timezone), preset };
    }
    case 'lastMonth': {
      // Compute last month's start and end in the store timezone
      const now = nowInTimezone(timezone);
      const lastMonth = subMonths(now, 1);
      const lastMonthStartStr = formatTz(lastMonth, 'yyyy-MM-01', { timeZone: timezone });
      const lastMonthEnd = endOfMonth(new Date(`${lastMonthStartStr}T12:00:00`));
      const lastMonthEndStr = formatTz(lastMonthEnd, 'yyyy-MM-dd', { timeZone: timezone });
      return { start: startOfDayInTz(lastMonthStartStr, timezone), end: endOfDayInTz(lastMonthEndStr, timezone), preset };
    }
    default: {
      const startStr = daysAgoInTimezone(29, timezone);
      return { start: startOfDayInTz(startStr, timezone), end: endOfDayInTz(todayStr, timezone), preset: 'last30' };
    }
  }
}

/**
 * Format a date for display in the store's timezone.
 * formatStr follows date-fns format tokens (e.g., 'MMM d, yyyy').
 */
export function formatInTimezone(date: Date, formatStr: string, tz?: string): string {
  const timezone = tz || getStoreTimezone();
  return formatTz(toZonedTime(date, timezone), formatStr, { timeZone: timezone });
}

/**
 * Get all days in a range, in the store's timezone.
 */
export function getDaysInRangeTimezone(
  start: Date,
  end: Date,
  tz?: string
): Date[] {
  const timezone = tz || getStoreTimezone();
  const zonedStart = toZonedTime(start, timezone);
  const zonedEnd = toZonedTime(end, timezone);
  return eachDayOfInterval({ start: zonedStart, end: zonedEnd });
}

/**
 * Convert a Shopify order ISO timestamp to a YYYY-MM-DD date
 * in the store's timezone (not the browser's timezone).
 */
export function shopifyDateToStoreDate(isoTimestamp: string, tz?: string): string {
  const timezone = tz || getStoreTimezone();
  const date = new Date(isoTimestamp);
  return formatTz(toZonedTime(date, timezone), 'yyyy-MM-dd', { timeZone: timezone });
}
