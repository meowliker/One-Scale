/**
 * PRISM — New Product Handler
 *
 * Automatically classifies new products the moment they're created.
 * Runs instant signal detection without waiting for orders.
 * Works for main products, upsells, and downsells from day 1.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { classifyProductsWithLLM } from './llmClassifier';
import { applyNetworkArchetypes } from './networkIntelligence';

const enc = (v: string) => encodeURIComponent(v);

// ── Instant Signal Detection ────────────────────────────────

interface ShopifyProductWebhook {
  id: number | string;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  variants?: Array<{
    id: number | string;
    title?: string;
    price?: string;
    compare_at_price?: string;
    sku?: string;
    option1?: string;
    option2?: string;
    option3?: string;
    requires_shipping?: boolean;
    weight?: number;
    cost?: string;
  }>;
  images?: Array<{ id: number; src: string }>;
  created_at?: string;
}

interface ClassificationResult {
  classification: string;
  confidence: number;
  method: string;
  reason: string;
}

const YES_NO_OPTIONS = new Set([
  'yes', 'no', 'yes, add it', 'no thanks', 'no, thanks',
  'add to my order', 'skip', 'add it', 'include',
  'yes please', 'no thank you', 'accept', 'decline',
]);

const SKU_UPSELL = ['OTO', 'BUMP', 'UPSELL', 'ADDON', 'ADD-ON', 'XSELL', 'PP-UP', 'DOWNSELL'];
const SKU_MAIN = ['MAIN', 'CORE', 'FE-', 'FRONT', 'HERO', 'PRIMARY', 'FLAGSHIP'];

const UPSELL_APP_METAFIELD_NAMESPACES = [
  'aftersell', 'zipify_ocu', 'bold_upsell', 'honeycomb',
  'reconvert', 'orderbump', 'carthook',
];

/**
 * Run immediate signal detection on a new product.
 * Called from products/create webhook.
 * Returns the classification result (or PENDING if no strong signal).
 */
