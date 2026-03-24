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
  // Use Intl to find the UTC offset for midnight in the target timezone
  // toLocaleString round-trip is unreliable on Windows — use formatter instead
  const [year, month, day] = dateStr.split('-').map(Number);

  // Create a date at midnight UTC on the target date
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)); // noon UTC for safety
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(probe);
  const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
  const tzDay = parseInt(parts.find(p => p.type === 'day')?.value ?? String(day), 10);

  // Offset = how many hours ahead the TZ is from UTC
  // If probe is noon UTC and TZ shows 6am → offset is -6 (behind UTC)
  // If probe is noon UTC and TZ shows 5:30pm → offset is +5.5 (ahead of UTC)
  let offsetHours = tzHour - 12;
  if (tzDay > day) offsetHours += 24; // crossed midnight forward
  if (tzDay < day) offsetHours -= 24; // crossed midnight backward
  const tzMin = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const offsetMs = (offsetHours * 60 + tzMin) * 60 * 1000;

  // Midnight in target TZ = midnight UTC minus the offset
  const midnightUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const endUtc = new Date(midnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1000);

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
      adjustment: number;
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
      adjustments: Number(row.adjustment ?? 0),
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

  // ── P&L from BT processed_at grouped by store timezone ──
  // Same logic as Apps Script V4.4: group individual BT by processed_at date in store TZ.
  // Verified EXACT: Guatemala TZ gives $3,129.88 revenue, $170.46 fees for March 13.

  for (const dateStr of dates) {
    try {
      const utcBounds = dateStrToUtcBounds(dateStr, tz);

      const btRows = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
        `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}` +
        `&and=(processed_at.gte.${encodeURIComponent(utcBounds.min)},processed_at.lte.${encodeURIComponent(utcBounds.max)})` +
        `&type=neq.payout&select=type,amount,fee,net&limit=1000`
      ).catch(() => []);

      const hasCharges = (btRows ?? []).some(t => (t.type || '').toLowerCase() === 'charge');

      // Ad spend — ONLY from mapped ad accounts (prevents cross-store pollution)
      let adSpend = 0;
      try {
        const mappedAccounts = await rest<Array<{ ad_account_id: string }>>(
          `/meta_ad_account_mappings?store_id=eq.${encodeURIComponent(storeId)}&select=ad_account_id`
        ).catch(() => []);
        const mappedIds = [...new Set(mappedAccounts.map(a => a.ad_account_id))];
        if (mappedIds.length > 0) {
          const accountFilter = mappedIds.map(id => encodeURIComponent(id)).join(',');
          const spendRows = await rest<Array<{ spend: number }>>(
            `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&ad_account_id=in.(${accountFilter})&date=eq.${dateStr}&select=spend`
          );
          adSpend = (spendRows ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
        }
      } catch { /* no meta */ }

      if (hasCharges) {
        // ── Universal BT calculator ──
        const { calculateFromBT } = await import('@/lib/pnl/btCalculator');
        const r = calculateFromBT(btRows ?? []);
        const netProfit = Math.round((r.netRevenue - adSpend) * 100) / 100;
        const margin = r.revenue > 0 ? Math.round((netProfit / r.revenue) * 10000) / 100 : 0;

        // CRITICAL: BT path must also set order_count from orders cache.
        // Without this, Key Metrics (AOV, Total Orders) show 0.
        let orderCount = 0;
        try {
          const orderCountRows = await rest<Array<{ count: number }>>(
            `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
            `&and=(created_at.gte.${encodeURIComponent(utcBounds.min)},created_at.lte.${encodeURIComponent(utcBounds.max)})` +
            `&order_status=neq.cancelled&financial_status=neq.refunded&financial_status=neq.voided` +
            `&select=shopify_order_id`,
            { headers: { Prefer: 'count=exact' } }
          );
          orderCount = orderCountRows?.length ?? 0;
        } catch { /* orders cache may not be populated yet */ }

        // Also build per-product breakdown for multi-day aggregation
        let productBreakdown: string | null = null;
        try {
          const orderRows = await rest<Array<{ shopify_order_id: string; total_price: number; line_items: string; financial_status: string }>>(
            `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
            `&and=(created_at.gte.${encodeURIComponent(utcBounds.min)},created_at.lte.${encodeURIComponent(utcBounds.max)})` +
            `&order_status=neq.cancelled&financial_status=neq.refunded&financial_status=neq.voided` +
            `&select=shopify_order_id,total_price,line_items,financial_status&limit=1000`
          );
          if (orderRows && orderRows.length > 0) {
            const prodMap = new Map<string, { productTitle: string; revenue: number; unitsSold: number; fees: number; orders: Set<string>; classification: string }>();
            for (const order of orderRows) {
              let items: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number }>;
              try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
              for (const item of items) {
                const pid = item.product_id ? String(item.product_id) : '';
                if (!pid || pid === 'null' || pid === '0') continue;
                const lineRev = parseFloat(item.price ?? '0') * (item.quantity ?? 1);
                const existing = prodMap.get(pid);
                if (existing) {
                  existing.revenue += lineRev;
                  existing.unitsSold += item.quantity ?? 1;
                  existing.orders.add(String(order.shopify_order_id));
                } else {
                  prodMap.set(pid, { productTitle: item.title ?? 'Unknown', revenue: lineRev, unitsSold: item.quantity ?? 1, fees: 0, orders: new Set([String(order.shopify_order_id)]), classification: 'main' });
                }
              }
            }
            productBreakdown = JSON.stringify(Array.from(prodMap.entries()).map(([pid, agg]) => ({
              productId: pid, productTitle: agg.productTitle, classification: agg.classification,
              revenue: Math.round(agg.revenue * 100) / 100, unitsSold: agg.unitsSold,
              fees: 0, orders: agg.orders.size,
            })));
          }
        } catch { /* product breakdown is optional */ }

        await rest(
          '/daily_pnl_snapshots?on_conflict=store_id,date',
          {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{
              store_id: storeId, date: dateStr,
              revenue: r.revenue, transaction_fees: r.fees, refunds: r.refunds,
              chargeback_loss: r.chargebackLoss, chargeback_won: r.chargebackWon,
              adjustment: r.adjustment, credit: r.credit,
              reserved_funds: r.reservedFunds, marketplace_tax: r.marketplaceTax,
              seller_protection: r.sellerProtection,
              other_income: r.otherIncome, other_expense: r.otherExpense,
              capital_repayment: r.capitalRepayment, net_revenue: r.netRevenue,
              ad_spend: adSpend, net_profit: netProfit, margin,
              order_count: orderCount,
              product_breakdown: productBreakdown,
              synced_at: new Date().toISOString(),
              shopify_synced: r.revenue > 0 || r.refunds > 0,
              meta_synced: adSpend > 0,
            }]),
          }
        );
      } else {
        // Orders fallback for stores without Shopify Payments (e.g. Naiva)
        const orders = await rest<Array<{ total_price: number; financial_status: string; refund_total: number }>>(
          `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
          `&and=(created_at.gte.${encodeURIComponent(utcBounds.min)},created_at.lte.${encodeURIComponent(utcBounds.max)})` +
          `&order_status=neq.cancelled&select=total_price,financial_status,refund_total`
        ).catch(() => []);

        let revenue = 0, refunds = 0, orderCount = 0;
        for (const order of orders ?? []) {
          const fs = (order.financial_status || '').toLowerCase();
          if (fs === 'voided') continue;
          if (fs === 'refunded') { refunds += Number(order.refund_total) || Number(order.total_price) || 0; continue; }
          revenue += Number(order.total_price) || 0;
          orderCount++;
          if (fs === 'partially_refunded' && order.refund_total) refunds += Number(order.refund_total) || 0;
        }
        revenue = Math.round(revenue * 100) / 100;
        refunds = Math.round(refunds * 100) / 100;
        const fees = Math.round(revenue * 0.02 * 100) / 100;
        const netProfit = Math.round((revenue - fees - refunds - adSpend) * 100) / 100;
        const margin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;

        await rest(
          '/daily_pnl_snapshots?on_conflict=store_id,date',
          {
            method: 'POST',
            headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify([{
              store_id: storeId, date: dateStr,
              revenue, transaction_fees: fees, refunds,
              chargeback_loss: 0, chargeback_won: 0,
              ad_spend: adSpend, net_profit: netProfit, margin,
              order_count: orderCount,
              synced_at: new Date().toISOString(),
              shopify_synced: revenue > 0, meta_synced: adSpend > 0,
            }]),
          }
        );
      }

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

