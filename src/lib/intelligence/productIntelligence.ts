/**
 * Product Intelligence
 *
 * Analyzes all products + order history to classify products automatically.
 * Classification rules (priority order from V4.4):
 *   1. Manual override (permanent, always wins)
 *   2. Subscription detection (requires_selling_plan)
 *   3. Tag detection (gift card, bundle keywords)
 *   4. Gift card detection (product_type = 'gift_card')
 *   5. Alone% — if product is alone in 80%+ of orders → MAIN
 *   6. First% — if product is first line item in 70%+ of orders → MAIN
 *   7. Price rules — $0 = MAIN (ad-driven), price > $0 = UPSELL
 *   8. Order position analysis
 *   9. Default → MAIN
 *
 * Re-runs weekly. Digital detection from product_type/tags.
 * Bundle detection from title keywords + variant count.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { ProductIntelligenceRow, ProductClassificationType, ClassificationMethod } from './types';

// ── Shopify Data Interfaces ─────────────────────────────────

interface ShopifyProduct {
  id: string | number;
  title: string;
  product_type: string;
  vendor: string;
  tags: string;
  variants: Array<{
    id: string | number;
    price: string;
    requires_shipping: boolean;
  }>;
}

interface OrderLineItem {
  product_id: string | number;
  title: string;
  price: string;
  quantity: number;
  position?: number;
  requires_selling_plan?: boolean;
}

interface OrderData {
  id: string | number;
  line_items: OrderLineItem[] | string; // could be JSON string from cache
  financial_status: string;
}

// ── Constants ────────────────────────────────────────────────

const ALONE_THRESHOLD = 0.8;   // 80%+ orders alone → MAIN
const FIRST_THRESHOLD = 0.7;   // 70%+ orders as first item → MAIN
const BUNDLE_KEYWORDS = ['bundle', 'pack', 'set', 'kit', 'combo', 'collection', 'variety'];
const DIGITAL_KEYWORDS = ['digital', 'download', 'ebook', 'e-book', 'course', 'membership', 'access', 'license', 'software', 'template'];
const GIFT_KEYWORDS = ['gift card', 'gift certificate', 'gift voucher'];

// ── Product Analysis Result ─────────────────────────────────

interface ProductAnalysis {
  productId: string;
  productTitle: string;
  productType: string;
  vendor: string;
  tags: string;
  isDigital: boolean;
  isSubscription: boolean;
  isBundle: boolean;
  isGiftCard: boolean;
  requiresShipping: boolean;
  classification: ProductClassificationType;
  classificationConfidence: number;
  detectionMethod: ClassificationMethod;
  alonePercentage: number;
  firstPercentage: number;
  averagePrice: number;
  totalUnitsSold: number;
  totalRevenue: number;
  orderCount: number;
  variantCount: number;
  bundleKeywords: boolean;
  pairedProductId: string | null;
  pairedFrequency: number;
}

// ── Main Analysis Function ──────────────────────────────────

export async function analyzeProducts(
  storeId: string,
  products: ShopifyProduct[],
  orders: OrderData[]
): Promise<ProductAnalysis[]> {
  // Load existing manual overrides
  let existingIntel: ProductIntelligenceRow[] = [];
  try {
    existingIntel = await rest<ProductIntelligenceRow[]>(
      `/product_intelligence?store_id=eq.${encodeURIComponent(storeId)}&manual_override=eq.true&select=product_id,manual_classification`
    );
  } catch { /* table might not exist */ }

  const manualOverrides = new Map<string, string>();
  for (const row of existingIntel) {
    if (row.manual_override && row.manual_classification) {
      manualOverrides.set(row.product_id, row.manual_classification);
    }
  }

  // Parse orders and build order patterns
  const orderPatterns = buildOrderPatterns(orders);

  // Analyze each product
  const results: ProductAnalysis[] = [];

  for (const product of products) {
    const productId = String(product.id);
    const patterns = orderPatterns.get(productId);

    // Detect product characteristics
    const isDigital = detectDigital(product);
    const isBundle = detectBundle(product);
    const isGiftCard = detectGiftCard(product);
    const requiresShipping = product.variants.some(v => v.requires_shipping);
    const variantCount = product.variants.length;
    const averagePrice = product.variants.length > 0
      ? product.variants.reduce((s, v) => s + parseFloat(v.price), 0) / product.variants.length
      : 0;

    // Check for subscription in order data
    const isSubscription = patterns?.hasSubscription || false;

    // Classify with priority rules
    let classification: ProductClassificationType;
    let confidence: number;
    let method: ClassificationMethod;

    // Rule 1: Manual override (always wins)
    if (manualOverrides.has(productId)) {
      classification = manualOverrides.get(productId) as ProductClassificationType;
      confidence = 1.0;
      method = 'manual';
    }
    // Rule 2: Subscription
    else if (isSubscription) {
      classification = 'subscription';
      confidence = 0.95;
      method = 'subscription';
    }
    // Rule 3: Tag detection
    else if (isBundle) {
      classification = 'bundle';
      confidence = 0.9;
      method = 'tag';
    }
    // Rule 4: Gift card
    else if (isGiftCard) {
      classification = 'gift';
      confidence = 0.95;
      method = 'gift_card';
    }
    // Rule 5: Alone% — product is alone in 80%+ of orders
    else if (patterns && patterns.alonePercentage >= ALONE_THRESHOLD) {
      classification = 'main';
      confidence = 0.85;
      method = 'alone_percentage';
    }
    // Rule 6: First% — product is first line item in 70%+ of orders
    else if (patterns && patterns.firstPercentage >= FIRST_THRESHOLD) {
      classification = 'main';
      confidence = 0.8;
      method = 'first_percentage';
    }
    // Rule 7: Price rules — $0 = MAIN (ad-driven), price > $0 = UPSELL
    else if (averagePrice === 0) {
      classification = 'main';
      confidence = 0.7;
      method = 'price';
    }
    // Rule 8: If there are no order patterns (new product), check if it's the only product
    else if (products.length === 1) {
      classification = 'main';
      confidence = 0.95;
      method = 'auto';
    }
    // Rule 9: Default based on order position and frequency
    else if (patterns && patterns.firstPercentage > 0.3) {
      classification = 'main';
      confidence = 0.5;
      method = 'order_position';
    }
    // Everything else is upsell by default (if it has sales data)
    else if (patterns && patterns.orderCount > 0) {
      classification = 'upsell';
      confidence = 0.4;
      method = 'default';
    }
    // No sales data at all
    else {
      classification = 'unknown';
      confidence = 0.1;
      method = 'default';
    }

    results.push({
      productId,
      productTitle: product.title,
      productType: product.product_type || '',
      vendor: product.vendor || '',
      tags: product.tags || '',
      isDigital,
      isSubscription,
      isBundle,
      isGiftCard,
      requiresShipping,
      classification,
      classificationConfidence: confidence,
      detectionMethod: method,
      alonePercentage: patterns?.alonePercentage || 0,
      firstPercentage: patterns?.firstPercentage || 0,
      averagePrice,
      totalUnitsSold: patterns?.totalUnits || 0,
      totalRevenue: patterns?.totalRevenue || 0,
      orderCount: patterns?.orderCount || 0,
      variantCount,
      bundleKeywords: isBundle,
      pairedProductId: patterns?.topPairedProductId || null,
      pairedFrequency: patterns?.topPairedFrequency || 0,
    });
  }

  return results;
}

