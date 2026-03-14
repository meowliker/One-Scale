import { rest } from '@/app/api/lib/supabase-persistence';

/** A single line item parsed from the shopify_orders_cache JSON. */
interface ParsedLineItem {
  product_id?: number | string;
  title?: string;
  sku?: string;
  price?: string;
  quantity?: number;
}

/** A row from shopify_orders_cache relevant to behavior extraction. */
interface OrderRow {
  store_id: string;
  shopify_order_id: string;
  total_price: string;
  subtotal_price: string;
  financial_status: string;
  order_status: string;
  line_items: string;
  created_at: string;
  total_shipping_price: string;
}

/** Companion product that frequently appears alongside a given product. */
interface CompanionProduct {
  product_id: string;
  product_title: string;
  co_count: number;
  co_rate: number;
}

/** Full behavioral signal profile for a single product. */
export interface ProductBehavior {
  product_id: string;
  product_title: string;
  store_id: string;
  total_orders: number;
  alone_orders: number;
  alone_rate: number;
  first_position_orders: number;
  first_rate: number;
  avg_position: number;
  total_revenue: number;
  revenue_share: number;
  avg_order_value_with: number;
  avg_order_value_without: number;
  total_co_occurrences: number;
  co_occurrence_rate: number;
  top_companions: CompanionProduct[];
  value_lift: number;
  first_seen: string;
  last_seen: string;
  active_days: number;
}

/** Internal accumulator for building per-product stats. */
interface ProductAccumulator {
  product_id: string;
  product_title: string;
  total_orders: number;
  alone_orders: number;
  first_position_orders: number;
  position_sum: number;
  total_revenue: number;
  order_values: number[];
  co_occurrences: Map<string, { title: string; count: number }>;
  dates: Set<string>;
  first_seen: string;
  last_seen: string;
}

/**
 * Extracts raw behavioral signals for every product sold in the last 90 days.
 *
 * Performs a single DB query against `shopify_orders_cache`, then computes all
 * per-product metrics (alone rate, position, co-occurrence, value lift, etc.)
 * entirely in memory.
 *
 * @param storeId - The store identifier to query orders for.
 * @returns Array of ProductBehavior objects, one per unique product.
 */
