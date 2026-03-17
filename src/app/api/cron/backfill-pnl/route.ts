/**
 * Backfill P&L — Recompute daily_pnl_snapshots for a date range.
 *
 * Uses the same order-date logic as daily-pnl-snapshot cron:
 * - Revenue from shopify_orders_cache.total_price
 * - Fees from BT per order_id (exact) + Shopify API fallback
 * - Refunds/chargebacks by processed_at date
 * - Ad spend from meta_spend_cache
 * - Product breakdown with product_config classification
 *
 * Usage: GET /api/cron/backfill-pnl?storeId=xxx&from=2026-02-15&to=2026-03-16
 * Auth: Bearer CRON_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import { getOrderFees } from '@/lib/pnl/orderFeeSync';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const storeId = req.nextUrl.searchParams.get('storeId');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');

  if (!storeId || !from || !to) {
    return NextResponse.json({ error: 'storeId, from, to required' }, { status: 400 });
  }

  // Get store timezone
  const tzRows = await rest<Array<{ timezone: string | null }>>(
    `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
  ).catch(() => []);
  const tz = tzRows[0]?.timezone || 'America/New_York';

  // Get product_config for classification
  const productConfigRows = await rest<Array<{ product_id: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id`
  ).catch(() => []);
  const configMainIds = new Set(productConfigRows.map(r => r.product_id));

  // Generate date list
  const dates: string[] = [];
  const startDate = new Date(from + 'T00:00:00Z');
  const endDate = new Date(to + 'T00:00:00Z');
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  const results: Array<{ date: string; status: string; revenue?: number; orders?: number }> = [];

  for (const date of dates) {
    try {
      const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(date, date, tz);

      // 1. Orders for this date
      const dayOrders = await rest<Array<{
        shopify_order_id: string; total_price: number; subtotal_price: number;
        financial_status: string; line_items: string;
      }>>(
        `/shopify_orders_cache?store_id=eq.${enc(storeId)}&and=(created_at.gte.${enc(tzStart)},created_at.lte.${enc(tzEnd)})&select=shopify_order_id,total_price,subtotal_price,financial_status,line_items&limit=1000`
      ).catch(() => []);

      const paidOrders = dayOrders.filter(o => o.financial_status !== 'refunded' && o.financial_status !== 'voided');
      const orderIds = paidOrders.map(o => String(o.shopify_order_id));
      const orderRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

      // 2. Exact fees per order
      const orderFeeMap = await getOrderFees(storeId, orderIds);

      // 3. Refunds/chargebacks by processed_at
      let totalRefunds = 0, totalCbLoss = 0, totalCbWon = 0, totalCbFees = 0, totalDebits = 0, totalCredits = 0, totalReserve = 0;
      const btByDate = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
        `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=neq.charge&type=neq.payout&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=type,amount,fee,net`
      ).catch(() => []);

      for (const t of btByDate) {
        const amount = parseFloat(t.amount || '0');
        const fee = Math.abs(parseFloat(t.fee || '0'));
        const net = parseFloat(t.net || '0');
        switch (t.type) {
          case 'refund': totalRefunds += Math.abs(amount); break;
          case 'dispute':
            if (fee > 0) totalCbFees += fee;
            if (net < 0) totalCbLoss += Math.abs(net) - fee;
            else totalCbWon += net;
            break;
          case 'reserve': totalReserve += amount; break;
          case 'credit': totalCredits += amount; break;
          case 'debit': case 'adjustment': totalDebits += Math.abs(amount); break;
        }
      }

      // 4. Ad spend
      const spendRows = await rest<Array<{ spend: number }>>(
        `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=eq.${date}&select=spend`
      ).catch(() => []);
      const totalAdSpend = spendRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);

      // 5. Fees total
      let totalFees = 0;
      for (const o of paidOrders) {
        totalFees += orderFeeMap.get(String(o.shopify_order_id)) ?? 0;
      }

      // 6. Product breakdown
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

      const revScale = (orderRevenue > 0 && lineItemTotal > 0) ? orderRevenue / lineItemTotal : 1;
      const productBreakdownArr = Array.from(prodMap.entries()).map(([pid, acc]) => ({
        productId: pid, productTitle: acc.title, classification: acc.classification,
        revenue: Math.round(acc.revenue * revScale * 100) / 100,
        unitsSold: acc.units, fees: Math.round(acc.fees * 100) / 100, orders: acc.orders,
      })).sort((a, b) => b.revenue - a.revenue);

      const netProfit = orderRevenue - totalFees - totalAdSpend - totalRefunds - totalCbLoss - totalCbFees - totalDebits + totalCbWon + totalCredits;
      const margin = orderRevenue > 0 ? (netProfit / orderRevenue) * 100 : 0;

      // 7. Save — every cost type separate, nothing hidden
      await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          store_id: storeId, date,
          revenue: orderRevenue, order_count: paidOrders.length,
          cogs: 0, ad_spend: totalAdSpend, shipping_cost: 0,
          transaction_fees: totalFees, refunds: totalRefunds,
          full_refund_count: 0, partial_refund_count: 0,
          full_refund_amount: 0, partial_refund_amount: 0,
          chargeback_loss: totalCbLoss, chargeback_won: totalCbWon,
          chargeback_fees: totalCbFees, debits: totalDebits,
          credits: totalCredits, reserve_hold: totalReserve,
          net_profit: netProfit, margin,
          warnings: '[]',
          product_breakdown: JSON.stringify(productBreakdownArr),
          fee_method: orderFeeMap.size > 0 ? 'bt_exact' : 'none',
          synced_at: new Date().toISOString(),
          shopify_synced: paidOrders.length > 0,
          meta_synced: totalAdSpend > 0,
        }]),
      });

      results.push({ date, status: 'ok', revenue: orderRevenue, orders: paidOrders.length });
    } catch (err) {
      results.push({ date, status: 'error: ' + (err instanceof Error ? err.message : String(err)) });
    }
  }

  return NextResponse.json({ ok: true, storeId, from, to, daysProcessed: results.length, results });
}
