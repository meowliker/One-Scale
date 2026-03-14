import { rest } from '@/app/api/lib/supabase-persistence';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';

export interface RefundSummary {
  total: number;
  count: number;
  source: 'shopify_refunds' | 'pnl_daily_cache' | 'none';
}

export interface ChargebackSummary {
  lost: number;
  lostCount: number;
  won: number;
  wonCount: number;
  pending: number;
  pendingCount: number;
  source: 'shopify_chargebacks' | 'none';
}

/**
 * Get refunds for a store within a date range.
 * Reads from shopify_refunds table (populated by balance transaction sync).
 */
export async function getRefundsForDateRange(
  storeId: string,
  startDate: string,
  endDate: string,
  timezone = 'America/New_York',
): Promise<RefundSummary> {
  try {
    const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(startDate, endDate, timezone);
    const rows = await rest<Array<{ amount: number }>>(
      `/shopify_refunds?store_id=eq.${encodeURIComponent(storeId)}` +
      `&processed_at=gte.${encodeURIComponent(tzStart)}` +
      `&processed_at=lte.${encodeURIComponent(tzEnd)}` +
      `&select=amount`,
    );

    if (rows && rows.length > 0) {
      const total = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
      return { total, count: rows.length, source: 'shopify_refunds' };
    }
  } catch { /* table may not exist yet */ }

  // Fallback: try pnl_daily_cache
  try {
    const cached = await rest<Array<{ refunds: number }>>(
      `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}` +
      `&date=gte.${startDate}&date=lte.${endDate}` +
      `&select=refunds`,
    );

    if (cached && cached.length > 0) {
      const total = cached.reduce((sum, r) => sum + (r.refunds ?? 0), 0);
      return { total, count: cached.length, source: 'pnl_daily_cache' };
    }
  } catch { /* table may not exist */ }

  return { total: 0, count: 0, source: 'none' };
}

/**
 * Get chargebacks (disputes) for a store within a date range.
 * Reads from shopify_chargebacks table.
 * Lost = money left account, Won = money recovered, Pending = unresolved.
 */
export async function getChargebacksForDateRange(
  storeId: string,
  startDate: string,
  endDate: string,
  timezone = 'America/New_York',
): Promise<ChargebackSummary> {
  try {
    const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(startDate, endDate, timezone);
    const rows = await rest<Array<{ amount: number; status: string; finalized_at: string | null; initiated_at: string | null }>>(
      `/shopify_chargebacks?store_id=eq.${encodeURIComponent(storeId)}` +
      `&or=(finalized_at.gte.${encodeURIComponent(tzStart)},initiated_at.gte.${encodeURIComponent(tzStart)})` +
      `&or=(finalized_at.lte.${encodeURIComponent(tzEnd)},initiated_at.lte.${encodeURIComponent(tzEnd)})` +
      `&select=amount,status,finalized_at,initiated_at`,
    );

    if (rows && rows.length > 0) {
      const lost = rows.filter(r => r.status === 'lost');
      const won = rows.filter(r => r.status === 'won');
      const pending = rows.filter(r => r.status === 'pending');

      return {
        lost: lost.reduce((sum, r) => sum + (r.amount ?? 0), 0),
        lostCount: lost.length,
        won: won.reduce((sum, r) => sum + (r.amount ?? 0), 0),
        wonCount: won.length,
        pending: pending.reduce((sum, r) => sum + (r.amount ?? 0), 0),
        pendingCount: pending.length,
        source: 'shopify_chargebacks',
      };
    }
  } catch { /* table may not exist yet */ }

  return { lost: 0, lostCount: 0, won: 0, wonCount: 0, pending: 0, pendingCount: 0, source: 'none' };
}

/**
 * Get Shopify payment processing fees for a date range.
 * Reads actual fees from balance transactions (type=charge).
 */
export async function getProcessingFeesForDateRange(
  storeId: string,
  startDate: string,
  endDate: string,
  timezone = 'America/New_York',
): Promise<{ totalFees: number; transactionCount: number; source: string }> {
  try {
    const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(startDate, endDate, timezone);
    const rows = await rest<Array<{ fee: number }>>(
      `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}` +
      `&type=eq.charge` +
      `&processed_at=gte.${encodeURIComponent(tzStart)}` +
      `&processed_at=lte.${encodeURIComponent(tzEnd)}` +
      `&select=fee`,
    );

    if (rows && rows.length > 0) {
      const totalFees = rows.reduce((sum, r) => sum + (r.fee ?? 0), 0);
      return { totalFees, transactionCount: rows.length, source: 'shopify_balance_transactions' };
    }
  } catch { /* table may not exist yet */ }

  return { totalFees: 0, transactionCount: 0, source: 'none' };
}
