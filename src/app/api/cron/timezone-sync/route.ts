import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  listPersistentStoreAdAccounts,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Get YYYY-MM-DD for a date in a specific timezone.
 */
function formatDateInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find(p => p.type === 'year')!.value;
  const m = parts.find(p => p.type === 'month')!.value;
  const d = parts.find(p => p.type === 'day')!.value;
  return `${y}-${m}-${d}`;
}

/**
 * Get the current hour in a specific timezone.
 */
function getHourInTz(date: Date, tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      hour12: false,
    }).format(date),
    10,
  );
}

/**
 * Convert a date string + timezone to UTC ISO bounds for queries.
 * E.g., "2026-03-15" in "America/Guatemala" → UTC start/end of that day.
 */
function dateStrToUtcBounds(dateStr: string, tz: string): { min: string; max: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(probe);
  const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
  const tzDay = parseInt(parts.find(p => p.type === 'day')?.value ?? String(day), 10);

  let offsetHours = tzHour - 12;
  if (tzDay > day) offsetHours += 24;
  if (tzDay < day) offsetHours -= 24;
  const tzMin = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const offsetMs = (offsetHours * 60 + tzMin) * 60 * 1000;

  const midnightUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMs);
  const endUtc = new Date(midnightUtc.getTime() + 24 * 60 * 60 * 1000 - 1000);

  return {
    min: midnightUtc.toISOString(),
    max: endUtc.toISOString(),
  };
}

// ── BT Sync (reused from daily-pnl-snapshot) ────────────────────────────

async function syncBalanceTransactionsForStore(storeId: string): Promise<number> {
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) return 0;

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 7);
  const sinceISO = sinceDate.toISOString();

  let totalCount = 0;
  let sinceId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, string> = {
      limit: '250',
      processed_at_min: sinceISO,
    };
    if (sinceId) params.since_id = sinceId;

    let data: { transactions?: Array<{
      id: number | string; type: string; amount: string; fee: string;
      net: string; currency: string; source_order_id?: number | string;
      source_type?: string; processed_at: string; payout_id?: number | string;
    }> };

    try {
      data = await fetchFromShopify(
        token.accessToken,
        token.shopDomain,
        '/shopify_payments/balance/transactions.json',
        params,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) break;
      throw err;
    }

    const txns = data.transactions ?? [];
    if (txns.length === 0) break;

    for (const txn of txns) {
      const txnType = (txn.type || '').toLowerCase();
      await rest('/shopify_balance_transactions?on_conflict=store_id,transaction_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: storeId,
          transaction_id: String(txn.id),
          type: txnType,
          amount: parseFloat(txn.amount || '0'),
          fee: Math.abs(parseFloat(txn.fee || '0')),
          net: parseFloat(txn.net || '0'),
          currency: txn.currency || 'USD',
          source_order_id: txn.source_order_id ? String(txn.source_order_id) : null,
          source_type: txn.source_type || null,
          processed_at: txn.processed_at,
          payout_id: txn.payout_id ? String(txn.payout_id) : null,
        }),
      }).catch(() => null);

      if (txnType === 'refund') {
        await rest('/shopify_refunds?on_conflict=store_id,transaction_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            transaction_id: String(txn.id),
            order_id: txn.source_order_id ? String(txn.source_order_id) : null,
            amount: Math.abs(parseFloat(txn.amount || '0')),
            fee: Math.abs(parseFloat(txn.fee || '0')),
            currency: txn.currency || 'USD',
            processed_at: txn.processed_at,
          }),
        }).catch(() => null);
      }

      if (txnType === 'dispute') {
        const net = parseFloat(txn.net || '0');
        await rest('/shopify_chargebacks?on_conflict=store_id,order_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({
            store_id: storeId,
            order_id: txn.source_order_id ? String(txn.source_order_id) : null,
            status: net < 0 ? 'lost' : 'won',
            amount: Math.abs(net),
            net_amount: net,
            currency: txn.currency || 'USD',
            initiated_at: txn.processed_at,
            finalized_at: txn.processed_at,
            created_at: txn.processed_at,
            last_synced_at: new Date().toISOString(),
          }),
        }).catch(() => null);
      }
    }

    totalCount += txns.length;
    sinceId = String(txns[txns.length - 1].id);
    hasMore = txns.length === 250;
  }

  return totalCount;
}

// ── P&L Compute — BT primary, orders fallback ──────────────────────────

async function getAdSpendForDate(storeId: string, dateStr: string): Promise<number> {
  try {
    const spendRows = await rest<Array<{ spend: number }>>(
      `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=eq.${dateStr}&select=spend`
    );
    return (spendRows ?? []).reduce((s, r) => s + (Number(r.spend) || 0), 0);
  } catch { return 0; }
}

