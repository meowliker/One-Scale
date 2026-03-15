/**
 * PRISM — Advanced Classification Signals
 *
 * Computes Tier 1-3 signals from existing data:
 * - Upsell app metafield detection (Tier 1, 100%)
 * - SKU pattern detection (Tier 1, 100%)
 * - Price/AOV ratio (Tier 2, 90%)
 * - Repeat purchase rate (Tier 3, 80%)
 * - New vs returning customer rate (Tier 3, 75%)
 *
 * These signals are computed per-product and stored in
 * product_classifications for use by the classification router.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── SKU Pattern Detection (Tier 1) ──────────────────────────
// Merchants encode product roles in SKUs:
// OTO, BUMP, DS, UPSELL, ADDON, UPGRADE, MAIN, CORE, FE

const SKU_UPSELL_PATTERNS = [
  /\bOTO\d*\b/i,        // One-Time-Offer
  /\bBUMP\b/i,           // Order bump
  /\bDS\d*\b/i,          // Downsell
  /\bUPSELL\b/i,
  /\bADDON\b/i,
  /\bUPGRADE\b/i,
  /\bBONUS\b/i,
  /\bPP[-_]?UP\b/i,      // Post-purchase upsell
  /\bXSELL\b/i,          // Cross-sell
];

const SKU_MAIN_PATTERNS = [
  /\bMAIN\b/i,
  /\bCORE\b/i,
  /\bFE\b/i,             // Front-end offer
  /\bHERO\b/i,
  /\bPRIMARY\b/i,
  /\bFLAGSHIP\b/i,
];

// ── Upsell App Metafield Namespaces (Tier 1) ────────────────
// Only these namespaces give reliable product role data.

const UPSELL_APP_NAMESPACES = [
  'aftersell',
  'zipify_ocu',
  'bold_upsell',
  'honeycomb',
  'reconvert',
  'orderbump',
  'carthook',
  'upsell',            // Generic namespace some apps use
];

// ── Main Entry Point ────────────────────────────────────────

export interface AdvancedSignalResult {
  product_id: string;
  product_title: string;
  sku_pattern_signal: string | null;          // 'main_sku' | 'upsell_sku' | null
  upsell_app_detected: string | null;         // app namespace or null
  price_aov_ratio: number;                     // product price / store AOV
  repeat_purchase_rate: number;                // 0-1
  new_customer_rate: number;                   // 0-1
}

export async function computeAdvancedSignals(storeId: string): Promise<{
  products: AdvancedSignalResult[];
  store_aov: number;
}> {
  // Load all data in parallel
  const [products, orders] = await Promise.all([
    rest<Array<{
      product_id: string; product_title: string; product_type: string;
    }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.false` +
      `&select=product_id,product_title,product_type`
    ).catch(() => []),

    rest<Array<{
      shopify_order_id: string; line_items: string; total_price: number;
      customer_id: string | null; customer_email: string | null; created_at: string;
    }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}` +
      `&order_status=neq.cancelled&financial_status=neq.refunded` +
      `&select=shopify_order_id,line_items,total_price,customer_id,customer_email,created_at` +
      `&order=created_at.asc&limit=2000`
    ).catch(() => []),
  ]);

  if (products.length === 0 || orders.length === 0) {
    return { products: [], store_aov: 0 };
  }

  // ── Compute Store AOV ─────────────────────────────────────
  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const storeAOV = orders.length > 0 ? totalRevenue / orders.length : 0;

  // ── Parse all orders to build per-product stats ───────────
  interface ProductStats {
    title: string;
    prices: number[];
    customerIds: Set<string>;
    orderDates: Map<string, string>;  // customerId → earliest date
    totalOrders: number;
    repeatCustomers: number;
    newCustomers: number;
    skus: Set<string>;
  }

  const productStats = new Map<string, ProductStats>();
  const customerFirstOrder = new Map<string, string>(); // customerId → first order date

  // First pass: find each customer's first order
  for (const order of orders) {
    const custId = order.customer_id || order.customer_email || '';
    if (!custId) continue;
    if (!customerFirstOrder.has(custId)) {
      customerFirstOrder.set(custId, order.created_at);
    }
  }

  // Second pass: build per-product stats
  for (const order of orders) {
    let items: Array<{
      product_id?: string | number; title?: string; price?: string;
      quantity?: number; sku?: string;
    }>;
    try {
      items = typeof order.line_items === 'string'
        ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    const custId = order.customer_id || order.customer_email || '';
    const isNewCustomer = custId
      ? customerFirstOrder.get(custId) === order.created_at
      : true;

    for (const item of items) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);

      if (!productStats.has(pid)) {
        productStats.set(pid, {
          title: item.title || '',
          prices: [],
          customerIds: new Set(),
          orderDates: new Map(),
          totalOrders: 0,
          repeatCustomers: 0,
          newCustomers: 0,
          skus: new Set(),
        });
      }

      const stats = productStats.get(pid)!;
      stats.totalOrders++;
      stats.prices.push(parseFloat(item.price || '0'));
      if (item.sku) stats.skus.add(item.sku);

      if (custId) {
        const hadBefore = stats.customerIds.has(custId);
        stats.customerIds.add(custId);
        if (hadBefore) {
          stats.repeatCustomers++;
        }
        if (isNewCustomer) {
          stats.newCustomers++;
        }
      }
    }
  }

  // ── Compute signals per product ───────────────────────────
  const results: AdvancedSignalResult[] = [];

  for (const product of products) {
    const stats = productStats.get(product.product_id);

    // SKU pattern detection
    let skuSignal: string | null = null;
    if (stats?.skus) {
      for (const sku of stats.skus) {
        if (SKU_UPSELL_PATTERNS.some(p => p.test(sku))) {
          skuSignal = 'upsell_sku';
          break;
        }
        if (SKU_MAIN_PATTERNS.some(p => p.test(sku))) {
          skuSignal = 'main_sku';
          break;
        }
      }
    }

    // Price/AOV ratio
    const avgPrice = stats && stats.prices.length > 0
      ? stats.prices.reduce((s, p) => s + p, 0) / stats.prices.length
      : 0;
    const priceAovRatio = storeAOV > 0 ? avgPrice / storeAOV : 0;

    // Repeat purchase rate
    const uniqueCustomers = stats?.customerIds.size || 0;
    const repeatPurchases = stats?.repeatCustomers || 0;
    const repeatRate = uniqueCustomers > 0 ? repeatPurchases / uniqueCustomers : 0;

    // New customer rate
    const totalOrders = stats?.totalOrders || 0;
    const newCustomerOrders = stats?.newCustomers || 0;
    const newCustomerRate = totalOrders > 0 ? newCustomerOrders / totalOrders : 0;

    results.push({
      product_id: product.product_id,
      product_title: stats?.title || product.product_title,
      sku_pattern_signal: skuSignal,
      upsell_app_detected: null, // Will be set by metafield detection
      price_aov_ratio: Math.round(priceAovRatio * 1000) / 1000,
      repeat_purchase_rate: Math.round(repeatRate * 1000) / 1000,
      new_customer_rate: Math.round(newCustomerRate * 1000) / 1000,
    });
  }

  // Persist signals
  const now = new Date().toISOString();
  for (let i = 0; i < results.length; i += 50) {
    const chunk = results.slice(i, i + 50);
    for (const r of chunk) {
      await rest(
        `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(r.product_id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            sku_pattern_signal: r.sku_pattern_signal,
            upsell_app_detected: r.upsell_app_detected,
            price_aov_ratio: r.price_aov_ratio,
            repeat_purchase_rate: r.repeat_purchase_rate,
            new_customer_rate: r.new_customer_rate,
            updated_at: now,
          }),
        }
      ).catch(() => null);
    }
  }

  return { products: results, store_aov: storeAOV };
}

/**
 * Detect upsell app metafields on products.
 * Requires Shopify access token to fetch product metafields.
 * Only checks known upsell app namespaces — NOT marketing apps.
 */
