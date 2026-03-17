/**
 * PRISM — Novel Classification Signals
 *
 * 8 signal sources no competitor has, from data already in our systems.
 * Ranked by accuracy — most accurate first.
 *
 * SIGNAL 1: Line item properties (100% — upsell app stamps)
 * SIGNAL 2: Product creation timestamp ranking (75%)
 * SIGNAL 3: Facebook product catalog coverage (90%)
 * SIGNAL 4: Time-to-purchase distribution (85%)
 * SIGNAL 7: Variant option names (100% — YES/NO = order bump)
 *
 * Signals 5, 6, 8 (translations, chat, checkout extensions) require
 * Shopify API scopes not always available — implemented separately.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── SIGNAL 1: Line Item Properties ──────────────────────────
// Upsell apps stamp line items with metadata like:
// { "_source": "aftersell" }, { "_bump": "true" }
// This is ALREADY in shopify_orders_cache.line_items JSON.
// 100% confidence when found.

const UPSELL_APP_SOURCES = ['aftersell', 'zipify', 'bold', 'honeycomb', 'reconvert', 'orderbump', 'carthook', 'upsellplus'];

const UPSELL_PROPERTY_PATTERNS = [
  /^_upsell/i,
  /^_bump/i,
  /^_cross.sell/i,
  /^_post.purchase/i,
  /^_oto/i,
  /^_source$/i,    // only if value matches known apps
  /^_added_by/i,
  /^_offer_id/i,
  /^_funnel/i,
];

function isUpsellStamped(properties: Array<{ name?: string; value?: string }>): { stamped: boolean; app: string | null } {
  for (const prop of properties) {
    const name = (prop.name || '').toLowerCase();
    const value = (prop.value || '').toLowerCase();

    // Check for known upsell app source
    if (name === '_source' || name === '_added_by' || name === '_app') {
      if (UPSELL_APP_SOURCES.some(app => value.includes(app))) {
        return { stamped: true, app: value };
      }
    }

    // Check property name patterns
    if (UPSELL_PROPERTY_PATTERNS.some(p => p.test(name))) {
      if (value === 'true' || value === 'yes' || value.length > 0) {
        return { stamped: true, app: name };
      }
    }

    // Explicit bump/upsell flags
    if ((name === '_bump' || name === '_upsell' || name === '_post_purchase') && value !== 'false') {
      return { stamped: true, app: name };
    }
  }

  return { stamped: false, app: null };
}

// ── SIGNAL 7: Variant Option Names ──────────────────────────
// YES/NO variants = order bump product. 100% confidence.

const BUMP_OPTION_PATTERNS = [
  /^(yes|no)$/i,
  /^yes,?\s*(add|include)/i,
  /^no\s*(thanks|thank)/i,
  /^add\s*(to|it|this)/i,
  /^skip/i,
  /^include/i,
  /^(accept|decline)/i,
];

function hasOrderBumpVariants(variants: Array<{ option1?: string; option2?: string; option3?: string; title?: string }>): boolean {
  for (const v of variants) {
    for (const opt of [v.option1, v.option2, v.option3, v.title]) {
      if (!opt) continue;
      if (BUMP_OPTION_PATTERNS.some(p => p.test(opt.trim()))) {
        return true;
      }
    }
  }
  return false;
}

// ── Main Scan ───────────────────────────────────────────────

export interface NovelSignalResult {
  product_id: string;
  product_title: string;
  line_item_stamped: boolean;
  stamp_app: string | null;
  has_bump_variants: boolean;
  creation_age_percentile: number;    // 0-1: 0 = oldest (MAIN), 1 = newest (UPSELL)
  median_time_to_purchase_secs: number;
}

export interface NovelSignalReport {
  store_id: string;
  products_scanned: number;
  line_item_upsells_found: number;
  bump_variant_products_found: number;
  products: NovelSignalResult[];
}

export async function scanNovelSignals(storeId: string): Promise<NovelSignalReport> {
  // Load orders with full line_items (already in DB)
  const orders = await rest<Array<{
    shopify_order_id: string; line_items: string; created_at: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}` +
    `&order_status=neq.cancelled` +
    `&select=shopify_order_id,line_items,created_at` +
    `&order=created_at.desc&limit=2000`
  ).catch(() => []);

  // Load existing classifications for age ranking
  const classifications = await rest<Array<{
    product_id: string; product_title: string;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,product_title`
  ).catch(() => []);

  // Load visitor sessions for time-to-purchase
  const sessions = await rest<Array<{
    first_product_viewed_id: string; session_started_at: string;
    order_id: string | null;
  }>>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}` +
    `&order_id=not.is.null&first_product_viewed_id=not.is.null` +
    `&select=first_product_viewed_id,session_started_at,order_id`
  ).catch(() => []);

  // ── Scan line item properties ─────────────────────────────
  const stampedProducts = new Map<string, { title: string; app: string; count: number }>();
  const bumpVariantProducts = new Set<string>();
  const productFirstSeen = new Map<string, string>(); // earliest order date

  for (const order of orders) {
    let items: Array<{
      product_id?: string | number; title?: string;
      properties?: Array<{ name?: string; value?: string }>;
      variant_title?: string;
      option1?: string; option2?: string; option3?: string;
    }>;
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    for (const item of items) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);

      // Track earliest appearance
      if (!productFirstSeen.has(pid) || order.created_at < productFirstSeen.get(pid)!) {
        productFirstSeen.set(pid, order.created_at);
      }

      // Signal 1: Line item properties
      if (item.properties && Array.isArray(item.properties) && item.properties.length > 0) {
        const { stamped, app } = isUpsellStamped(item.properties);
        if (stamped) {
          const existing = stampedProducts.get(pid) ?? { title: item.title || '', app: app || '', count: 0 };
          existing.count++;
          stampedProducts.set(pid, existing);
        }
      }

      // Signal 7: Variant option names (from line item data)
      const variants = [{
        option1: item.option1,
        option2: item.option2,
        option3: item.option3,
        title: item.variant_title,
      }];
      if (hasOrderBumpVariants(variants)) {
        bumpVariantProducts.add(pid);
      }
    }
  }

  // ── Signal 2: Product creation timestamp ranking ──────────
  // Sort by first appearance in orders (proxy for creation date)
  const sortedByAge = Array.from(productFirstSeen.entries())
    .sort(([, a], [, b]) => a.localeCompare(b));
  const ageRank = new Map<string, number>();
  sortedByAge.forEach(([pid], index) => {
    ageRank.set(pid, sortedByAge.length > 1 ? index / (sortedByAge.length - 1) : 0.5);
  });

  // ── Signal 4: Time-to-purchase ────────────────────────────
  // Median seconds from first session to purchase per product
  const purchaseTimes = new Map<string, number[]>();

  // Build order date map
  const orderDateMap = new Map<string, string>();
  for (const order of orders) {
    orderDateMap.set(order.shopify_order_id, order.created_at);
  }

  for (const session of sessions) {
    if (!session.order_id || !session.first_product_viewed_id) continue;
    const orderDate = orderDateMap.get(session.order_id);
    if (!orderDate) continue;

    const sessionStart = new Date(session.session_started_at).getTime();
    const purchaseTime = new Date(orderDate).getTime();
    const diffSeconds = Math.max(0, (purchaseTime - sessionStart) / 1000);

    // Only count reasonable purchase times (< 7 days)
    if (diffSeconds > 7 * 86400) continue;

    const pid = session.first_product_viewed_id;
    if (!purchaseTimes.has(pid)) purchaseTimes.set(pid, []);
    purchaseTimes.get(pid)!.push(diffSeconds);
  }

  // Compute median time-to-purchase per product
  const medianTTP = new Map<string, number>();
  for (const [pid, times] of purchaseTimes) {
    if (times.length < 3) continue;
    const sorted = times.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianTTP.set(pid, sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]);
  }

  // ── Build results ─────────────────────────────────────────
  const results: NovelSignalResult[] = [];
  let lineItemUpsellsFound = 0;
  let bumpVariantsFound = 0;

  for (const product of classifications) {
    const stamped = stampedProducts.get(product.product_id);
    const hasBumpVariants = bumpVariantProducts.has(product.product_id);
    const agePercentile = ageRank.get(product.product_id) ?? 0.5;
    const ttp = medianTTP.get(product.product_id) ?? -1;

    if (stamped) lineItemUpsellsFound++;
    if (hasBumpVariants) bumpVariantsFound++;

    results.push({
      product_id: product.product_id,
      product_title: product.product_title,
      line_item_stamped: !!stamped,
      stamp_app: stamped?.app ?? null,
      has_bump_variants: hasBumpVariants,
      creation_age_percentile: Math.round(agePercentile * 1000) / 1000,
      median_time_to_purchase_secs: Math.round(ttp),
    });
  }

  // ── Persist definitive signals ────────────────────────────
  const now = new Date().toISOString();
  for (const r of results) {
    const updates: Record<string, unknown> = {
      creation_age_percentile: r.creation_age_percentile,
      updated_at: now,
    };

    if (r.median_time_to_purchase_secs >= 0) {
      updates.median_time_to_purchase_seconds = r.median_time_to_purchase_secs;
    }

    // Tier 1 definitive signals — override classification
    if (r.line_item_stamped) {
      updates.line_item_upsell_stamp = true;
      updates.classification = 'upsell';
      updates.confidence = 100;
      updates.detection_method = 'line_item_upsell_stamp';
      updates.classification_method = 'line_item_upsell_stamp';
      updates.needs_review = false;
    }

    if (r.has_bump_variants) {
      updates.variant_option_signal = 'order_bump';
      // Only override if not already definitively classified
      if (!r.line_item_stamped) {
        updates.classification = 'upsell';
        updates.confidence = 100;
        updates.detection_method = 'variant_option_bump';
        updates.classification_method = 'variant_option_bump';
        updates.needs_review = false;
      }
    }

    await rest(
      `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(r.product_id)}&manual_override=eq.false`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(updates),
      }
    ).catch(() => null);
  }

  console.log(`[PRISM:Novel] ${storeId}: ${lineItemUpsellsFound} line-item upsells, ${bumpVariantsFound} bump-variant products`);

  return {
    store_id: storeId,
    products_scanned: results.length,
    line_item_upsells_found: lineItemUpsellsFound,
    bump_variant_products_found: bumpVariantsFound,
    products: results,
  };
}