async function getLearnedFeeRate(storeId: string): Promise<number> {
  try {
    const recent = await rest<Array<{ amount: number; fee: number }>>(
      `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}&type=eq.charge&select=amount,fee&limit=100&order=processed_at.desc`
    );
    if (recent && recent.length > 10) {
      const totalAmt = recent.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
      const totalFee = recent.reduce((s, t) => s + Math.abs(Number(t.fee) || 0), 0);
      if (totalAmt > 0) return totalFee / totalAmt;
    }
  } catch { /* use default */ }
  return 0.02; // Conservative default for non-Shopify-Payments gateways
}

/**
 * Orders-based P&L fallback for stores without Shopify Payments (e.g. Naiva).
 * Uses shopify_orders_cache.total_price for revenue, learned fee rate for fees.
 */
async function computePnLFromOrders(
  storeId: string,
  dateStr: string,
  tz: string,
): Promise<{ success: boolean; source: string; error?: string }> {
  const utcBounds = dateStrToUtcBounds(dateStr, tz);

  const orders = await rest<Array<{
    total_price: number; financial_status: string; refund_total: number;
  }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
    `&and=(created_at.gte.${encodeURIComponent(utcBounds.min)},created_at.lte.${encodeURIComponent(utcBounds.max)})` +
    `&order_status=neq.cancelled&select=total_price,financial_status,refund_total`
  ).catch(() => []);

  let revenue = 0, refunds = 0, orderCount = 0;
  for (const order of orders ?? []) {
    const fs = (order.financial_status || '').toLowerCase();
    if (fs === 'voided') continue;
    if (fs === 'refunded') {
      refunds += Number(order.refund_total) || Number(order.total_price) || 0;
      continue;
    }
    revenue += Number(order.total_price) || 0;
    orderCount++;
    if (fs === 'partially_refunded' && order.refund_total) {
      refunds += Number(order.refund_total) || 0;
    }
  }

  revenue = Math.round(revenue * 100) / 100;
  refunds = Math.round(refunds * 100) / 100;

  const feeRate = await getLearnedFeeRate(storeId);
  const transactionFees = Math.round(revenue * feeRate * 100) / 100;
  const adSpend = await getAdSpendForDate(storeId, dateStr);

  const netProfit = Math.round((revenue - transactionFees - refunds - adSpend) * 100) / 100;
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 10000) / 100 : 0;

  await rest(
    '/daily_pnl_snapshots?on_conflict=store_id,date',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        store_id: storeId,
        date: dateStr,
        revenue,
        transaction_fees: transactionFees,
        refunds,
        order_count: orderCount,
        chargeback_loss: 0,
        chargeback_won: 0,
        ad_spend: adSpend,
        net_profit: netProfit,
        margin,
        // orders_fallback source
        synced_at: new Date().toISOString(),
        shopify_synced: revenue > 0,
        meta_synced: adSpend > 0,
      }]),
    }
  );

  return { success: true, source: 'orders_fallback' };
}

/**
 * BT-based P&L compute (primary path).
 * If no BT charges found, falls back to orders-based computation.
 */
async function computePnLForStore(
  storeId: string,
  dateStr: string,
  tz: string,
): Promise<{ success: boolean; source: string; error?: string }> {
  const utcBounds = dateStrToUtcBounds(dateStr, tz);

  const btRows = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
    `/shopify_balance_transactions?store_id=eq.${encodeURIComponent(storeId)}` +
    `&and=(processed_at.gte.${encodeURIComponent(utcBounds.min)},processed_at.lte.${encodeURIComponent(utcBounds.max)})` +
    `&type=neq.payout&select=type,amount,fee,net&limit=1000`
  ).catch(() => []);

  // Check if store has any BT charges — if not, use orders fallback
  const hasCharges = (btRows ?? []).some(t => (t.type || '').toLowerCase() === 'charge');
  if (!hasCharges) {
    console.log(`[tz-sync] No BT charges for ${storeId} on ${dateStr}, using orders fallback`);
    return computePnLFromOrders(storeId, dateStr, tz);
  }

  // ── Universal BT calculator ──
  const { calculateFromBT } = await import('@/lib/pnl/btCalculator');
  const r = calculateFromBT(btRows ?? []);

  const adSpend = await getAdSpendForDate(storeId, dateStr);

  const netProfit = Math.round((r.netRevenue - adSpend) * 100) / 100;
  const margin = r.revenue > 0 ? Math.round((netProfit / r.revenue) * 10000) / 100 : 0;

  await rest(
    '/daily_pnl_snapshots?on_conflict=store_id,date',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        store_id: storeId,
        date: dateStr,
        revenue: r.revenue,
        transaction_fees: r.fees,
        refunds: r.refunds,
        chargeback_loss: r.chargebackLoss,
        chargeback_won: r.chargebackWon,
        ad_spend: adSpend,
        net_profit: netProfit,
        margin,
        synced_at: new Date().toISOString(),
        shopify_synced: r.revenue > 0 || r.refunds > 0,
        meta_synced: adSpend > 0,
      }]),
    }
  );

  return { success: true, source: 'balance_transactions' };
}

// ── Resolve timezone for a store ────────────────────────────────────────