export async function detectUpsellAppMetafields(
  storeId: string,
  accessToken: string,
  shopDomain: string,
): Promise<Array<{ product_id: string; namespace: string; key: string; value: string }>> {
  const results: Array<{ product_id: string; namespace: string; key: string; value: string }> = [];

  // Get product IDs to check
  const products = await rest<Array<{ product_id: string }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id&limit=200`
  ).catch(() => []);

  // Check metafields for each product (rate-limited)
  for (const product of products) {
    try {
      const res = await fetch(
        `https://${shopDomain}/admin/api/2024-01/products/${product.product_id}/metafields.json`,
        { headers: { 'X-Shopify-Access-Token': accessToken } }
      );

      if (!res.ok) continue;
      const data = await res.json();

      for (const metafield of data.metafields ?? []) {
        const ns = (metafield.namespace || '').toLowerCase();
        if (UPSELL_APP_NAMESPACES.includes(ns)) {
          results.push({
            product_id: product.product_id,
            namespace: ns,
            key: metafield.key,
            value: String(metafield.value).slice(0, 200),
          });

          // Mark in product_classifications
          await rest(
            `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(product.product_id)}&manual_override=eq.false`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                upsell_app_detected: ns,
                classification: 'upsell',
                confidence: 100,
                detection_method: 'upsell_app_metafield',
                classification_method: 'upsell_app_metafield',
                updated_at: new Date().toISOString(),
              }),
            }
          ).catch(() => null);
        }
      }

      // Rate limiting
      const callLimit = res.headers.get('X-Shopify-Shop-Api-Call-Limit');
      if (callLimit) {
        const [used, max] = callLimit.split('/').map(Number);
        if (used >= max - 2) await new Promise(r => setTimeout(r, 2000));
        else await new Promise(r => setTimeout(r, 200));
      }
    } catch {
      // Skip product if API fails
    }
  }

  return results;
}