export async function extractAllProductBehaviors(
  storeId: string
): Promise<ProductBehavior[]> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const sinceISO = ninetyDaysAgo.toISOString();

  // Single query: all non-cancelled, non-refunded orders from last 90 days
  const orders = await rest<OrderRow[]>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}` +
      `&created_at=gte.${encodeURIComponent(sinceISO)}` +
      `&financial_status=neq.refunded` +
      `&order_status=neq.cancelled` +
      `&select=store_id,shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items,created_at,total_shipping_price`
  );

  if (!orders || orders.length === 0) {
    return [];
  }

  // Parse all orders and their line items
  interface ParsedOrder {
    order_id: string;
    total_price: number;
    created_at: string;
    date_key: string;
    items: Array<{
      product_id: string;
      title: string;
      price: number;
      quantity: number;
    }>;
  }

  const parsedOrders: ParsedOrder[] = [];
  let totalStoreRevenue = 0;

  for (const order of orders) {
    let rawItems: ParsedLineItem[];
    try {
      rawItems =
        typeof order.line_items === 'string'
          ? JSON.parse(order.line_items)
          : (order.line_items as unknown as ParsedLineItem[]);
    } catch {
      continue;
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      continue;
    }

    const orderTotal = parseFloat(order.total_price) || 0;
    totalStoreRevenue += orderTotal;
    const dateKey = order.created_at.slice(0, 10); // YYYY-MM-DD

    const items = rawItems
      .filter(
        (li) => li.product_id !== undefined && li.product_id !== null
      )
      .map((li) => ({
        product_id: String(li.product_id),
        title: li.title || 'Unknown Product',
        price: parseFloat(li.price || '0'),
        quantity: li.quantity || 1,
      }));

    if (items.length === 0) {
      continue;
    }

    parsedOrders.push({
      order_id: order.shopify_order_id,
      total_price: orderTotal,
      created_at: order.created_at,
      date_key: dateKey,
      items,
    });
  }

  if (parsedOrders.length === 0) {
    return [];
  }

  // Build per-product accumulators
  const accumulators = new Map<string, ProductAccumulator>();

  function getOrCreate(productId: string, title: string): ProductAccumulator {
    let acc = accumulators.get(productId);
    if (!acc) {
      acc = {
        product_id: productId,
        product_title: title,
        total_orders: 0,
        alone_orders: 0,
        first_position_orders: 0,
        position_sum: 0,
        total_revenue: 0,
        order_values: [],
        co_occurrences: new Map(),
        dates: new Set(),
        first_seen: '',
        last_seen: '',
      };
      accumulators.set(productId, acc);
    }
    return acc;
  }

  // Track which orders each product appears in (for avg_order_value_without)
  const productOrderSets = new Map<string, Set<number>>();

  for (let orderIdx = 0; orderIdx < parsedOrders.length; orderIdx++) {
    const order = parsedOrders[orderIdx];
    const isSingleItem = order.items.length === 1;
    const productIdsInOrder = new Set(order.items.map((it) => it.product_id));

    for (let pos = 0; pos < order.items.length; pos++) {
      const item = order.items[pos];
      const acc = getOrCreate(item.product_id, item.title);

      acc.total_orders += 1;
      acc.order_values.push(order.total_price);
      acc.position_sum += pos + 1; // 1-based
      acc.total_revenue += item.price * item.quantity;
      acc.dates.add(order.date_key);

      if (!acc.first_seen || order.created_at < acc.first_seen) {
        acc.first_seen = order.created_at;
      }
      if (!acc.last_seen || order.created_at > acc.last_seen) {
        acc.last_seen = order.created_at;
      }

      if (isSingleItem) {
        acc.alone_orders += 1;
      }

      if (pos === 0) {
        acc.first_position_orders += 1;
      }

      // Track order index for this product
      let orderSet = productOrderSets.get(item.product_id);
      if (!orderSet) {
        orderSet = new Set();
        productOrderSets.set(item.product_id, orderSet);
      }
      orderSet.add(orderIdx);

      // Co-occurrences: other products in same order
      for (const otherId of productIdsInOrder) {
        if (otherId === item.product_id) continue;
        const existing = acc.co_occurrences.get(otherId);
        if (existing) {
          existing.count += 1;
        } else {
          // Find the title from the order items
          const otherItem = order.items.find((i) => i.product_id === otherId);
          acc.co_occurrences.set(otherId, {
            title: otherItem?.title || 'Unknown Product',
            count: 1,
          });
        }
      }
    }
  }

  // Compute final behaviors
  const behaviors: ProductBehavior[] = [];

  for (const acc of accumulators.values()) {
    if (acc.total_orders === 0) continue;

    const aloneRate = acc.total_orders > 0 ? acc.alone_orders / acc.total_orders : 0;
    const firstRate = acc.total_orders > 0 ? acc.first_position_orders / acc.total_orders : 0;
    const avgPosition = acc.total_orders > 0 ? acc.position_sum / acc.total_orders : 0;
    const revenueShare = totalStoreRevenue > 0 ? acc.total_revenue / totalStoreRevenue : 0;

    // avg_order_value_with
    const avgOrderValueWith =
      acc.order_values.length > 0
        ? acc.order_values.reduce((s, v) => s + v, 0) / acc.order_values.length
        : 0;

    // avg_order_value_without: average total_price of orders NOT containing this product
    const thisProductOrderSet = productOrderSets.get(acc.product_id);
    let avgOrderValueWithout = 0;
    if (thisProductOrderSet) {
      let sumWithout = 0;
      let countWithout = 0;
      for (let i = 0; i < parsedOrders.length; i++) {
        if (!thisProductOrderSet.has(i)) {
          sumWithout += parsedOrders[i].total_price;
          countWithout += 1;
        }
      }
      avgOrderValueWithout = countWithout > 0 ? sumWithout / countWithout : 0;
    }

    // co_occurrence_rate: fraction of this product's orders that are multi-item
    const multiItemOrders = acc.total_orders - acc.alone_orders;
    const coOccurrenceRate = acc.total_orders > 0 ? multiItemOrders / acc.total_orders : 0;

    // Total co-occurrences
    let totalCoOccurrences = 0;
    for (const companion of acc.co_occurrences.values()) {
      totalCoOccurrences += companion.count;
    }

    // Top 5 companions sorted by co_count descending
    const companionEntries = Array.from(acc.co_occurrences.entries())
      .map(([pid, data]) => ({
        product_id: pid,
        product_title: data.title,
        co_count: data.count,
        co_rate: acc.total_orders > 0 ? data.count / acc.total_orders : 0,
      }))
      .sort((a, b) => b.co_count - a.co_count)
      .slice(0, 5);

    const valueLift = avgOrderValueWith - avgOrderValueWithout;

    behaviors.push({
      product_id: acc.product_id,
      product_title: acc.product_title,
      store_id: storeId,
      total_orders: acc.total_orders,
      alone_orders: acc.alone_orders,
      alone_rate: aloneRate,
      first_position_orders: acc.first_position_orders,
      first_rate: firstRate,
      avg_position: avgPosition,
      total_revenue: acc.total_revenue,
      revenue_share: revenueShare,
      avg_order_value_with: avgOrderValueWith,
      avg_order_value_without: avgOrderValueWithout,
      total_co_occurrences: totalCoOccurrences,
      co_occurrence_rate: coOccurrenceRate,
      top_companions: companionEntries,
      value_lift: valueLift,
      first_seen: acc.first_seen,
      last_seen: acc.last_seen,
      active_days: acc.dates.size,
    });
  }

  // Sort by total revenue descending for convenience
  behaviors.sort((a, b) => b.total_revenue - a.total_revenue);

  return behaviors;
}