async function getStoreTimezone(storeId: string): Promise<string | null> {
  // 1. Try store_config.iana_timezone (most reliable — user-configured)
  try {
    const cfgRows = await rest<Array<{ iana_timezone: string | null }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=iana_timezone&limit=1`
    );
    if (cfgRows?.[0]?.iana_timezone) return cfgRows[0].iana_timezone;
  } catch { /* fall through */ }

  // 2. Try ad account timezone
  try {
    const adAccounts = await listPersistentStoreAdAccounts(storeId);
    const activeTz = adAccounts.find(a => a.is_active && a.timezone)?.timezone;
    if (activeTz) return activeTz;
  } catch { /* fall through */ }

  return null;
}

// ── Main cron handler ───────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const cronStart = Date.now();
  const nowUTC = new Date();

  const stores = await listPersistentStores();

  const storesSynced: Array<{ name: string; storeId: string; date: string; timezone: string }> = [];
  const storesSkipped: Array<{ name: string; storeId: string; reason: string }> = [];

  for (const store of stores) {
    const tz = await getStoreTimezone(store.id);

    if (!tz) {
      storesSkipped.push({ name: store.name || store.domain, storeId: store.id, reason: 'no timezone configured' });
      continue;
    }

    // What hour is it RIGHT NOW in this store's timezone?
    const storeHour = getHourInTz(nowUTC, tz);

    // Only sync when store time is hour 0 (midnight — the day just ended)
    if (storeHour !== 0) {
      storesSkipped.push({
        name: store.name || store.domain,
        storeId: store.id,
        reason: `store hour is ${storeHour}, not midnight`,
      });
      continue;
    }

    // Yesterday in store timezone (the day that just ended)
    const yesterday = new Date(nowUTC.getTime() - 24 * 60 * 60 * 1000);
    const targetDate = formatDateInTz(yesterday, tz);

    // Check dedup: skip if already synced for this date in last 2 hours
    try {
      const existing = await rest<Array<{ synced_at: string }>>(
        `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(store.id)}&date=eq.${targetDate}&select=synced_at&limit=1`
      );
      if (existing?.[0]?.synced_at) {
        const syncedAt = new Date(existing[0].synced_at);
        const hoursSinceSync = (nowUTC.getTime() - syncedAt.getTime()) / 1000 / 60 / 60;
        if (hoursSinceSync < 2) {
          storesSkipped.push({
            name: store.name || store.domain,
            storeId: store.id,
            reason: `already synced ${targetDate} ${Math.round(hoursSinceSync * 60)}m ago`,
          });
          continue;
        }
      }
    } catch { /* proceed with sync */ }

    // ── This store just hit midnight — sync it ──
    const storeStart = Date.now();
    try {
      // 1. Sync balance transactions from Shopify
      const btCount = await syncBalanceTransactionsForStore(store.id);
      console.log(`[tz-sync] ${store.name || store.domain}: synced ${btCount} BTs`);

      // 2. Compute P&L (BT primary, orders fallback for non-Shopify-Payments stores)
      const result = await computePnLForStore(store.id, targetDate, tz);
      if (!result.success) throw new Error(result.error || 'P&L compute failed');
      console.log(`[tz-sync] ${store.name || store.domain}: data source = ${result.source}`);

      const elapsed = Date.now() - storeStart;
      storesSynced.push({
        name: store.name || store.domain,
        storeId: store.id,
        date: targetDate,
        timezone: tz,
      });

      console.log(
        `[tz-sync] ✓ ${store.name || store.domain} synced ${targetDate} (midnight in ${tz}) [${elapsed}ms]`
      );

      // Log to cron_logs
      await rest('/cron_logs', {
        method: 'POST',
        body: JSON.stringify({
          cron_name: 'timezone-sync',
          store_id: store.id,
          status: 'success',
          rows_processed: 1,
          error: null,
          duration_ms: elapsed,
        }),
      }).catch(() => null);

    } catch (err) {
      const elapsed = Date.now() - storeStart;
      const message = err instanceof Error ? err.message : 'Unknown error';

      storesSkipped.push({
        name: store.name || store.domain,
        storeId: store.id,
        reason: `error: ${message}`,
      });

      console.error(`[tz-sync] ✗ ${store.name || store.domain}: ${message}`);

      await rest('/cron_logs', {
        method: 'POST',
        body: JSON.stringify({
          cron_name: 'timezone-sync',
          store_id: store.id,
          status: 'error',
          rows_processed: 0,
          error: message,
          duration_ms: elapsed,
        }),
      }).catch(() => null);

      await logStoreError(store.id, 'cron_timezone_sync', message).catch(() => null);
    }
  }

  const totalDuration = Date.now() - cronStart;

  return NextResponse.json({
    ok: true,
    cron: 'timezone-sync',
    utc_time: nowUTC.toISOString(),
    stores_checked: stores.length,
    stores_synced: storesSynced,
    stores_skipped: storesSkipped,
    duration_ms: totalDuration,
  });
}
