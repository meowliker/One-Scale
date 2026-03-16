/**
 * Compute P&L for a single date — single source of truth.
 *
 * Used by: timezone-sync, daily-pnl-snapshot, backfill-pnl, product-breakdown.
 *
 * Every cost type is tracked separately and verifiable:
 *   Revenue - Fees - Ad Spend - Refunds - CB Loss - CB Fees - Debits - Reserves + CB Won + Credits = Net Profit
 *
 * BT types auto-detected:
 *   charge      → Revenue (amount) + Transaction Fees (fee)
 *   refund      → Refunds
 *   dispute     → CB Loss (net<0) | CB Won (net>0) | CB Fee (fee field, always $15)
 *   reserve     → Reserve Hold (Shopify holding money temporarily)
 *   credit      → Credits (Shopify giving money back, e.g., chargeback fee refund)
 *   debit       → Debits (Shopify charging you, e.g., subscription, label)
 *   payout      → Skip (bank transfer, not a cost)
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { getStoreDateRangeForPeriod } from '@/lib/pnl/dateUtils';
import { getOrderFees } from '@/lib/pnl/orderFeeSync';

const enc = (v: string) => encodeURIComponent(v);

// ── Types ────────────────────────────────────────────────

export interface DayCosts {
  refunds: number;
  chargebackLoss: number;
  chargebackWon: number;
  chargebackFees: number;   // $15 per dispute
  reserveHold: number;      // money held by Shopify (temporary)
  credits: number;          // Shopify credits to you
  debits: number;           // Shopify charges to you
}

export interface DayPnLResult {
  date: string;
  revenue: number;
  orderCount: number;
  fees: number;             // transaction processing fees
  adSpend: number;
  costs: DayCosts;          // every cost type separate
  netProfit: number;
  margin: number;
  productBreakdown: string; // JSON
}

// ── Main Computation ─────────────────────────────────────

export async function computeDayPnL(storeId: string, date: string, tz: string): Promise<DayPnLResult> {
  const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(date, date, tz);

  // 1. Orders for this date (store timezone)
  const dayOrders = await rest<Array<{
    shopify_order_id: string; total_price: number; financial_status: string; line_items: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&and=(created_at.gte.${enc(tzStart)},created_at.lte.${enc(tzEnd)})&select=shopify_order_id,total_price,financial_status,line_items&limit=1000`
  ).catch(() => []);

  const paidOrders = dayOrders.filter(o => o.financial_status !== 'refunded' && o.financial_status !== 'voided');
  const orderIds = paidOrders.map(o => String(o.shopify_order_id));
  const orderRevenue = paidOrders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);

  // 2. Exact fees per order (BT + Shopify API fallback — 100% coverage)
  const orderFeeMap = await getOrderFees(storeId, orderIds);
  let totalFees = 0;
  for (const o of paidOrders) totalFees += orderFeeMap.get(String(o.shopify_order_id)) ?? 0;

  // 3. ALL non-charge BT by processed date — auto-detect every type
  const costs: DayCosts = {
    refunds: 0, chargebackLoss: 0, chargebackWon: 0, chargebackFees: 0,
    reserveHold: 0, credits: 0, debits: 0,
  };

  const btByDate = await rest<Array<{ type: string; amount: string; fee: string; net: string }>>(
    `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=neq.charge&type=neq.payout&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=type,amount,fee,net`
  ).catch(() => []);

  for (const t of btByDate) {
    const amount = parseFloat(t.amount || '0');
    const fee = Math.abs(parseFloat(t.fee || '0'));
    const net = parseFloat(t.net || '0');

    switch (t.type) {
      case 'refund':
        costs.refunds += Math.abs(amount);
        break;
      case 'dispute':
        if (fee > 0) costs.chargebackFees += fee;         // $15 per dispute
        if (net < 0) costs.chargebackLoss += Math.abs(net) - fee; // loss excluding fee
        else costs.chargebackWon += net;
        break;
      case 'reserve':
        costs.reserveHold += amount; // negative = held, positive = released
        break;
      case 'credit':
        costs.credits += amount; // positive
        break;
      case 'debit': case 'adjustment':
        costs.debits += Math.abs(amount); // always a cost
        break;
    }
  }

  // 4. Ad spend from meta_spend_cache
  const spendRows = await rest<Array<{ spend: number }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=eq.${date}&select=spend`
  ).catch(() => []);
  const totalAdSpend = spendRows.reduce((s, r) => s + (Number(r.spend) || 0), 0);

  // 5. Product breakdown with product_config classification
  const productConfigRows = await rest<Array<{ product_id: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id`
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

  const revScale = (orderRevenue > 0 && lineItemTotal > 0) ? orderRevenue / lineItemTotal : 1;
  const productBreakdownArr = Array.from(prodMap.entries()).map(([pid, acc]) => ({
    productId: pid, productTitle: acc.title, classification: acc.classification,
    revenue: Math.round(acc.revenue * revScale * 100) / 100,
    unitsSold: acc.units, fees: Math.round(acc.fees * 100) / 100, orders: acc.orders,
  })).sort((a, b) => b.revenue - a.revenue);

  // 6. Net profit — every line item verifiable
  // Revenue - Fees - Ad Spend - Refunds - CB Loss - CB Fees - Debits + CB Won + Credits = Net Profit
  // Reserve is NOT in P&L — it's cash flow (Shopify holding money, not a cost or income)
  const netProfit = orderRevenue
    - totalFees
    - totalAdSpend
    - costs.refunds
    - costs.chargebackLoss
    - costs.chargebackFees
    - costs.debits
    + costs.chargebackWon
    + costs.credits;

  const margin = orderRevenue > 0 ? (netProfit / orderRevenue) * 100 : 0;

  return {
    date, revenue: orderRevenue, orderCount: paidOrders.length,
    fees: totalFees, adSpend: totalAdSpend, costs,
    netProfit, margin, productBreakdown: JSON.stringify(productBreakdownArr),
  };
}

// ── Save to DB ───────────────────────────────────────────

export async function computeAndSaveDayPnL(storeId: string, date: string, tz: string): Promise<DayPnLResult> {
  const pnl = await computeDayPnL(storeId, date, tz);

  await rest('/daily_pnl_snapshots?on_conflict=store_id,date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      store_id: storeId, date: pnl.date,
      revenue: pnl.revenue, order_count: pnl.orderCount,
      cogs: 0, ad_spend: pnl.adSpend, shipping_cost: 0,
      transaction_fees: pnl.fees, refunds: pnl.costs.refunds,
      chargeback_loss: pnl.costs.chargebackLoss,
      chargeback_won: pnl.costs.chargebackWon,
      chargeback_fees: pnl.costs.chargebackFees,
      debits: pnl.costs.debits,
      credits: pnl.costs.credits,
      reserve_hold: pnl.costs.reserveHold,
      net_profit: pnl.netProfit, margin: pnl.margin,
      warnings: '[]',
      product_breakdown: pnl.productBreakdown,
      fee_method: 'bt_exact',
      synced_at: new Date().toISOString(),
      shopify_synced: pnl.orderCount > 0,
      meta_synced: pnl.adSpend > 0,
    }]),
  });

  return pnl;
}