/**
 * Analyze products and save results to product_intelligence table.
 */
export async function analyzeAndSaveProducts(
  storeId: string,
  products: ShopifyProduct[],
  orders: OrderData[]
): Promise<ProductAnalysis[]> {
  const results = await analyzeProducts(storeId, products, orders);

  // Batch upsert to product_intelligence
  if (results.length > 0) {
    const now = new Date().toISOString();
    const payloads = results.map(r => ({
      store_id: storeId,
      product_id: r.productId,
      product_title: r.productTitle,
      product_type: r.productType,
      vendor: r.vendor,
      tags: r.tags,
      is_digital: r.isDigital,
      is_subscription: r.isSubscription,
      is_bundle: r.isBundle,
      is_gift_card: r.isGiftCard,
      requires_shipping: r.requiresShipping,
      classification: r.classification,
      classification_confidence: r.classificationConfidence,
      detection_method: r.detectionMethod,
      alone_percentage: r.alonePercentage,
      first_percentage: r.firstPercentage,
      average_price: r.averagePrice,
      total_units_sold: r.totalUnitsSold,
      total_revenue: r.totalRevenue,
      order_count: r.orderCount,
      variant_count: r.variantCount,
      bundle_keywords: r.bundleKeywords,
      paired_product_id: r.pairedProductId,
      paired_frequency: r.pairedFrequency,
      manual_override: false,
      last_analyzed_at: now,
      updated_at: now,
    }));

    // Upsert in chunks of 50
    for (let i = 0; i < payloads.length; i += 50) {
      const chunk = payloads.slice(i, i + 50);
      await rest(
        '/product_intelligence?on_conflict=store_id,product_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(chunk),
        }
      );
    }
  }

  // Update store_intelligence timestamp
  try {
    await rest(
      `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          products_analyzed_at: new Date().toISOString(),
          product_count: results.length,
          main_product_count: results.filter(r => r.classification === 'main').length,
          has_subscriptions: results.some(r => r.isSubscription),
          has_bundles: results.some(r => r.isBundle),
          has_digital_products: results.some(r => r.isDigital),
          is_single_product: results.length === 1,
          updated_at: new Date().toISOString(),
        }),
      }
    );
  } catch { /* store_intelligence might not exist yet */ }

  return results;
}

// ── Order Pattern Analysis ──────────────────────────────────

interface OrderPattern {
  orderCount: number;
  aloneCount: number;
  firstCount: number;
  totalUnits: number;
  totalRevenue: number;
  alonePercentage: number;
  firstPercentage: number;
  hasSubscription: boolean;
  pairedProducts: Map<string, number>; // productId → co-occurrence count
  topPairedProductId: string | null;
  topPairedFrequency: number;
}

function buildOrderPatterns(orders: OrderData[]): Map<string, OrderPattern> {
  const patterns = new Map<string, OrderPattern>();

  for (const order of orders) {
    // Skip fully refunded/voided orders
    if (order.financial_status === 'refunded' || order.financial_status === 'voided') {
      continue;
    }

    let lineItems: OrderLineItem[];
    if (typeof order.line_items === 'string') {
      try {
        lineItems = JSON.parse(order.line_items);
      } catch {
        continue;
      }
    } else {
      lineItems = order.line_items || [];
    }

    if (lineItems.length === 0) continue;

    // Deduplicate product IDs in this order
    const productIdsInOrder = [...new Set(lineItems.map(li => String(li.product_id)))];
    const isAlone = productIdsInOrder.length === 1;

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const productId = String(item.product_id);
      const isFirst = i === 0;

      const pattern = patterns.get(productId) || {
        orderCount: 0,
        aloneCount: 0,
        firstCount: 0,
        totalUnits: 0,
        totalRevenue: 0,
        alonePercentage: 0,
        firstPercentage: 0,
        hasSubscription: false,
        pairedProducts: new Map(),
        topPairedProductId: null,
        topPairedFrequency: 0,
      };

      pattern.orderCount++;
      if (isAlone) pattern.aloneCount++;
      if (isFirst) pattern.firstCount++;
      pattern.totalUnits += Number(item.quantity);
      pattern.totalRevenue += parseFloat(item.price) * Number(item.quantity);
      if (item.requires_selling_plan) pattern.hasSubscription = true;

      // Track co-occurring products
      for (const otherId of productIdsInOrder) {
        if (otherId !== productId) {
          pattern.pairedProducts.set(otherId, (pattern.pairedProducts.get(otherId) || 0) + 1);
        }
      }

      patterns.set(productId, pattern);
    }
  }

  // Calculate percentages and find top paired product
  for (const [, pattern] of patterns) {
    pattern.alonePercentage = pattern.orderCount > 0
      ? pattern.aloneCount / pattern.orderCount
      : 0;
    pattern.firstPercentage = pattern.orderCount > 0
      ? pattern.firstCount / pattern.orderCount
      : 0;

    // Find top paired product
    let maxPairedCount = 0;
    for (const [pairedId, count] of pattern.pairedProducts) {
      if (count > maxPairedCount) {
        maxPairedCount = count;
        pattern.topPairedProductId = pairedId;
        pattern.topPairedFrequency = pattern.orderCount > 0
          ? count / pattern.orderCount
          : 0;
      }
    }
  }

  return patterns;
}

// ── Detection Helpers ───────────────────────────────────────

function detectDigital(product: ShopifyProduct): boolean {
  const type = (product.product_type || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase();
  const title = (product.title || '').toLowerCase();

  // Check product_type
  if (DIGITAL_KEYWORDS.some(kw => type.includes(kw))) return true;

  // Check tags
  if (DIGITAL_KEYWORDS.some(kw => tags.includes(kw))) return true;

  // Check title
  if (DIGITAL_KEYWORDS.some(kw => title.includes(kw))) return true;

  // No variants require shipping
  if (product.variants.length > 0 && product.variants.every(v => !v.requires_shipping)) {
    return true;
  }

  return false;
}

function detectBundle(product: ShopifyProduct): boolean {
  const title = (product.title || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase();

  // Check title and tags for bundle keywords
  if (BUNDLE_KEYWORDS.some(kw => title.includes(kw))) return true;
  if (BUNDLE_KEYWORDS.some(kw => tags.includes(kw))) return true;

  // High variant count can indicate a bundle
  if (product.variants.length >= 5) {
    // But only if title also suggests it
    return BUNDLE_KEYWORDS.some(kw => title.includes(kw));
  }

  return false;
}

function detectGiftCard(product: ShopifyProduct): boolean {
  const type = (product.product_type || '').toLowerCase();
  const title = (product.title || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase();

  if (type === 'gift_card' || type === 'giftcard') return true;
  if (GIFT_KEYWORDS.some(kw => title.includes(kw))) return true;
  if (GIFT_KEYWORDS.some(kw => tags.includes(kw))) return true;

  return false;
}

/**
 * Get stored product intelligence for a store.
 */
export async function getProductIntelligence(storeId: string): Promise<ProductIntelligenceRow[]> {
  try {
    return await rest<ProductIntelligenceRow[]>(
      `/product_intelligence?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=total_revenue.desc`
    );
  } catch {
    return [];
  }
}

/**
 * Set manual classification override for a product.
 */
export async function setManualClassification(
  storeId: string,
  productId: string,
  classification: ProductClassificationType
): Promise<void> {
  await rest(
    `/product_intelligence?store_id=eq.${encodeURIComponent(storeId)}&product_id=eq.${encodeURIComponent(productId)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        manual_override: true,
        manual_classification: classification,
        updated_at: new Date().toISOString(),
      }),
    }
  );
}
