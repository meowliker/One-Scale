import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  listPersistentStoreAdAccounts,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { fetchAllRestRows } from '@/app/api/lib/supabase-pagination';
import { daysAgoInTimezone } from '@/lib/timezone';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import { getOrderFees } from '@/lib/pnl/orderFeeSync';
import { runAutoSync } from '@/lib/pnl/autoProductConfig';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';
import { buildProductPerformance } from '@/lib/pnl/appsScriptPort';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

async function logCron(
  cronName: string,
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

/**
 * Sync recent balance transactions for a store before computing P&L.
 * This ensures fees, refunds, and chargebacks are up-to-date.
 */
async function syncBalanceTransactionsForStore(storeId: string): Promise<number> {
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) return 0;

  // Sync last 7 days (disputes update retroactively)
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

    let data: { transactions?: Array<{ id: number | string; type: string; amount: string; fee: string; net: string; currency: string; source_order_id?: number | string; source_type?: string; processed_at: string; payout_id?: number | string }> };
    try {
      data = await fetchFromShopify(
        token.accessToken,
        token.shopDomain,
        '/shopify_payments/balance/transactions.json',
        params,
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes('404')) break; // no Shopify Payments
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

// pg_cron uses net.http_post — accept both GET and POST
export async function POST(req: NextRequest) { return GET(req); }

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const allStores = await listPersistentStores();

  // Support single-store mode via ?store_id= param (avoids 60s Vercel timeout)
  const requestedStoreId = new URL(req.url).searchParams.get('store_id');
  const stores = requestedStoreId
    ? allStores.filter(s => s.id === requestedStoreId)
    : allStores;

  const results: Array<{ storeId: string; status: string; date?: string; warnings?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Get store timezone from ad accounts
      const adAccounts = await listPersistentStoreAdAccounts(store.id);
      const tz = adAccounts[0]?.timezone || 'America/New_York';

      // Sync balance transactions FIRST — P&L depends on this data
      try {
        const btCount = await syncBalanceTransactionsForStore(store.id);
        if (btCount > 0) console.log(`[daily-pnl] Synced ${btCount} balance txns for ${store.id}`);
      } catch (err) {
        console.warn(`[daily-pnl] Balance txn sync failed for ${store.id}:`, err instanceof Error ? err.message : err);
      }

      // Auto-sync: discover ad accounts → detect products → map accounts to products
      try {
        const syncResult = await runAutoSync(store.id);
        if (syncResult.adAccountsDiscovered > 0 || syncResult.productsDetected > 0 || syncResult.adMappingsSynced > 0) {
          console.log(`[daily-pnl] AutoSync ${store.id}: +${syncResult.adAccountsDiscovered} accounts, +${syncResult.productsDetected} products, +${syncResult.adMappingsSynced} mappings`);
        }
      } catch (err) {
        console.warn(`[daily-pnl] AutoSync failed for ${store.id}:`, err instanceof Error ? err.message : err);
      }

      // Recompute last 7 days to catch retroactive BT changes:
      // - Chargebacks won/lost (disputes resolved days/weeks later)
      // - Refund adjustments (partial refunds, reversals)
      // - Settlement corrections (1-3 day delay)
      // - Meta attribution retroactive updates (up to 7 days)
      // Default 7 days, override via ?days=30 for full backfill
      const RETROACTIVE_DAYS = parseInt(new URL(req.url).searchParams.get('days') || '7', 10);
      const enc = (v: string) => encodeURIComponent(v);

      for (let daysBack = 0; daysBack <= RETROACTIVE_DAYS; daysBack++) {
      const dayDate = daysAgoInTimezone(daysBack, tz);
      const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(dayDate, dayDate, tz);

      // ── Order-date P&L: get orders by date, match BT by order_id ──
      // This matches what Shopify shows the merchant.

      // 1. Orders for this day (store timezone)
      const dayOrders = await fetchAllRestRows<{
        shopify_order_id: string; total_price: number; subtotal_price: number;
        financial_status: string; line_items: string;
      }>(
        `/shopify_orders_cache?store_id=eq.${enc(store.id)}&and=(created_at.gte.${enc(tzStart)},created_at.lte.${enc(tzEnd)})&select=shopify_order_id,total_price,subtotal_price,financial_status,line_items`
      ).catch(() => []);

      const paidOrders = dayOrders.filter(o => o.financial_status !== 'refunded' && o.financial_status !== 'voided');
      const orderIds = paidOrders.map(o => String(o.shopify_order_id));
      const orderRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

      // 2. Exact fees for ALL orders (BT + Shopify API fallback — 100% coverage)
      const orderFeeMap = await getOrderFees(store.id, orderIds);

      // 3. Refunds, chargebacks, adjustments — by PROCESSED DATE (not order date).
      // A refund/chargeback processed on March 15 affects March 15 P&L,
      // even if the original order was from March 10.
      let totalRefunds = 0, totalCbLoss = 0, totalCbWon = 0, totalAdjustments = 0;
      const btByDate = await fetchAllRestRows<{ type: string; amount: string; fee: string; net: string }>(
        `/shopify_balance_transactions?store_id=eq.${enc(store.id)}&type=neq.charge&type=neq.payout&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=type,amount,fee,net`
      ).catch(() => []);

      for (const t of btByDate) {
        const amount = Math.abs(parseFloat(t.amount || '0'));
        const net = parseFloat(t.net || '0');
        switch (t.type) {
          case 'refund':
            totalRefunds += amount;
            break;
          case 'dispute':
            if (net < 0) totalCbLoss += Math.abs(net);
            else totalCbWon += net;
            break;
          case 'adjustment': case 'debit':
            totalAdjustments += parseFloat(t.amount || '0'); // can be negative
            break;
          case 'credit':
            totalAdjustments += parseFloat(t.amount || '0'); // positive
            break;
          // reserved_funds, marketplace_tax — tracked but don't affect net P&L directly
        }
      }

      // 4. Compute totals — fees from exact per-order matching
      let totalFees = 0;
      for (const o of paidOrders) {
        totalFees += orderFeeMap.get(String(o.shopify_order_id)) ?? 0;
      }

      // 4. Ad spend from meta_spend_cache — ONLY for mapped ad accounts
      // Use meta_ad_account_mappings as source of truth (not store_ad_accounts which has cross-store pollution)
      const mappedAccounts = await rest<Array<{ ad_account_id: string }>>(
        `/meta_ad_account_mappings?store_id=eq.${enc(store.id)}&select=ad_account_id`
      ).catch(() => []);
      const mappedAccountIds = [...new Set(mappedAccounts.map(a => a.ad_account_id))];

      let totalAdSpend = 0;
      if (mappedAccountIds.length > 0) {
        const accountFilter = mappedAccountIds.map(id => enc(id)).join(',');
        const spendRows = await rest<Array<{ spend: number }>>(
          `/meta_spend_cache?store_id=eq.${enc(store.id)}&ad_account_id=in.(${accountFilter})&date=eq.${dayDate}&select=spend`
        ).catch(() => []);
        totalAdSpend = spendRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);
      }

      // 5. Product breakdown (using buildProductPerformance with full rollup)
      // Ensures snapshot product_breakdown matches Product Performance UI exactly
      let productBreakdownArr: Array<{ productId: string; productTitle: string; classification: string; revenue: number; unitsSold: number; fees: number; orders: number }> = [];
      try {
        const productResults = await buildProductPerformance(store.id, dayDate, dayDate);
        productBreakdownArr = productResults
          .filter(p => p.orders > 0 || p.revenue > 0)
          .map(p => ({
            productId: p.product_id,
            productTitle: p.product_name,
            classification: p.classification,
            revenue: Math.round(p.revenue * 100) / 100,
            unitsSold: p.orders,
            fees: Math.round(p.fees * 100) / 100,
            orders: p.orders,
          }))
          .sort((a, b) => b.revenue - a.revenue);

        // Ensure 100% revenue coverage — any unmatched revenue goes to "Other Orders"
        const productRevSum = productBreakdownArr.reduce((s, p) => s + p.revenue, 0);
        const productFeeSum = productBreakdownArr.reduce((s, p) => s + p.fees, 0);
        const productOrderSum = new Set(productBreakdownArr.filter(p => p.classification === 'main').map(p => p.orders)).size > 0
          ? productBreakdownArr.filter(p => p.classification === 'main').reduce((s, p) => s + p.orders, 0)
          : 0;
        const revenueGap = Math.round((orderRevenue - productRevSum) * 100) / 100;
        const feeGap = Math.round((totalFees - productFeeSum) * 100) / 100;
        const orderGap = paidOrders.length - productOrderSum;

        if (revenueGap > 0.01 || orderGap > 0) {
          productBreakdownArr.push({
            productId: 'unassigned',
            productTitle: 'Other Orders',
            classification: 'unknown',
            revenue: revenueGap > 0 ? revenueGap : 0,
            unitsSold: orderGap > 0 ? orderGap : 0,
            fees: feeGap > 0 ? feeGap : 0,
            orders: orderGap > 0 ? orderGap : 0,
          });
        }
      } catch (err) {
        console.warn(`[daily-pnl] Product breakdown failed for ${store.id}/${dayDate}:`, err instanceof Error ? err.message : err);
      }

      const netProfit = orderRevenue - totalFees - totalAdSpend - totalRefunds - totalCbLoss + totalCbWon + totalAdjustments;
      const margin = orderRevenue > 0 ? (netProfit / orderRevenue) * 100 : 0;

      // ── Save to both snapshot tables ──────────────────────────────────

      await rest('/pnl_snapshots', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: store.id, date: dayDate,
          revenue: orderRevenue,
          net_revenue: orderRevenue - totalRefunds,
          ad_spend: totalAdSpend, cogs: 0,
          payment_fees: totalFees, handling_fees: 0,
          chargebacks: totalCbLoss, refunds: totalRefunds,
          net_profit: netProfit, margin: Math.round(margin * 100) / 100,
          order_count: paidOrders.length, cancelled_count: 0,
          currency: 'USD',
          product_breakdown: JSON.stringify(productBreakdownArr),
          campaign_breakdown: '{}',
          computed_at: new Date().toISOString(),
        }),
      });

      await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          store_id: store.id, date: dayDate,
          revenue: orderRevenue,
          order_count: paidOrders.length,
          cogs: 0,
          ad_spend: totalAdSpend,
          shipping_cost: 0,
          transaction_fees: totalFees,
          refunds: totalRefunds,
          full_refund_count: 0, partial_refund_count: 0,
          full_refund_amount: 0, partial_refund_amount: 0,
          chargeback_loss: totalCbLoss,
          chargeback_won: totalCbWon,
          adjustments: totalAdjustments,
          net_profit: netProfit,
          margin,
          attribution_rate: 0,
          warnings: '[]',
          product_breakdown: JSON.stringify(productBreakdownArr),
          fee_method: orderFeeMap.size > 0 ? 'bt_exact' : 'none',
          synced_at: new Date().toISOString(),
          shopify_synced: paidOrders.length > 0,
          meta_synced: totalAdSpend > 0,
        }]),
      });

      } // end retroactive days loop

      // Compute hourly sales profile from last 30 days of orders (once per store)
      try {
        const thirtyDaysAgo = daysAgoInTimezone(30, tz);
        const orderHours = await rest<Array<{ created_at: string }>>(
          `/shopify_orders_cache?store_id=eq.${encodeURIComponent(store.id)}&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=created_at`
        );

        if (orderHours.length > 0) {
          const hourBuckets = new Array(24).fill(0);
          for (const o of orderHours) {
            const hour = new Date(o.created_at).getUTCHours();
            hourBuckets[hour]++;
          }
          const total = hourBuckets.reduce((a: number, b: number) => a + b, 0);
          if (total > 0) {
            const profile = hourBuckets.map((count: number) => Math.round((count / total) * 10000) / 10000);
            await rest(
              `/pnl_store_settings?store_id=eq.${encodeURIComponent(store.id)}`,
              {
                method: 'PATCH',
                body: JSON.stringify({ hourly_sales_profile: profile }),
              }
            );
          }
        }
      } catch {
        // Non-critical — profile computation failure doesn't block snapshot
      }

      const elapsed = Date.now() - start;
      await logCron('daily-pnl-snapshot', store.id, 'success', RETROACTIVE_DAYS, null, elapsed);
      results.push({ storeId: store.id, status: 'success', date: `last ${RETROACTIVE_DAYS} days`, warnings: 0 });
    } catch (err) {
      const elapsed = Date.now() - start;
      const message = err instanceof Error ? err.message : 'Unknown error';
      await logCron('daily-pnl-snapshot', store.id, 'error', 0, message, elapsed).catch(() => {});
      await logStoreError(store.id, 'cron_daily_pnl_snapshot', message);
      results.push({ storeId: store.id, status: 'error', error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'daily-pnl-snapshot',
    runAt: new Date().toISOString(),
    results,
  });
}