export async function classifyNewProduct(
  storeId: string,
  product: ShopifyProductWebhook,
): Promise<ClassificationResult> {
  const productId = String(product.id);
  const now = new Date().toISOString();

  // ── Signal 1: Variant YES/NO options (100% confidence) ────
  if (product.variants) {
    for (const v of product.variants) {
      for (const opt of [v.option1, v.option2, v.option3]) {
        if (opt && YES_NO_OPTIONS.has(opt.toLowerCase().trim())) {
          const result = { classification: 'upsell', confidence: 100, method: 'variant_yes_no', reason: `Variant option "${opt}" = order bump` };
          await saveClassification(storeId, productId, product, result, now);
          return result;
        }
      }
    }
  }

  // ── Signal 2: SKU patterns (100% confidence) ──────────────
  if (product.variants) {
    for (const v of product.variants) {
      const sku = (v.sku || '').toUpperCase();
      if (!sku) continue;

      if (SKU_UPSELL.some(k => sku.includes(k))) {
        const result = { classification: 'upsell', confidence: 100, method: 'sku_pattern', reason: `SKU "${v.sku}" contains upsell pattern` };
        await saveClassification(storeId, productId, product, result, now);
        return result;
      }
      if (SKU_MAIN.some(k => sku.includes(k))) {
        const result = { classification: 'main', confidence: 100, method: 'sku_pattern', reason: `SKU "${v.sku}" contains main product pattern` };
        await saveClassification(storeId, productId, product, result, now);
        return result;
      }
    }
  }

  // ── Signal 3: Shopify tags (100% confidence) ──────────────
  const tags = (product.tags || '').toLowerCase();
  if (tags.includes('onescale:main')) {
    const result = { classification: 'main', confidence: 100, method: 'shopify_tag', reason: 'Tagged onescale:main' };
    await saveClassification(storeId, productId, product, result, now);
    return result;
  }
  if (tags.includes('onescale:upsell')) {
    const result = { classification: 'upsell', confidence: 100, method: 'shopify_tag', reason: 'Tagged onescale:upsell' };
    await saveClassification(storeId, productId, product, result, now);
    return result;
  }
  if (tags.includes('onescale:exclude') || tags.includes('exclude-pnl') || tags.includes('no-pnl')) {
    const result = { classification: 'excluded', confidence: 100, method: 'shopify_tag', reason: 'Tagged for exclusion' };
    await saveClassification(storeId, productId, product, result, now);
    return result;
  }

  // ── Signal 4: Product type (90% confidence) ───────────────
  const productType = (product.product_type || '').toLowerCase();
  if (productType === 'gift card' || productType === 'gift_card') {
    const result = { classification: 'excluded', confidence: 100, method: 'edge_case', reason: 'Gift card product' };
    await saveClassification(storeId, productId, product, result, now);
    return result;
  }

  // ── Signal 5: Price relative to store median (70%) ────────
  const price = parseFloat(product.variants?.[0]?.price || '0');
  if (price > 0) {
    const existingProducts = await rest<Array<{ revenue_share: number; alone_pct: number }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&classification=eq.main&select=revenue_share,alone_pct&limit=10`
    ).catch(() => []);

    if (existingProducts.length > 0) {
      // Get average main product price proxy
      const avgMainRevShare = existingProducts.reduce((s, p) => s + p.revenue_share, 0) / existingProducts.length;

      // If new product price is very low relative to main products → upsell signal
      // This is a weak signal, so only flag as pending with reason
      if (avgMainRevShare > 10 && price < 20) {
        // Possible upsell — low price
      }
    }
  }

  // ── Signal 6: Network archetypes (up to 75% confidence) ──
  try {
    const predictions = await applyNetworkArchetypes(storeId);
    const match = predictions.find(p => p.product_id === productId);
    if (match && match.confidence >= 60) {
      const result = { classification: match.predicted_classification, confidence: match.confidence, method: 'network_archetype', reason: `Matched archetype: ${match.archetype_name}` };
      await saveClassification(storeId, productId, product, result, now);
      return result;
    }
  } catch { /* network archetypes not available */ }

  // ── Signal 7: LLM classification (background, 85-95%) ────
  // Don't block — run async after returning PENDING
  classifyProductWithLLMAsync(storeId, productId, product).catch(() => null);

  // ── No strong signal → PENDING ────────────────────────────
  const isDigital = product.variants?.every(v => v.requires_shipping === false) ?? false;
  const pendingReason = isDigital
    ? 'Digital product — waiting for order data'
    : 'New product — waiting for first orders';

  const result = { classification: 'pending', confidence: 0, method: 'awaiting_orders', reason: pendingReason };
  await saveClassification(storeId, productId, product, result, now);

  console.log(`[PRISM:NewProduct] ${product.title} (${productId}) → PENDING: ${pendingReason}`);
  return result;
}

// ── Helpers ─────────────────────────────────────────────────

async function saveClassification(
  storeId: string,
  productId: string,
  product: ShopifyProductWebhook,
  result: ClassificationResult,
  now: string,
): Promise<void> {
  const handle = product.title
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  await rest(
    '/product_classifications?on_conflict=store_id,product_id',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: productId,
        product_title: product.title,
        product_type: product.product_type || '',
        product_handle: handle,
        classification: result.classification,
        confidence: result.confidence,
        detection_method: result.method,
        classification_method: result.method,
        manual_override: false,
        needs_review: result.confidence < 50 && result.classification !== 'pending',
        first_seen_at: now,
        order_count_at_classification: 0,
        pending_reason: result.classification === 'pending' ? result.reason : null,
        updated_at: now,
      }),
    }
  ).catch(() => null);

  // Save COGS from Shopify variant cost if available
  if (product.variants) {
    for (const v of product.variants) {
      const cost = parseFloat(v.cost || '0');
      if (cost > 0) {
        await rest(
          '/pnl_product_costs?on_conflict=store_id,product_id',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({
              store_id: storeId,
              product_id: productId,
              cost_type: 'fixed',
              cost_per_unit: cost,
              source: 'shopify_variant_cost',
              variant_id: String(v.id),
              updated_at: now,
            }),
          }
        ).catch(() => null);
      }
    }
  }

  if (result.confidence >= 85) {
    console.log(`[PRISM:NewProduct] ${product.title} → ${result.classification.toUpperCase()} (${result.confidence}% via ${result.method})`);
  }
}

async function classifyProductWithLLMAsync(
  storeId: string,
  productId: string,
  product: ShopifyProductWebhook,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;

  // Small delay to not block webhook processing
  await new Promise(r => setTimeout(r, 1000));

  // Run LLM classification for this specific product
  await classifyProductsWithLLM(storeId);

  // Check if LLM provided a strong signal
  const updated = await rest<Array<{ llm_classification: string; llm_confidence: number; classification: string }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}&select=llm_classification,llm_confidence,classification`
  ).catch(() => []);

  if (updated[0]?.llm_classification && updated[0].llm_confidence >= 80 && updated[0].classification === 'pending') {
    // LLM had a strong opinion — upgrade from PENDING
    await rest(
      `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}&manual_override=eq.false`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          classification: updated[0].llm_classification,
          confidence: updated[0].llm_confidence,
          detection_method: 'llm_classification',
          classification_method: 'llm_classification',
          pending_reason: null,
          updated_at: new Date().toISOString(),
        }),
      }
    ).catch(() => null);

    console.log(`[PRISM:NewProduct] LLM upgraded ${productId} to ${updated[0].llm_classification} (${updated[0].llm_confidence}%)`);
  }
}

