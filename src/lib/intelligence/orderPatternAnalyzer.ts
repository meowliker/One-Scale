/**
 * Order Pattern Analyzer
 *
 * For every active product, analyzes last 60 days of orders to produce
 * detailed signals used by the signal stack classifier.
 * Only returns full patterns for products with ≥10 orders.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { ProductOrderPattern } from './types';

interface OrderRow {
  shopify_order_id: string;
  line_items: string;
  total_price: number;
  created_at: string;
}

interface LineItem {
  product_id?: string | number;
  title?: string;
  price?: string;
  quantity?: number;
  requires_selling_plan?: boolean;
  product_type?: string;
}

interface ProductAccumulator {
  title: string;
  productType: string;
  tags: string;
  totalOrders: number;
  aloneOrders: number;
  firstPositionOrders: number;
  positionSum: number;
  positionCount: number;
  unitsSum: number;
  revenueSum: number;
  prices: number[];
  requiresSellingPlan: boolean;
  // Track co-purchases: productId → count
  coPurchases: Map<string, { title: string; count: number }>;
  // Upsell app detection: never first AND never alone
  neverFirst: boolean;
  neverAlone: boolean;
}

const MIN_ORDERS_FOR_ANALYSIS = 10;

export async function analyzeOrderPatterns(storeId: string): Promise<ProductOrderPattern[]> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
  const enc = (v: string) => encodeURIComponent(v);

  const orders = await rest<OrderRow[]>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${sixtyDaysAgo}T00:00:00&order_status=neq.cancelled&financial_status=neq.refunded&select=shopify_order_id,line_items,total_price,created_at`
  );

  // Fetch product metadata from product_intelligence
  const productIntel = await rest<Array<{
    product_id: string;
    tags: string;
    product_type: string;
  }>>(
    `/product_intelligence?store_id=eq.${enc(storeId)}&select=product_id,tags,product_type`
  ).catch(() => []);
  const intelMap = new Map(productIntel.map(p => [p.product_id, p]));

  // Build per-product accumulators
  const accumulators = new Map<string, ProductAccumulator>();
  let totalStoreRevenue = 0;

  for (const order of orders) {
    let lineItems: LineItem[];
    try {
      lineItems = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    if (lineItems.length === 0) continue;

    // Get unique product IDs in this order
    const productIdsInOrder = new Map<string, string>(); // id → title
    for (const item of lineItems) {
      const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
      if (!productIdsInOrder.has(pid)) {
        productIdsInOrder.set(pid, item.title || '');
      }
    }
    const isAloneOrder = productIdsInOrder.size === 1;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
      const price = parseFloat(item.price || '0');
      const quantity = item.quantity || 1;
      const lineRevenue = price * quantity;
      const isFirst = i === 0;

      totalStoreRevenue += lineRevenue;

      const intel = intelMap.get(pid);

      const acc = accumulators.get(pid);
      if (acc) {
        acc.totalOrders++;
        if (isAloneOrder) acc.aloneOrders++;
        if (isFirst) {
          acc.firstPositionOrders++;
          acc.neverFirst = false;
        }
        acc.positionSum += i;
        acc.positionCount++;
        acc.unitsSum += quantity;
        acc.revenueSum += lineRevenue;
        acc.prices.push(price);
        if (!isAloneOrder) acc.neverAlone = false;
        if (item.requires_selling_plan) acc.requiresSellingPlan = true;

        // Track co-purchases
        for (const [otherId, otherTitle] of productIdsInOrder) {
          if (otherId !== pid) {
            const existing = acc.coPurchases.get(otherId);
            if (existing) {
              existing.count++;
            } else {
              acc.coPurchases.set(otherId, { title: otherTitle, count: 1 });
            }
          }
        }
      } else {
        const coPurchases = new Map<string, { title: string; count: number }>();
        for (const [otherId, otherTitle] of productIdsInOrder) {
          if (otherId !== pid) {
            coPurchases.set(otherId, { title: otherTitle, count: 1 });
          }
        }

        accumulators.set(pid, {
          title: item.title || '',
          productType: intel?.product_type || item.product_type || '',
          tags: intel?.tags || '',
          totalOrders: 1,
          aloneOrders: isAloneOrder ? 1 : 0,
          firstPositionOrders: isFirst ? 1 : 0,
          positionSum: i,
          positionCount: 1,
          unitsSum: quantity,
          revenueSum: lineRevenue,
          prices: [price],
          requiresSellingPlan: !!item.requires_selling_plan,
          coPurchases,
          neverFirst: !isFirst,
          neverAlone: isAloneOrder,
        });
      }
    }
  }

  // Convert accumulators to ProductOrderPattern
  const results: ProductOrderPattern[] = [];

  for (const [pid, acc] of accumulators) {
    const alonePct = acc.totalOrders > 0 ? (acc.aloneOrders / acc.totalOrders) * 100 : 0;
    const firstPositionPct = acc.totalOrders > 0 ? (acc.firstPositionOrders / acc.totalOrders) * 100 : 0;
    const avgPosition = acc.positionCount > 0 ? acc.positionSum / acc.positionCount : 0;
    const avgUnitsPerOrder = acc.totalOrders > 0 ? acc.unitsSum / acc.totalOrders : 0;
    const revenueShare = totalStoreRevenue > 0 ? (acc.revenueSum / totalStoreRevenue) * 100 : 0;
    const avgPrice = acc.prices.length > 0
      ? acc.prices.reduce((a, b) => a + b, 0) / acc.prices.length
      : 0;

    // Upsell app detection: product that never appears first AND never alone
    // with sufficient order count → likely injected by an upsell app
    const addedProgrammaticallyPct = (acc.neverFirst && !acc.neverAlone && acc.totalOrders >= 5)
      ? 100
      : 0;

    // Build co-purchased products array (top 10)
    const coPurchased = Array.from(acc.coPurchases.entries())
      .map(([cpId, data]) => ({
        product_id: cpId,
        product_title: data.title,
        co_purchase_count: data.count,
        co_purchase_pct: acc.totalOrders > 0 ? (data.count / acc.totalOrders) * 100 : 0,
      }))
      .sort((a, b) => b.co_purchase_count - a.co_purchase_count)
      .slice(0, 10);

    results.push({
      product_id: pid,
      product_title: acc.title,
      product_type: acc.productType,
      tags: acc.tags,
      price: Math.round(avgPrice * 100) / 100,
      total_orders: acc.totalOrders,
      alone_orders: acc.aloneOrders,
      alone_pct: Math.round(alonePct * 10) / 10,
      first_position_orders: acc.firstPositionOrders,
      first_position_pct: Math.round(firstPositionPct * 10) / 10,
      avg_position: Math.round(avgPosition * 100) / 100,
      avg_units_per_order: Math.round(avgUnitsPerOrder * 100) / 100,
      revenue_share: Math.round(revenueShare * 10) / 10,
      co_purchased_products: coPurchased,
      added_programmatically_pct: addedProgrammaticallyPct,
      requires_selling_plan: acc.requiresSellingPlan,
    });
  }

  return results;
}

/**
 * Returns patterns only for products with sufficient data (≥10 orders).
 * Products with <10 orders are returned separately as pending.
 */
export function partitionByDataSufficiency(
  patterns: ProductOrderPattern[],
): { sufficient: ProductOrderPattern[]; pending: ProductOrderPattern[] } {
  const sufficient: ProductOrderPattern[] = [];
  const pending: ProductOrderPattern[] = [];
  for (const p of patterns) {
    if (p.total_orders >= MIN_ORDERS_FOR_ANALYSIS) {
      sufficient.push(p);
    } else {
      pending.push(p);
    }
  }
  return { sufficient, pending };
}
