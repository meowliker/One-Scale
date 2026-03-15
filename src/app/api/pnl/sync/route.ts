import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

const PNL_SYNC_SECRET = process.env.PNL_SYNC_SECRET ?? '';

/**
 * Get the store's timezone from the ad account settings.
 * Falls back to America/New_York if not found.
 */
async function getStoreTimezoneServer(storeId: string): Promise<string> {
  try {
    const accounts = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.1&select=timezone&limit=1`
    );
    return accounts?.[0]?.timezone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/**
 * Get YYYY-MM-DD for "today" and "N days ago" in a specific timezone.
 * Uses Intl.DateTimeFormat to avoid importing date-fns-tz in server route.
 */
function formatDateInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Convert a date string + timezone to UTC ISO bounds for API queries.
 * E.g., "2026-03-12" in "America/New_York" → "2026-03-12T05:00:00Z" to "2026-03-13T04:59:59Z"
 */
function dateStrToUtcBounds(dateStr: string, tz: string): { min: string; max: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startLocal = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));

  // Find timezone offset: compare midnight UTC with how it renders in the target TZ
  const utcDate = new Date(`${dateStr}T00:00:00Z`);
  const inTzStr = utcDate.toLocaleString('en-US', { timeZone: tz });
  const inTzDate = new Date(inTzStr);
  const offsetMs = utcDate.getTime() - inTzDate.getTime();

  // Midnight in target TZ as UTC
  const midnightUtc = new Date(startLocal.getTime() + offsetMs);
  const endUtc = new Date(midnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1000); // 23:59:59

  return {
    min: midnightUtc.toISOString(),
    max: endUtc.toISOString(),
  };
}

/**
 * Read the store's currency from store_config. Falls back to 'USD'.
 */
async function getStoreCurrencyServer(storeId: string): Promise<string> {
  try {
    const rows = await rest<Array<{ currency: string }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=currency&limit=1`
    );
    return rows?.[0]?.currency || 'USD';
  } catch {
    return 'USD';
  }
}

