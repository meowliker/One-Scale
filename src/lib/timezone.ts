/**
 * Timezone Utilities
 *
 * Most date operations in the app should use the Shopify store's timezone,
 * NOT the browser's local timezone. This ensures data consistency between
 * Shopify orders, Meta Ads insights, and dashboard displays.
 *
 * The store timezone comes from the linked ad account's timezone_name
 * (e.g., "America/New_York", "America/Los_Angeles", "Asia/Kolkata").
 */

import { toZonedTime, fromZonedTime, format as formatTz } from 'date-fns-tz';
import {
  addDays,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
} from 'date-fns';

// Default timezone fallback when no store is selected
export const DEFAULT_TIMEZONE = 'America/New_York';
export const STORE_REPORTING_TIMEZONE = 'Asia/Kolkata';
export const STORE_DAY_RESET_HOUR = 11;
export const STORE_DAY_RESET_MINUTE = 30;

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
    const state = useStoreStore.getState() as {
      activeStoreId?: string | null;
      stores?: Array<{
        id?: string;
        timezone?: string | null;
        adAccounts?: Array<{ isActive?: boolean; timezone?: string | null }>;
      }>;
    };
    const activeStore = state.stores?.find((s) => s.id === state.activeStoreId);

    if (activeStore?.timezone) return activeStore.timezone;

    if (activeStore?.adAccounts?.length) {
      // Use the timezone from the first active ad account
      const activeAccount = activeStore.adAccounts.find((a) => a.isActive);
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
 * Get the active reporting day for stores whose operational day resets at
 * 11:30 AM in the store timezone.
 *
 * Example: at 2026-06-03 10:00 IST this returns 2026-06-02; at 11:54 IST it
 * returns 2026-06-03.
 */
export function storeDayInTimezone(date: Date = new Date(), tz?: string): string {
  const timezone = tz || STORE_REPORTING_TIMEZONE;
  const zonedDate = toZonedTime(date, timezone);
  const hour = Number(formatTz(zonedDate, 'H', { timeZone: timezone }));
  const minute = Number(formatTz(zonedDate, 'm', { timeZone: timezone }));
  const beforeReset =
    hour < STORE_DAY_RESET_HOUR
    || (hour === STORE_DAY_RESET_HOUR && minute < STORE_DAY_RESET_MINUTE);
  const reportingDate = beforeReset ? subDays(zonedDate, 1) : zonedDate;
  return formatTz(reportingDate, 'yyyy-MM-dd', { timeZone: timezone });
}

export function todayStoreDayInTimezone(tz?: string): string {
  return storeDayInTimezone(new Date(), tz);
}

export function storeDaysAgoInTimezone(n: number, tz?: string): string {
  const timezone = tz || STORE_REPORTING_TIMEZONE;
  const currentStoreDay = todayStoreDayInTimezone(timezone);
  const anchor = fromZonedTime(`${currentStoreDay}T12:00:00`, timezone);
  return formatDateInTimezone(subDays(anchor, n), timezone);
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
export function startOfDayInTz(dateStr: string, tz: string): Date {
  // Parse as UTC to avoid browser local TZ affecting the date components
  return fromZonedTime(`${dateStr}T00:00:00`, tz);
}

/**
 * Create a Date representing the end of a day (23:59:59) in the store timezone.
 */
export function endOfDayInTz(dateStr: string, tz: string): Date {
  return fromZonedTime(`${dateStr}T23:59:59`, tz);
}

export function startOfStoreDayInTz(dateStr: string, tz: string = STORE_REPORTING_TIMEZONE): Date {
  const hh = String(STORE_DAY_RESET_HOUR).padStart(2, '0');
  const mm = String(STORE_DAY_RESET_MINUTE).padStart(2, '0');
  return fromZonedTime(`${dateStr}T${hh}:${mm}:00`, tz);
}

export function endOfStoreDayInTz(dateStr: string, tz: string = STORE_REPORTING_TIMEZONE): Date {
  const nextDateStr = formatDateInTimezone(addDays(fromZonedTime(`${dateStr}T12:00:00`, tz), 1), tz);
  return new Date(startOfStoreDayInTz(nextDateStr, tz).getTime() - 1);
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
  const timezone = tz || STORE_REPORTING_TIMEZONE;

  // Get today's reporting date in the store timezone. Store reporting days reset
  // at 11:30 AM, not midnight.
  const todayStr = todayStoreDayInTimezone(timezone);
  const yesterdayStr = storeDaysAgoInTimezone(1, timezone);

  switch (preset) {
    case 'today':
      return { start: startOfStoreDayInTz(todayStr, timezone), end: new Date(), preset };
    case 'yesterday':
      return { start: startOfStoreDayInTz(yesterdayStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    case 'last3': {
      const startStr = storeDaysAgoInTimezone(3, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last7': {
      // 7 complete days ending yesterday (matches Shopify's "Last 7 days")
      const startStr = storeDaysAgoInTimezone(7, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last7today': {
      // 7 days ago through end of today (8-day window including today)
      const startStr = storeDaysAgoInTimezone(7, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: new Date(), preset };
    }
    case 'last14': {
      const startStr = storeDaysAgoInTimezone(14, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last28': {
      const startStr = storeDaysAgoInTimezone(28, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    }
    case 'last30': {
      const startStr = storeDaysAgoInTimezone(30, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: endOfStoreDayInTz(yesterdayStr, timezone), preset };
    }
    case 'thisMonth': {
      const monthStartStr = `${todayStr.slice(0, 7)}-01`;
      return { start: startOfStoreDayInTz(monthStartStr, timezone), end: new Date(), preset };
    }
    case 'lastMonth': {
      // Compute last month's start and end in the store timezone
      const now = toZonedTime(fromZonedTime(`${todayStr}T12:00:00`, timezone), timezone);
      const lastMonth = subMonths(now, 1);
      const lastMonthStartStr = formatTz(lastMonth, 'yyyy-MM-01', { timeZone: timezone });
      const lastMonthEnd = endOfMonth(new Date(`${lastMonthStartStr}T12:00:00`));
      const lastMonthEndStr = formatTz(lastMonthEnd, 'yyyy-MM-dd', { timeZone: timezone });
      return { start: startOfStoreDayInTz(lastMonthStartStr, timezone), end: endOfStoreDayInTz(lastMonthEndStr, timezone), preset };
    }
    default: {
      const startStr = storeDaysAgoInTimezone(29, timezone);
      return { start: startOfStoreDayInTz(startStr, timezone), end: new Date(), preset: 'last30' };
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

export function shopifyDateToStoreDayDate(isoTimestamp: string, tz?: string): string {
  return storeDayInTimezone(new Date(isoTimestamp), tz);
}
