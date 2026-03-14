/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
/**
 * Store Type Detector
 *
 * Detects store structure (single_product, funnel, general, subscription, mixed)
 * by analyzing active products and 60 days of orders.
 * Runs on store connect and weekly thereafter.
 * One store's detection never affects another.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { StoreType } from './types';
import { DIGITAL_KEYWORDS, BUNDLE_KEYWORDS } from './constants';

export { DIGITAL_KEYWORDS, BUNDLE_KEYWORDS };

const UPSELL_APP_INDICATORS = [
  'reconvert', 'zipify', 'carthook', 'aftersell', 'honeycomb',
  'upsell', 'one click', 'post purchase', 'order bump',
];

// ── Interfaces ───────────────────────────────────────────────

interface OrderCacheRow {
  shopify_order_id: string;
  line_items: string;
  total_price: number;
  financial_status: string;
  created_at: string;
}

interface StoreTypeResult {
  store_type: StoreType;
  confidence: number;
  signals: Record<string, unknown>;
  has_upsell_app: boolean;
  has_digital_products: boolean;
  has_subscriptions: boolean;
  has_bundles: boolean;
  total_active_products: number;
  avg_products_per_order: number;
  avg_order_value: number;
}

// ── Main Detection Function ─────────────────────────────────

export async function detectStoreType(storeId: string): Promise<StoreTypeResult> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0];
  const enc = (v: string) => encodeURIComponent(v);

  // Fetch orders from cache
  const orders = await rest<OrderCacheRow[]>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${sixtyDaysAgo}T00:00:00&order_status=neq.cancelled&financial_status=neq.refunded&select=shopify_order_id,line_items,total_price,financial_status,created_at`
  ).catch(() => [] as OrderCacheRow[]);

  // Parse all orders and build per-product stats
  const productStats = new Map<string, {
    title: string;
    tags: string;
    productType: string;
    orderCount: number;
    aloneCount: number;
    revenue: number;
    neverFirst: boolean;
    neverAlone: boolean;
    hasSubscription: boolean;
  }>();

  let totalOrders = 0;
  let totalRevenue = 0;
  let totalLineItemCount = 0;

  for (const order of orders) {
    let lineItems: Array<{
      product_id?: string | number;
      title?: string;
      price?: string;
      quantity?: number;
      requires_selling_plan?: boolean;
      properties?: Array<{ name: string; value: string }>;
      product_type?: string;
      tags?: string;
    }>;
    try {
      lineItems = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items)
        : order.line_items || [];
    } catch { continue; }

    if (lineItems.length === 0) continue;

    totalOrders++;
    totalRevenue += order.total_price || 0;
    totalLineItemCount += lineItems.length;

    const uniqueProductIds = new Set<string>();
    for (const item of lineItems) {
      const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
      uniqueProductIds.add(pid);
    }
    const isAloneOrder = uniqueProductIds.size === 1;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
      const isFirst = i === 0;

      const existing = productStats.get(pid);
      if (existing) {
        existing.orderCount++;
        if (isAloneOrder) existing.aloneCount++;
        existing.revenue += parseFloat(item.price || '0') * (item.quantity || 1);
        if (isFirst) existing.neverFirst = false;
        if (!isAloneOrder && existing.neverAlone) { /* stays true only if ALWAYS alone */ }
        if (isAloneOrder) { /* nothing */ } else { existing.neverAlone = false; }
        if (item.requires_selling_plan) existing.hasSubscription = true;
      } else {
        productStats.set(pid, {
          title: item.title || '',
          tags: '',
          productType: item.product_type || '',
          orderCount: 1,
          aloneCount: isAloneOrder ? 1 : 0,
          revenue: parseFloat(item.price || '0') * (item.quantity || 1),
          neverFirst: !isFirst,
          neverAlone: isAloneOrder,
          hasSubscription: !!item.requires_selling_plan,
        });
      }
    }
  }

  // Also fetch product metadata from product_intelligence if available
  const productIntel = await rest<Array<{
    product_id: string;
    tags: string;
    product_type: string;
    is_subscription: boolean;
    is_bundle: boolean;
    is_digital: boolean;
  }>>(
    `/product_intelligence?store_id=eq.${enc(storeId)}&select=product_id,tags,product_type,is_subscription,is_bundle,is_digital`
  ).catch(() => []);

  const intelMap = new Map(productIntel.map(p => [p.product_id, p]));

  // ── Compute detection signals ──────────────────────────────

  const uniqueProductCount = productStats.size;
  const avgProductsPerOrder = totalOrders > 0 ? totalLineItemCount / totalOrders : 0;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Revenue share per product
  let topProductRevenueShare = 0;
  const alonePcts: number[] = [];
  let hasSubscriptions = false;
  let hasBundles = false;
  let hasDigitalProducts = false;
  let hasUpsellApp = false;

  for (const [pid, stats] of productStats) {
    const revShare = totalRevenue > 0 ? Math.min((stats.revenue / totalRevenue) * 100, 100) : 0;
    if (revShare > topProductRevenueShare) topProductRevenueShare = revShare;

    const alonePct = stats.orderCount > 0 ? (stats.aloneCount / stats.orderCount) * 100 : 0;
    alonePcts.push(alonePct);

    // Check flags from intel table
    const intel = intelMap.get(pid);
    if (intel?.is_subscription || stats.hasSubscription) hasSubscriptions = true;
    if (intel?.is_bundle) hasBundles = true;
    if (intel?.is_digital) hasDigitalProducts = true;

    // Also check tags/type for digital/bundle keywords
    const allText = `${stats.title} ${intel?.tags || ''} ${intel?.product_type || stats.productType}`.toLowerCase();
    if (DIGITAL_KEYWORDS.some(k => allText.includes(k))) hasDigitalProducts = true;
    if (BUNDLE_KEYWORDS.some(k => allText.includes(k))) hasBundles = true;

    // Upsell app detection: product that NEVER appears as first item AND never appears alone
    // (likely injected by upsell app post-checkout)
    if (stats.neverFirst && !stats.neverAlone && stats.orderCount >= 5) {
      // Check if product title hints at upsell app
      const titleLower = stats.title.toLowerCase();
      if (UPSELL_APP_INDICATORS.some(k => titleLower.includes(k))) {
        hasUpsellApp = true;
      }
    }
  }

  const avgAlonePct = alonePcts.length > 0
    ? alonePcts.reduce((a, b) => a + b, 0) / alonePcts.length
    : 0;

  // Check for funnel pattern: one product alone_pct < 5% AND another alone_pct > 50%
  const hasLowAlone = alonePcts.some(p => p < 5);
  const hasHighAlone = alonePcts.some(p => p > 50);

  // ── Classify store type ────────────────────────────────────
  // Priority: subscription → single_product → funnel → mixed
  // 'general' is LAST resort and never triggers markAllAsMain

  // Count distinct product types for catalog detection
  const distinctProductTypes = new Set<string>();
  for (const [, stats] of productStats) {
    if (stats.productType) distinctProductTypes.add(stats.productType.toLowerCase());
  }

  // Funnel signals: any product with very high or very low alone rate
  const anyHighAlone = alonePcts.some(p => p >= 70);
  const anyLowAlone = alonePcts.some(p => p <= 10);
  const hasFunnelSignal = (hasLowAlone && hasHighAlone) || anyHighAlone || anyLowAlone;

  let storeType: StoreType;
  let confidence: number;

  // 1. Subscription — any requires_selling_plan
  if (hasSubscriptions) {
    storeType = 'subscription';
    confidence = 80;
  }
  // 2. Single product — ≤3 products AND one product dominates >85% revenue
  //    Revenue share must be capped at 100 to avoid overflow from multi-order accumulation
  else if (uniqueProductCount <= 3 && Math.min(topProductRevenueShare, 100) > 85) {
    storeType = 'single_product';
    confidence = 85;
  }
  // 3. Funnel — clear funnel signals (high + low alone rates)
  else if (hasLowAlone && hasHighAlone) {
    storeType = 'funnel';
    confidence = 75;
  }
  // 4. Digital products with any funnel signal → funnel (never general)
  else if (hasDigitalProducts && hasFunnelSignal) {
    storeType = 'funnel';
    confidence = 70;
  }
  // 5. Digital products default to funnel — digital stores almost always have funnels
  else if (hasDigitalProducts) {
    storeType = 'funnel';
    confidence = 60;
  }
  // 6. Any funnel signal at all → mixed (runs behavioral classifier)
  else if (hasFunnelSignal) {
    storeType = 'mixed';
    confidence = 60;
  }
  // 7. True catalog — 50+ product types AND uniform alone rates
  else if (distinctProductTypes.size >= 50 && !hasFunnelSignal) {
    storeType = 'general';
    confidence = 65;
  }
  // 8. Default — mixed (runs behavioral classifier, never markAllAsMain)
  else {
    storeType = 'mixed';
    confidence = 55;
  }

  const signals = {
    uniqueProductCount,
    topProductRevenueShare: Math.round(topProductRevenueShare * 10) / 10,
    avgProductsPerOrder: Math.round(avgProductsPerOrder * 100) / 100,
    avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    avgAlonePct: Math.round(avgAlonePct * 10) / 10,
    hasLowAlone,
    hasHighAlone,
    totalOrdersAnalyzed: totalOrders,
  };

  // Persist to store_intelligence
  const now = new Date().toISOString();
  await rest(
    '/store_intelligence?on_conflict=store_id',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{
        store_id: storeId,
        store_type: storeType,
        store_type_confidence: confidence,
        store_type_signals: signals,
        has_upsell_app: hasUpsellApp,
        has_digital_products: hasDigitalProducts,
        has_subscriptions: hasSubscriptions,
        has_bundles: hasBundles,
        total_active_products: uniqueProductCount,
        avg_products_per_order: signals.avgProductsPerOrder,
        avg_order_value: signals.avgOrderValue,
        store_type_detected_at: now,
        updated_at: now,
      }]),
    }
  ).catch(() => { /* table may not exist yet */ });

  return {
    store_type: storeType,
    confidence,
    signals,
    has_upsell_app: hasUpsellApp,
    has_digital_products: hasDigitalProducts,
    has_subscriptions: hasSubscriptions,
    has_bundles: hasBundles,
    total_active_products: uniqueProductCount,
    avg_products_per_order: signals.avgProductsPerOrder,
    avg_order_value: signals.avgOrderValue,
  };
}