// GET: Read pre-aggregated snapshots from DB (replaces live API calls)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const days = parseInt(searchParams.get('days') ?? '31', 10);

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Use store timezone to calculate the date range
  const now = new Date();
  const sinceDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  // For the GET query we just need a YYYY-MM-DD string — use UTC as a safe approximation
  // since daily_pnl_snapshots dates are already stored in store timezone by the POST handler
  const sinceStr = sinceDate.toISOString().split('T')[0];

  try {
    const data = await rest<Array<{
      date: string;
      revenue: number;
      cogs: number;
      ad_spend: number;
      shipping_cost: number;
      transaction_fees: number;
      refunds: number;
      net_profit: number;
      margin: number;
      order_count: number;
      full_refund_count: number;
      partial_refund_count: number;
      full_refund_amount: number;
      partial_refund_amount: number;
      chargeback_loss: number;
      chargeback_won: number;
      gross_revenue: number;
      settled_revenue: number;
      revenue_source: string;
      synced_at: string;
    }>>(
      `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${sinceStr}&select=*&order=date.asc`
    );

    const entries = (data ?? []).map(row => ({
      date: row.date,
      revenue: Number(row.revenue),
      grossRevenue: row.gross_revenue ? Number(row.gross_revenue) : undefined,
      settledRevenue: row.settled_revenue ? Number(row.settled_revenue) : undefined,
      revenueSource: (row.revenue_source as 'settled' | 'orders_api') || undefined,
      cogs: Number(row.cogs),
      adSpend: Number(row.ad_spend),
      shipping: Number(row.shipping_cost),
      fees: Number(row.transaction_fees),
      refunds: Number(row.refunds),
      netProfit: Number(row.net_profit),
      margin: Number(row.margin),
      orderCount: row.order_count,
      fullRefundCount: row.full_refund_count,
      partialRefundCount: row.partial_refund_count,
      fullRefundAmount: Number(row.full_refund_amount),
      partialRefundAmount: Number(row.partial_refund_amount),
      chargebackLoss: Number(row.chargeback_loss),
      chargebackWon: Number(row.chargeback_won),
    }));

    const lastRow = data?.[data.length - 1];
    const staleSec = lastRow
      ? Math.round((Date.now() - new Date(lastRow.synced_at).getTime()) / 1000)
      : 999999;

    // Include the store's currency so the frontend knows how to format values
    const currency = await getStoreCurrencyServer(storeId);

    return NextResponse.json({
      data: entries,
      meta: {
        count: entries.length,
        staleSec,
        isStale: staleSec > 300,
        lastSyncedAt: lastRow?.synced_at ?? null,
        currency,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'DB error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Compute P&L for date range and upsert into daily_pnl_snapshots
export async function POST(request: NextRequest) {
  const body = await request.json() as {
    storeId: string;
    secret?: string;
    daysBack?: number;
  };

  if (body.secret && body.secret !== PNL_SYNC_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { storeId, daysBack = 1 } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Get store timezone
  const storeTz = await getStoreTimezoneServer(storeId);

  // Also try store_config
  let configTz = storeTz;
  try {
    const cfgRows = await rest<Array<{ iana_timezone: string }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=iana_timezone&limit=1`
    );
    if (cfgRows?.[0]?.iana_timezone) configTz = cfgRows[0].iana_timezone;
  } catch { /* use storeTz */ }
  const tz = configTz || storeTz;

  const now = new Date();
  const dates: string[] = [];
  for (let i = daysBack; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(formatDateInTz(d, tz));
  }

  const results: Array<{ date: string; success: boolean; error?: string }> = [];

  // ── PRIMARY: Use payout summary fields (exact, same as Apps Script) ──
  // Each payout has pre-calculated summary from Shopify = exact numbers.
  // Group by payout_date (not processed_at) for correct date attribution.

  const payoutRows = await rest<Array<{
    payout_date: string; charges_gross: number; charges_fee: number;
    refunds_gross: number; adjustments_gross: number; reserved_gross: number;
  }>>(
    `/store_payouts?store_id=eq.${encodeURIComponent(storeId)}` +
    `&status=in.(paid,in_transit)` +
    `&select=payout_date,charges_gross,charges_fee,refunds_gross,adjustments_gross,reserved_gross` +
    `&order=payout_date.desc&limit=100`
  ).catch(() => []);

  // Group payouts by date (multiple payouts can share a date)
  const payoutByDate = new Map<string, { revenue: number; fees: number; refunds: number; adjustments: number; reserved: number }>();
  for (const p of payoutRows ?? []) {
    const d = p.payout_date;
    const existing = payoutByDate.get(d) ?? { revenue: 0, fees: 0, refunds: 0, adjustments: 0, reserved: 0 };
    existing.revenue += Number(p.charges_gross) || 0;
    existing.fees += Math.abs(Number(p.charges_fee) || 0);
    existing.refunds += Math.abs(Number(p.refunds_gross) || 0);
    existing.adjustments += Number(p.adjustments_gross) || 0;
    existing.reserved += Number(p.reserved_gross) || 0;
    payoutByDate.set(d, existing);
  }

  // Get chargebacks from BT (payout summary doesn't break disputes out)
  const disputeRows = await rest<Array<{ processed_at: string; net: number }>>(
    `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}` +
    `&type=eq.dispute&select=processed_at,net&limit=500`
  ).catch(() => []);

  // Group disputes by date in store timezone
  const disputeByDate = new Map<string, { loss: number; won: number }>();
  for (const d of disputeRows ?? []) {
    const dateStr = formatDateInTz(new Date(d.processed_at), tz);
    const existing = disputeByDate.get(dateStr) ?? { loss: 0, won: 0 };
    const net = Number(d.net) || 0;
    if (net < 0) existing.loss += Math.abs(net);
    else existing.won += net;
    disputeByDate.set(dateStr, existing);
  }

  // Build P&L for each requested date
  for (const dateStr of dates) {
    try {
      const payout = payoutByDate.get(dateStr);
      const dispute = disputeByDate.get(dateStr);

      const revenue = Math.round((payout?.revenue ?? 0) * 100) / 100;
      const transactionFees = Math.round((payout?.fees ?? 0) * 100) / 100;
      const refunds = Math.round((payout?.refunds ?? 0) * 100) / 100;
      const adjustments = Math.round(((payout?.adjustments ?? 0) + (payout?.reserved ?? 0)) * 100) / 100;
      const chargebackLoss = Math.round((dispute?.loss ?? 0) * 100) / 100;
      const chargebackWon = Math.round((dispute?.won ?? 0) * 100) / 100;

      // Meta ad spend
      let adSpend = 0;
      try {
        const spendRows = await rest<Array<{ spend: number }>>(
          `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=eq.${dateStr}&select=spend`
        );
        adSpend = (spendRows ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
      } catch { /* no meta */ }

      const netProfit = Math.round((revenue - transactionFees - refunds - chargebackLoss + chargebackWon + adjustments - adSpend) * 100) / 100;
      const margin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;

      await rest(
        '/daily_pnl_snapshots?on_conflict=store_id,date',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            store_id: storeId, date: dateStr,
            revenue, transaction_fees: transactionFees, refunds,
            chargeback_loss: chargebackLoss, chargeback_won: chargebackWon,
            ad_spend: adSpend, net_profit: netProfit, margin,
            synced_at: new Date().toISOString(),
            shopify_synced: revenue > 0 || refunds > 0,
            meta_synced: adSpend > 0,
          }]),
        }
      );

      results.push({ date: dateStr, success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown';
      results.push({ date: dateStr, success: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}

// Legacy code below removed — P&L now calculated purely from balance transactions.
// No orders needed. No fee estimation. No joins. Exact numbers from BT.
// Orders are only needed for product performance (which product was in which order).
/* eslint-disable @typescript-eslint/no-unused-vars */
const _LEGACY_REMOVED = true;

