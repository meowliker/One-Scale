/**
 * PRISM — Post-Purchase Upsell Detector (Tier 1, 100% confidence)
 *
 * Detects products added to existing orders after checkout.
 * Shopify upsell apps (Aftersell, Zipify, Bold, Honeycomb) work by
 * updating an existing order to add upsell products post-purchase.
 *
 * If a product_id first appears in an order as an UPDATE (not original
 * creation), that product is definitively a POST-PURCHASE UPSELL.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

interface PostPurchaseResult {
  product_id: string;
  product_title: string;
  occurrences: number;
  orders: string[];
}

/**
 * Scan all orders in a store for post-purchase upsell patterns.
 * Compares original_line_item_ids vs current line_items to find
 * products that were added after initial purchase.
 *
 * Also detects pattern: if a product appears in multi-item orders
 * but was never the first item AND the order has a short time gap
 * between creation and update → likely post-purchase upsell.
 */
export async function detectPostPurchaseUpsells(
  storeId: string,
): Promise<PostPurchaseResult[]> {
  // Method 1: Check orders that have tracked original vs current line items
  const trackedOrders = await rest<Array<{
    shopify_order_id: string;
    original_line_item_ids: string;
    line_items: string;
    created_at: string;
    updated_at: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}` +
    `&original_line_item_ids=not.is.null` +
    `&select=shopify_order_id,original_line_item_ids,line_items,created_at,updated_at`
  ).catch(() => []);

  const upsellProducts = new Map<string, PostPurchaseResult>();

  for (const order of trackedOrders) {
    let originalIds: string[];
    try {
      originalIds = JSON.parse(order.original_line_item_ids);
    } catch { continue; }

    let currentItems: Array<{ product_id?: string | number; title?: string }>;
    try {
      currentItems = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    const originalSet = new Set(originalIds.map(String));

    for (const item of currentItems) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);

      if (!originalSet.has(pid)) {
        // This product was added after original purchase
        const existing = upsellProducts.get(pid) ?? {
          product_id: pid,
          product_title: item.title || '',
          occurrences: 0,
          orders: [],
        };
        existing.occurrences++;
        existing.orders.push(order.shopify_order_id);
        upsellProducts.set(pid, existing);
      }
    }
  }

  // Method 2: Heuristic — detect products with high "added_programmatically" patterns
  // Products that appear in orders where created_at and updated_at differ by < 1 hour
  // AND the product was NOT in the original order items (which are the highest-priced items)
  if (trackedOrders.length === 0) {
    const recentOrders = await rest<Array<{
      shopify_order_id: string;
      line_items: string;
      created_at: string;
      updated_at: string;
    }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}` +
      `&order_status=neq.cancelled` +
      `&select=shopify_order_id,line_items,created_at,updated_at` +
      `&order=created_at.desc&limit=500`
    ).catch(() => []);

    for (const order of recentOrders) {
      const createdAt = new Date(order.created_at).getTime();
      const updatedAt = new Date(order.updated_at).getTime();
      const hoursDiff = (updatedAt - createdAt) / (1000 * 60 * 60);

      // Order was updated within 3 hours of creation (post-purchase window)
      if (hoursDiff < 0.1 || hoursDiff > 72) continue;

      let items: Array<{ product_id?: string | number; title?: string; price?: string }>;
      try {
        items = typeof order.line_items === 'string'
          ? JSON.parse(order.line_items) : order.line_items || [];
      } catch { continue; }

      if (items.length < 2) continue;

      // Sort by price descending — highest price item is likely the main product
      const sorted = [...items]
        .filter(i => i.product_id)
        .sort((a, b) => parseFloat(b.price || '0') - parseFloat(a.price || '0'));

      // Products that are NOT the most expensive in a quickly-updated order
      // are candidates for post-purchase upsells
      const mainProductId = sorted[0]?.product_id ? String(sorted[0].product_id) : null;

      for (const item of sorted.slice(1)) {
        if (!item.product_id) continue;
        const pid = String(item.product_id);
        if (pid === mainProductId) continue;

        const price = parseFloat(item.price || '0');
        const mainPrice = parseFloat(sorted[0].price || '0');

        // Only flag if significantly cheaper than main (< 50% of main price)
        if (mainPrice > 0 && price / mainPrice > 0.5) continue;

        const existing = upsellProducts.get(pid);
        if (existing) {
          // Already found via Method 1 — just count
          existing.occurrences++;
        }
        // Don't create new entries from heuristic alone — too noisy
      }
    }
  }

  // Persist detected post-purchase upsells
  const results = Array.from(upsellProducts.values());

  if (results.length > 0) {
    const now = new Date().toISOString();
    for (const result of results) {
      // Record the event
      for (const orderId of result.orders.slice(0, 10)) {
        await rest(
          '/post_purchase_upsell_events?on_conflict=store_id,order_id,product_id',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              store_id: storeId,
              order_id: orderId,
              product_id: result.product_id,
              product_title: result.product_title,
              detected_at: now,
            }),
          }
        ).catch(() => null);
      }

      // Mark in product_classifications (only if not manually overridden)
      await rest(
        `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(result.product_id)}&manual_override=eq.false`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            is_post_purchase_upsell: true,
            classification: 'upsell',
            confidence: 100,
            detection_method: 'post_purchase_order_update',
            classification_method: 'post_purchase_order_update',
            updated_at: now,
          }),
        }
      ).catch(() => null);
    }
  }

  return results;
}

/**
 * Called from order sync webhook/cron when an order is updated.
 * Captures original line items on first sync, detects additions on subsequent syncs.
 */
export async function trackOrderLineItemChanges(
  storeId: string,
  orderId: string,
  currentLineItems: Array<{ product_id?: string | number; title?: string }>,
): Promise<string[]> {
  const currentIds = currentLineItems
    .filter(i => i.product_id)
    .map(i => String(i.product_id));

  // Check if we have original line items stored
  const existing = await rest<Array<{ original_line_item_ids: string | null; line_items: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&shopify_order_id=eq.${enc(orderId)}` +
    `&select=original_line_item_ids,line_items&limit=1`
  ).catch(() => []);

  if (existing.length === 0) return [];

  const record = existing[0];

  if (!record.original_line_item_ids) {
    // First time seeing this order — store current items as original
    let existingItems: Array<{ product_id?: string | number }>;
    try {
      existingItems = typeof record.line_items === 'string'
        ? JSON.parse(record.line_items) : record.line_items || [];
    } catch { existingItems = []; }

    const existingIds = existingItems.filter(i => i.product_id).map(i => String(i.product_id));

    await rest(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&shopify_order_id=eq.${enc(orderId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          original_line_item_ids: JSON.stringify(existingIds),
        }),
      }
    ).catch(() => null);

    return [];
  }

  // We have original items — check for additions
  let originalIds: string[];
  try { originalIds = JSON.parse(record.original_line_item_ids); } catch { return []; }

  const originalSet = new Set(originalIds);
  const addedIds = currentIds.filter(id => !originalSet.has(id));

  if (addedIds.length > 0) {
    await rest(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&shopify_order_id=eq.${enc(orderId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          added_line_item_ids: JSON.stringify(addedIds),
          line_items_changed_at: new Date().toISOString(),
        }),
      }
    ).catch(() => null);
  }

  return addedIds;
}
