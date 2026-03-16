import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
  listPersistentStoreAdAccounts,
  logStoreError,
} from '@/app/api/lib/supabase-persistence';
import { daysAgoInTimezone } from '@/lib/timezone';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import { getOrderFees } from '@/lib/pnl/orderFeeSync';
import { runAutoSync } from '@/lib/pnl/autoProductConfig';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

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

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
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

      // Yesterday in store timezone
      const yesterday = daysAgoInTimezone(1, tz);
      const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(yesterday, yesterday, tz);
      const enc = (v: string) => encodeURIComponent(v);

      // ── Order-date P&L: get orders by date, match BT by order_id ──
      // This matches what Shopify shows the merchant.

      // 1. Orders for yesterday (store timezone)
      const dayOrders = await rest<Array<{
        shopify_order_id: string; total_price: number; subtotal_price: number;
        financial_status: string; line_items: string;
      }>>(
        `/shopify_orders_cache?store_id=eq.${enc(store.id)}&and=(created_at.gte.${enc(tzStart)},created_at.lte.${enc(tzEnd)})&select=shopify_order_id,total_price,subtotal_price,financial_status,line_items&limit=1000`
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
      const btByDate = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
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

      // 4. Ad spend from meta_spend_cache
      const spendRows = await rest<Array<{ spend: number }>>(
        `/meta_spend_cache?store_id=eq.${enc(store.id)}&date=eq.${yesterday}&select=spend`
      ).catch(() => []);
      const totalAdSpend = spendRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);

      // 5. Product breakdown (using product_config classification)
      const productConfigRows = await rest<Array<{ product_id: string }>>(
        `/product_config?store_id=eq.${enc(store.id)}&is_active=eq.true&select=product_id`
      ).catch(() => []);
      const configMainIds = new Set(productConfigRows.map(r => r.product_id));

      interface ProdAcc { title: string; units: number; revenue: number; fees: number; orders: number; classification: string; }
      const prodMap = new Map<string, ProdAcc>();
      let lineItemTotal = 0;

      for (const o of paidOrders) {
        let items: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number }>;
        try { items = typeof o.line_items === 'string' ? JSON.parse(o.line_items) : o.line_items || []; } catch { continue; }

        const oid = String(o.shopify_order_id);
        const orderFee = orderFeeMap.get(oid) ?? 0;
        const orderLineTotal = items.reduce((s, i) => s + parseFloat(i.price ?? '0') * (i.quantity ?? 1), 0);

        for (const item of items) {
          const pid = item.product_id ? String(item.product_id) : '';
          if (!pid || pid === 'null' || pid === '0') continue;
          const lineRev = parseFloat(item.price ?? '0') * (item.quantity ?? 1);
          const lineFee = orderLineTotal > 0 ? orderFee * (lineRev / orderLineTotal) : 0;
          lineItemTotal += lineRev;

          const cls = configMainIds.size > 0 ? (configMainIds.has(pid) ? 'main' : 'upsell') : 'unknown';
          const acc = prodMap.get(pid) || { title: item.title || '', units: 0, revenue: 0, fees: 0, orders: 0, classification: cls };
          acc.units += item.quantity ?? 1;
          acc.revenue += lineRev;
          acc.fees += lineFee;
          acc.orders++;
          prodMap.set(pid, acc);
        }
      }

      // Scale product revenue to match order total_price
      const revScale = (orderRevenue > 0 && lineItemTotal > 0) ? orderRevenue / lineItemTotal : 1;
      const productBreakdownArr = Array.from(prodMap.entries()).map(([pid, acc]) => ({
        productId: pid, productTitle: acc.title, classification: acc.classification,
        revenue: Math.round(acc.revenue * revScale * 100) / 100,
        unitsSold: acc.units, fees: Math.round(acc.fees * 100) / 100,
        orders: acc.orders,
      })).sort((a, b) => b.revenue - a.revenue);

      const netProfit = orderRevenue - totalFees - totalAdSpend - totalRefunds - totalCbLoss + totalCbWon + totalAdjustments;
      const margin = orderRevenue > 0 ? (netProfit / orderRevenue) * 100 : 0;

      // ── Save to both snapshot tables ──────────────────────────────────

      await rest('/pnl_snapshots', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          store_id: store.id, date: yesterday,
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
          store_id: store.id, date: yesterday,
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

      // Compute hourly sales profile from last 30 days of orders
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
      await logCron('daily-pnl-snapshot', store.id, 'success', 1, null, elapsed);
      results.push({ storeId: store.id, status: 'success', date: yesterday, warnings: 0 });
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
