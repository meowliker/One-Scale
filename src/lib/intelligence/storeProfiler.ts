/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
import { rest } from '@/app/api/lib/supabase-persistence';
import type { ProductBehavior } from './behaviorExtractor';

/** Store-level behavioral profile derived from product behaviors. */
export interface StoreBehaviorProfile {
  store_id: string;
  avg_items_per_order: number;
  single_item_order_rate: number;
  multi_item_order_rate: number;
  funnel_signal_strength: number;
  median_alone_rate: number;
  p25_alone_rate: number;
  p75_alone_rate: number;
  median_revenue_share: number;
  top_product_revenue_share: number;
  inferred_structure: 'single_focus' | 'funnel' | 'catalog' | 'mixed';
  computed_at: string;
}

/** Row shape for the count query against shopify_orders_cache. */
interface OrderCountRow {
  line_items: string;
}

/**
 * Computes a percentile value from a pre-sorted numeric array.
 *
 * Uses linear interpolation between adjacent elements when the
 * percentile falls between two data points.
 *
 * @param sorted - Array of numbers sorted in ascending order.
 * @param p - Percentile to compute (0 to 1, e.g. 0.25 for p25).
 * @returns The interpolated value at the given percentile.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

/**
 * Builds a store-level behavior profile from individual product behaviors.
 *
 * Computes percentile distributions of alone rates, revenue concentration,
 * average items per order, and infers the store's structural archetype
 * (single_focus, funnel, catalog, or mixed).
 *
 * @param storeId - The store identifier.
 * @param behaviors - Array of ProductBehavior objects from extractAllProductBehaviors.
 * @returns A StoreBehaviorProfile describing the store's overall selling pattern.
 */
export async function buildStoreProfile(
  storeId: string,
  behaviors: ProductBehavior[]
): Promise<StoreBehaviorProfile> {
  const now = new Date().toISOString();

  // Default profile for empty behavior data
  if (behaviors.length === 0) {
    return {
      store_id: storeId,
      avg_items_per_order: 0,
      single_item_order_rate: 0,
      multi_item_order_rate: 0,
      funnel_signal_strength: 0,
      median_alone_rate: 0,
      p25_alone_rate: 0,
      p75_alone_rate: 0,
      median_revenue_share: 0,
      top_product_revenue_share: 0,
      inferred_structure: 'catalog',
      computed_at: now,
    };
  }

  // Compute alone_rate percentiles
  const sortedAloneRates = behaviors
    .map((b) => b.alone_rate)
    .sort((a, b) => a - b);

  const p25AloneRate = percentile(sortedAloneRates, 0.25);
  const medianAloneRate = percentile(sortedAloneRates, 0.5);
  const p75AloneRate = percentile(sortedAloneRates, 0.75);

  // Revenue share distribution
  const sortedRevenueShares = behaviors
    .map((b) => b.revenue_share)
    .sort((a, b) => a - b);

  const medianRevenueShare = percentile(sortedRevenueShares, 0.5);
  const topProductRevenueShare = Math.max(
    ...behaviors.map((b) => b.revenue_share)
  );

  // Compute avg_items_per_order from actual order data
  // Fetch orders to count total line items vs total orders
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sinceISO = ninetyDaysAgo.toISOString();

  const orderRows = await rest<OrderCountRow[]>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
      `&created_at=gte.${encodeURIComponent(sinceISO)}` +
      `&financial_status=neq.refunded` +
      `&order_status=neq.cancelled` +
      `&select=line_items`
  );

  let totalOrders = 0;
  let totalItems = 0;
  let singleItemOrders = 0;

  if (orderRows && orderRows.length > 0) {
    for (const row of orderRows) {
      let items: Array<{ product_id?: number | string }>;
      try {
        items =
          typeof row.line_items === 'string'
            ? JSON.parse(row.line_items)
            : (row.line_items as unknown as Array<{ product_id?: number | string }>);
      } catch {
        continue;
      }

      if (!Array.isArray(items) || items.length === 0) {
        continue;
      }

      const validItems = items.filter(
        (li) => li.product_id !== undefined && li.product_id !== null
      );

      if (validItems.length === 0) continue;

      totalOrders += 1;
      totalItems += validItems.length;

      if (validItems.length === 1) {
        singleItemOrders += 1;
      }
    }
  }

  const avgItemsPerOrder = totalOrders > 0 ? totalItems / totalOrders : 0;
  const singleItemOrderRate =
    totalOrders > 0 ? singleItemOrders / totalOrders : 0;
  const multiItemOrderRate = 1 - singleItemOrderRate;

  // Funnel signal strength: how spread out the alone_rates are
  // Range of alone_rates * 2, capped at 1
  const aloneRateRange =
    sortedAloneRates.length > 1
      ? sortedAloneRates[sortedAloneRates.length - 1] - sortedAloneRates[0]
      : 0;
  const funnelSignalStrength = Math.min(aloneRateRange * 2, 1);

  // Count products with significant orders (at least 3 orders)
  const significantProducts = behaviors.filter(
    (b) => b.total_orders >= 3
  ).length;

  // Infer structure
  let inferredStructure: StoreBehaviorProfile['inferred_structure'];

  if (significantProducts <= 2) {
    inferredStructure = 'single_focus';
  } else if (
    funnelSignalStrength > 0.5 &&
    topProductRevenueShare > 0.4
  ) {
    inferredStructure = 'funnel';
  } else if (aloneRateRange < 0.2) {
    inferredStructure = 'catalog';
  } else {
    inferredStructure = 'mixed';
  }

  return {
    store_id: storeId,
    avg_items_per_order: avgItemsPerOrder,
    single_item_order_rate: singleItemOrderRate,
    multi_item_order_rate: multiItemOrderRate,
    funnel_signal_strength: funnelSignalStrength,
    median_alone_rate: medianAloneRate,
    p25_alone_rate: p25AloneRate,
    p75_alone_rate: p75AloneRate,
    median_revenue_share: medianRevenueShare,
    top_product_revenue_share: topProductRevenueShare,
    inferred_structure: inferredStructure,
    computed_at: now,
  };
}