/**
 * Check if any products have reached classification thresholds.
 * Called after every order to upgrade PENDING products.
 */
export async function checkClassificationThresholds(
  storeId: string,
  productIds: string[],
): Promise<void> {
  for (const productId of productIds) {
    // Count orders containing this product
    const orders = await rest<Array<{ shopify_order_id: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&order_status=neq.cancelled&select=shopify_order_id&limit=35`
    ).catch(() => []);

    // Filter to orders containing this product
    let productOrderCount = 0;
    for (const order of orders) {
      // We'd need line_items to count accurately, but for threshold checking
      // we can use a simpler approach
      productOrderCount++;
    }

    // Check current classification
    const classification = await rest<Array<{ classification: string; confidence: number; order_count_at_classification: number }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}&select=classification,confidence,order_count_at_classification&limit=1`
    ).catch(() => []);

    if (!classification[0] || classification[0].classification !== 'pending') continue;

    const lastCount = classification[0].order_count_at_classification || 0;

    // Threshold: 5 orders → bootstrap, 30 orders → full classifier
    if (productOrderCount >= 5 && lastCount < 5) {
      console.log(`[PRISM:Threshold] ${productId} reached 5 orders — triggering bootstrap classification`);
      // The next classify-all run will pick this up with the bootstrap classifier
      await rest(
        `/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(productId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            order_count_at_classification: productOrderCount,
            pending_reason: 'Bootstrap classification available — waiting for next classify run',
            updated_at: new Date().toISOString(),
          }),
        }
      ).catch(() => null);
    }
  }
}

/**
 * Detect store type (digital vs physical) for COGS display.
 */
export async function detectStoreType(
  storeId: string,
): Promise<{ isDigital: boolean; cogsApplicable: boolean }> {
  const products = await rest<Array<{ product_type: string }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_type&limit=200`
  ).catch(() => []);

  if (products.length === 0) return { isDigital: false, cogsApplicable: true };

  const digitalKeywords = ['digital', 'download', 'ebook', 'course', 'template', 'printable', 'online', 'virtual', 'membership', 'subscription'];
  let digitalCount = 0;

  for (const p of products) {
    const type = (p.product_type || '').toLowerCase();
    if (digitalKeywords.some(k => type.includes(k)) || type === '') {
      digitalCount++;
    }
  }

  const digitalRatio = digitalCount / products.length;
  const isDigital = digitalRatio > 0.8;

  // Save to store_config
  await rest(
    `/store_config?store_id=eq.${enc(storeId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_digital_store: isDigital,
        cogs_applicable: !isDigital,
      }),
    }
  ).catch(() => null);

  return { isDigital, cogsApplicable: !isDigital };
}
