/**
 * PRISM Classification V2 — Universal System (14 store models)
 *
 * 4 layers, zero store-specific code:
 * 1. Store model detection (14 models auto-detected from order data)
 * 2. Universal rules (same code works for every store)
 * 3. Confidence thresholds + review queue
 * 4. Learning from merchant overrides
 *
 * Universal rules (no model-specific branching):
 * - manual_override = true → NEVER TOUCH
 * - Shopify tags / upsell stamps / SKU patterns → definitive
 * - $0 + alone_rate >= 30% → MAIN (works for funnel AND standard)
 * - $0 + alone_rate < 10% → UPSELL (free addon)
 * - revenue_share < 2% + below threshold → UPSELL
 * - co_occur_rate > 80% with higher-revenue product → UPSELL
 * - < 10 orders → PENDING always
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── Types ────────────────────────────────────────────────

export type StoreModel =
  | 'free_plus_shipping'
  | 'tripwire'
  | 'standard'
  | 'high_ticket'
  | 'subscription'
  | 'bundle'
  | 'digital'
  | 'dropshipping'
  | 'multi_product'
  | 'hybrid'
  | 'mystery_box'
  | 'preorder'
  | 'b2b'
  | 'hybrid_physical_digital';

export interface ClassificationV2Result {
  product_id: string;
  product_title: string;
  classification: 'main' | 'upsell' | 'downsell' | 'bundle' | 'excluded' | 'pending';
  confidence: number;
  method: string;
  parent_product_id: string | null;
  relationship_type: string | null;
  needs_review: boolean;
  signals: string[];
}

interface ProductRow {
  product_id: string;
  title: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  total_orders: number;
  alone_orders: number;
  alone_rate: number;
  total_revenue: number;
  revenue_share: number;
  co_occurs_with: string | null;
  co_occur_rate: number;
  always_with_other: boolean;
  has_upsell_stamps: boolean;
  sku_class: string | null;
  price_gap_class: string;
  price_ratio_to_order: number;
  first_purchase_rate: number;
  avg_position_in_order: number;
  always_last: boolean;
  has_heavy_discount: boolean;
}

interface ExistingClassification {
  product_id: string;
  classification: string;
  manual_override: boolean;
  confidence: number;
}

// ── Layer 1: Store Model Detection (14 models) ─────────

export async function detectStoreModel(storeId: string): Promise<StoreModel> {
  // Check if already set in store_config
  try {
    const configs = await rest<Array<{ store_model: string | null }>>(
      `/store_config?store_id=eq.${enc(storeId)}&select=store_model&limit=1`
    );
    if (configs?.[0]?.store_model) return configs[0].store_model as StoreModel;
  } catch { /* column may not exist yet */ }

  // Analyze order data to detect model
  let freeItemOrders = 0;
  let subscriptionOrders = 0;
  let partiallyPaidOrders = 0;
  let draftOrders = 0;
  let highQtyOrders = 0;
  let mysteryTitleOrders = 0;
  let physicalItems = 0;
  let digitalItems = 0;
  let totalPrice = 0;
  let totalItems = 0;
  let totalOrders = 0;
  const productTitles: string[] = [];

  try {
    const orders = await rest<Array<{
      line_items: string; total_price: number; financial_status: string;
      order_status: string; tags: string;
    }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=line_items,total_price,financial_status,order_status,tags&limit=300&order=created_at.desc`
    );

    for (const order of orders ?? []) {
      totalOrders++;
      totalPrice += Number(order.total_price) || 0;

      if (order.financial_status === 'partially_paid') partiallyPaidOrders++;
      if ((order.tags || '').toLowerCase().includes('preorder')) partiallyPaidOrders++;

      let items: Array<{
        price?: string; title?: string; quantity?: number;
        requires_shipping?: boolean; selling_plan_allocation?: unknown;
      }>;
      try {
        items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
      } catch { continue; }

      totalItems += items.length;

      for (const item of items) {
        const price = parseFloat(item.price || '0');
        const qty = item.quantity || 1;
        const title = (item.title || '').toLowerCase();

        if (price === 0) freeItemOrders++;
        if (item.selling_plan_allocation) subscriptionOrders++;
        if (item.requires_shipping === true) physicalItems++;
        if (item.requires_shipping === false) digitalItems++;
        if (qty > 10) highQtyOrders++;
        if (/mystery|blind.?box|surprise|grab.?bag/i.test(title)) {
          mysteryTitleOrders++;
          productTitles.push(title);
        }
      }
    }
  } catch { /* cache may not exist */ }

  if (totalOrders === 0) return 'standard';

  const avgPrice = totalPrice / totalOrders;
  const freeRate = freeItemOrders / totalOrders;
  const subRate = subscriptionOrders / totalOrders;
  const preorderRate = partiallyPaidOrders / totalOrders;
  const avgItemsPerOrder = totalItems / totalOrders;
  const mysteryRate = mysteryTitleOrders / totalOrders;
  const hasPhysical = physicalItems > 0;
  const hasDigital = digitalItems > 0;
  const b2bRate = (draftOrders + highQtyOrders) / totalOrders;

  let model: StoreModel;

  // Detection rules (priority order — most specific first)
  if (preorderRate > 0.2) {
    model = 'preorder';
  } else if (b2bRate > 0.3) {
    model = 'b2b';
  } else if (mysteryRate > 0.2) {
    model = 'mystery_box';
  } else if (freeRate > 0.3) {
    model = 'free_plus_shipping';
  } else if (subRate > 0.3) {
    model = 'subscription';
  } else if (avgPrice > 200) {
    model = 'high_ticket';
  } else if (avgPrice < 15 && avgItemsPerOrder > 2) {
    model = 'tripwire';
  } else if (avgItemsPerOrder > 3) {
    model = 'bundle';
  } else if (hasPhysical && hasDigital && digitalItems > totalItems * 0.2) {
    model = 'hybrid_physical_digital';
  } else if (!hasPhysical && hasDigital) {
    model = 'digital';
  } else {
    model = 'standard';
  }

  // Persist to store_config
  try {
    await rest(`/store_config?store_id=eq.${enc(storeId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ store_model: model }),
    });
  } catch { /* column may not exist yet */ }

  console.log(`[PRISM:V2] ${storeId}: model=${model} (free=${(freeRate * 100).toFixed(0)}% mystery=${(mysteryRate * 100).toFixed(0)}% sub=${(subRate * 100).toFixed(0)}% preorder=${(preorderRate * 100).toFixed(0)}% avg=$${avgPrice.toFixed(0)} items=${avgItemsPerOrder.toFixed(1)})`);
  return model;
}

// ── Layer 2: Universal Classification ───────────────────

export async function classifyAllProductsV2(storeId: string): Promise<ClassificationV2Result[]> {
  const model = await detectStoreModel(storeId);

  // Get products with signals from SQL function
  let products: ProductRow[] = [];
  try {
    products = await rest<ProductRow[]>('/rpc/get_product_signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ p_store_id: storeId }),
    });
  } catch {
    console.warn('[PRISM:V2] SQL function not available');
  }
  if (!products || products.length === 0) return [];

  // Get existing manual overrides
  const existing = await rest<ExistingClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as ExistingClassification[]);

  const manualOverrides = new Map<string, string>();
  for (const e of existing) {
    if (e.manual_override) manualOverrides.set(e.product_id, e.classification);
  }

  // Build revenue lookup for co-occurrence comparison
  const revenueMap = new Map<string, number>();
  for (const p of products) revenueMap.set(p.product_id, p.total_revenue);

  const mainProductIds = new Set<string>();
  const results: ClassificationV2Result[] = [];

  for (const product of products) {
    // ════════════════════════════════════════════════════════
    // TIER 1: Absolute rules (no scoring needed)
    // ════════════════════════════════════════════════════════

    // Rule 0: Manual override → NEVER TOUCH
    if (manualOverrides.has(product.product_id)) {
      const cls = manualOverrides.get(product.product_id)!;
      results.push(mk(product, cls as ClassificationV2Result['classification'], 100, 'manual_override',
        ['Manual override — PRISM will never change this']));
      if (cls === 'main') mainProductIds.add(product.product_id);
      continue;
    }

    // Rule 1: Upsell app stamps (definitive)
    if (product.has_upsell_stamps) {
      results.push(mk(product, 'upsell', 98, 'upsell_app_stamp', ['Upsell app stamp in line_item.properties']));
      continue;
    }

    // Rule 2: SKU patterns (definitive)
    if (product.sku_class === 'upsell' || product.sku_class === 'downsell') {
      results.push(mk(product, product.sku_class as 'upsell' | 'downsell', 95, 'sku_pattern', [`SKU contains ${product.sku_class} keyword`]));
      continue;
    }
    if (product.sku_class === 'main') {
      results.push(mk(product, 'main', 95, 'sku_pattern', ['SKU contains MAIN/CORE keyword']));
      mainProductIds.add(product.product_id);
      continue;
    }

    // ════════════════════════════════════════════════════════
    // TIER 2: Universal price + alone_rate rules
    // Works for ALL models — no branching needed
    // ════════════════════════════════════════════════════════

    // Rule 3: Zero price — universal
    if (product.avg_price === 0) {
      if (product.alone_rate >= 0.30 && product.total_orders > 5) {
        results.push(mk(product, 'main', 92, 'free_entry_product',
          [`$0 price + ${(product.alone_rate * 100).toFixed(0)}% alone rate → free entry/lead magnet`]));
        mainProductIds.add(product.product_id);
        continue;
      }
      if (product.alone_rate < 0.10 && product.total_orders > 5) {
        results.push(mk(product, 'upsell', 90, 'free_addon',
          [`$0 price + ${(product.alone_rate * 100).toFixed(0)}% alone rate → free bonus/addon`]));
        continue;
      }
      // 10-30% alone → fall through to scoring
    }

    // ════════════════════════════════════════════════════════
    // TIER 3: Hard veto rules (universal)
    // ════════════════════════════════════════════════════════

    // Veto A: Revenue too small to be main
    if (product.revenue_share < 0.02 && product.price_gap_class === 'below_threshold') {
      results.push(mk(product, 'upsell', 88, 'low_revenue_veto',
        [`revenue_share ${(product.revenue_share * 100).toFixed(1)}% + below price threshold`]));
      continue;
    }

    // Veto B: Always with higher-revenue product
    if (product.always_with_other && product.co_occurs_with) {
      const coRevenue = revenueMap.get(product.co_occurs_with) ?? 0;
      if (coRevenue > product.total_revenue) {
        results.push(mk(product, 'upsell', 88, 'always_with_main_veto',
          [`Always with higher-revenue product (co_occur ${(product.co_occur_rate * 100).toFixed(0)}%)`]));
        continue;
      }
    }

    // Veto C: Not enough data
    if (product.total_orders < 10) {
      results.push(mk(product, 'pending', 30, 'insufficient_data',
        [`Only ${product.total_orders} orders — need 10+ for classification`]));
      continue;
    }

    // ════════════════════════════════════════════════════════
    // TIER 4: Weighted scoring (uses learned weights if available)
    // ════════════════════════════════════════════════════════
    const scored = await scoreUniversalAsync(product, model, storeId);
    results.push(scored);
    if (scored.classification === 'main') mainProductIds.add(product.product_id);
  }

  // ── Post-classification: detect parents + downsells ────
  for (const result of results) {
    if (result.classification !== 'upsell' && result.classification !== 'downsell') continue;
    const product = products.find(p => p.product_id === result.product_id);
    if (!product?.co_occurs_with || !mainProductIds.has(product.co_occurs_with)) continue;
    result.parent_product_id = product.co_occurs_with;
    result.relationship_type = result.classification === 'downsell' ? 'downsell_of' : 'upsell_of';
  }

  // Downsell detection: upsells that are mutually exclusive with a main
  detectDownsells(results, products, mainProductIds);

  // Persist + validate
  await persistV2Results(storeId, results);
  await validateV2(storeId, model, results);

  const mainCount = results.filter(r => r.classification === 'main').length;
  const reviewCount = results.filter(r => r.needs_review).length;
  console.log(`[PRISM:V2] ${storeId} model=${model}: ${results.length} products, ${mainCount} main, ${reviewCount} review`);
  return results;
}

// ── Default Signal Weights ───────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
  price_threshold: 25,
  price_ratio: 10,
  alone_rate: 30,
  revenue_share: 25,
  co_occurrence: 20,
  first_purchase: 15,
  order_position: 10,
  mystery_title: 20,
};

// ── Self-Learning: Load Tuned Weights ────────────────────

interface WeightRow { signal_name: string; weight: number; }
const weightCache = new Map<string, { weights: Record<string, number>; ts: number }>();
const WEIGHT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getLearnedWeights(storeId: string): Promise<Record<string, number>> {
  const cached = weightCache.get(storeId);
  if (cached && (Date.now() - cached.ts) < WEIGHT_CACHE_TTL) return cached.weights;

  const weights = { ...DEFAULT_WEIGHTS };
  try {
    const rows = await rest<WeightRow[]>(
      `/store_signal_weights?store_id=eq.${enc(storeId)}&select=signal_name,weight`
    );
    for (const r of rows) {
      if (r.signal_name in weights) weights[r.signal_name] = r.weight;
    }
  } catch { /* table may not exist — use defaults */ }

  weightCache.set(storeId, { weights, ts: Date.now() });
  return weights;
}

// ── Universal Weighted Scoring (with learned weights) ────

async function scoreUniversalAsync(product: ProductRow, model: StoreModel, storeId: string): Promise<ClassificationV2Result> {
  const w = await getLearnedWeights(storeId);
  return scoreWithWeights(product, model, w);
}

function scoreUniversal(product: ProductRow, model: StoreModel): ClassificationV2Result {
  return scoreWithWeights(product, model, DEFAULT_WEIGHTS);
}

function scoreWithWeights(product: ProductRow, model: StoreModel, w: Record<string, number>): ClassificationV2Result {
  let score = 0;
  const signals: string[] = [];
  const aloneWeight = model === 'free_plus_shipping' ? 0.5 : 1.0;

  // Price signal
  if (product.price_gap_class === 'above_threshold') {
    score += w.price_threshold;
    signals.push(`above_price_threshold +${w.price_threshold}`);
  } else if (product.avg_price > 0) {
    score -= Math.round(w.price_threshold * 0.8);
    signals.push(`below_price_threshold -${Math.round(w.price_threshold * 0.8)}`);
  }

  // Price ratio
  if (product.price_ratio_to_order > 0.5) {
    score += w.price_ratio;
    signals.push(`high_price_ratio ${product.price_ratio_to_order} +${w.price_ratio}`);
  } else if (product.price_ratio_to_order < 0.15 && product.price_ratio_to_order > 0) {
    score -= w.price_ratio;
    signals.push(`low_price_ratio ${product.price_ratio_to_order} -${w.price_ratio}`);
  }

  // Alone rate
  if (product.alone_rate > 0.4) {
    score += Math.round(w.alone_rate * aloneWeight);
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% +${Math.round(w.alone_rate * aloneWeight)}`);
  } else if (product.alone_rate > 0.2) {
    score += Math.round(w.alone_rate * 0.5 * aloneWeight);
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% +${Math.round(w.alone_rate * 0.5 * aloneWeight)}`);
  } else if (product.alone_rate < 0.05) {
    score -= Math.round(w.alone_rate * 0.83 * aloneWeight);
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% -${Math.round(w.alone_rate * 0.83 * aloneWeight)}`);
  }

  // Revenue share
  if (product.revenue_share > 0.15) {
    score += w.revenue_share;
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% +${w.revenue_share}`);
  } else if (product.revenue_share > 0.05) {
    score += Math.round(w.revenue_share * 0.4);
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% +${Math.round(w.revenue_share * 0.4)}`);
  } else if (product.revenue_share < 0.02) {
    score -= Math.round(w.revenue_share * 0.8);
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% -${Math.round(w.revenue_share * 0.8)}`);
  }

  // Co-occurrence
  if (product.co_occur_rate > 0.6) {
    score -= w.co_occurrence;
    signals.push(`often_co_occurs ${(product.co_occur_rate * 100).toFixed(0)}% -${w.co_occurrence}`);
  } else if (product.co_occur_rate < 0.1) {
    score += Math.round(w.co_occurrence * 0.5);
    signals.push(`rarely_co_occurs +${Math.round(w.co_occurrence * 0.5)}`);
  }

  // First purchase rate
  if (product.first_purchase_rate > 0.4) {
    score += w.first_purchase;
    signals.push(`first_purchase ${(product.first_purchase_rate * 100).toFixed(0)}% +${w.first_purchase}`);
  } else if (product.first_purchase_rate < 0.05) {
    score -= Math.round(w.first_purchase * 0.67);
    signals.push(`low_first_purchase -${Math.round(w.first_purchase * 0.67)}`);
  }

  // Order position
  if (product.avg_position_in_order <= 1.2) {
    score += w.order_position;
    signals.push(`first_in_order +${w.order_position}`);
  } else if (product.always_last) {
    score -= w.order_position;
    signals.push(`always_last_in_order -${w.order_position}`);
  }

  // Mystery box title
  if (/mystery|blind.?box|surprise|grab.?bag/i.test(product.title)) {
    score += w.mystery_title;
    signals.push(`mystery_box_title +${w.mystery_title}`);
  }

  // Decision
  let classification: ClassificationV2Result['classification'];
  let confidence: number;

  if (score >= 60) { classification = 'main'; confidence = 92; }
  else if (score >= 35) { classification = 'main'; confidence = 75; }
  else if (score >= 10) { classification = 'pending'; confidence = 55; }
  else if (score >= -20) { classification = 'upsell'; confidence = 70; }
  else { classification = 'upsell'; confidence = 88; }

  return mk(product, classification, confidence, 'universal_scoring', signals, confidence < 85);
}

// ── Downsell Detection ──────────────────────────────────

function detectDownsells(
  results: ClassificationV2Result[],
  products: ProductRow[],
  mainIds: Set<string>,
): void {
  const productMap = new Map<string, ProductRow>();
  for (const p of products) productMap.set(p.product_id, p);

  for (const result of results) {
    if (result.classification !== 'upsell' || result.method === 'manual_override') continue;

    const product = productMap.get(result.product_id);
    if (!product) continue;

    for (const mainId of Array.from(mainIds)) {
      const mainProduct = productMap.get(mainId);
      if (!mainProduct || mainProduct.avg_price === 0) continue;
      if (product.avg_price === 0) continue;

      const priceRatio = product.avg_price / mainProduct.avg_price;
      // Downsell: rarely together + 20-80% of main price + sometimes bought alone
      if (product.co_occur_rate < 0.05 && priceRatio >= 0.2 && priceRatio <= 0.8 && product.alone_rate > 0.15) {
        result.classification = 'downsell';
        result.parent_product_id = mainId;
        result.relationship_type = 'downsell_of';
        result.confidence = 82;
        result.method = 'downsell_detection';
        result.signals.push(`Downsell of ${mainProduct.title}: price ratio ${(priceRatio * 100).toFixed(0)}%, co_occur ${(product.co_occur_rate * 100).toFixed(0)}%`);
        break;
      }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────

function mk(
  product: ProductRow,
  classification: ClassificationV2Result['classification'],
  confidence: number,
  method: string,
  signals: string[],
  needsReview?: boolean,
): ClassificationV2Result {
  return {
    product_id: product.product_id,
    product_title: product.title,
    classification,
    confidence,
    method,
    parent_product_id: null,
    relationship_type: null,
    needs_review: needsReview ?? confidence < 85,
    signals,
  };
}

// ── Persistence ─────────────────────────────────────────

async function persistV2Results(storeId: string, results: ClassificationV2Result[]): Promise<void> {
  const now = new Date().toISOString();
  const rows = results
    .filter(r => r.method !== 'manual_override')
    .map(r => ({
      store_id: storeId,
      product_id: r.product_id,
      product_title: r.product_title,
      classification: r.classification,
      confidence: r.confidence,
      classification_method: r.method,
      detection_method: r.method,
      parent_product: r.parent_product_id,
      relationship_type: r.relationship_type,
      needs_review: r.needs_review,
      signals_used: { v2_signals: r.signals },
      manual_override: false,
      last_analyzed: now,
      updated_at: now,
    }));

  for (let i = 0; i < rows.length; i += 50) {
    await rest('/product_classifications?on_conflict=store_id,product_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 50)),
    }).catch(err => console.error('[PRISM:V2] Persist error:', err instanceof Error ? err.message : err));
  }
}

// ── Validation ──────────────────────────────────────────

const MAX_MAINS: Record<string, number> = {
  free_plus_shipping: 8, tripwire: 5, standard: 10, high_ticket: 5,
  subscription: 5, bundle: 5, digital: 10, dropshipping: 15,
  multi_product: 20, hybrid: 10, mystery_box: 6, preorder: 8,
  b2b: 30, hybrid_physical_digital: 15,
};

async function validateV2(storeId: string, model: StoreModel, results: ClassificationV2Result[]): Promise<void> {
  const warnings: string[] = [];
  const mainCount = results.filter(r => r.classification === 'main').length;
  const upsellCount = results.filter(r => r.classification === 'upsell').length;
  const pendingCount = results.filter(r => r.classification === 'pending').length;
  const reviewCount = results.filter(r => r.needs_review).length;

  if (mainCount === 0) warnings.push('NO main products — classification may have failed');
  if (mainCount > (MAX_MAINS[model] ?? 10)) warnings.push(`${mainCount} mains exceeds max ${MAX_MAINS[model] ?? 10} for ${model}`);

  // $0 mains only valid in funnel/mystery stores
  if (model !== 'free_plus_shipping' && model !== 'mystery_box') {
    const zeroMains = results.filter(r => r.classification === 'main' && r.signals.some(s => s.includes('$0')));
    if (zeroMains.length > 0) warnings.push(`${zeroMains.length} main products have $0 — unusual for ${model}`);
  }

  try {
    await rest('/classification_health?on_conflict=store_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId, checks_passed: warnings.length === 0, warnings,
        main_count: mainCount, upsell_count: upsellCount,
        pending_count: pendingCount, review_count: reviewCount,
        store_model: model, checked_at: new Date().toISOString(),
      }),
    });
  } catch { /* table may not exist */ }

  if (warnings.length > 0) console.warn(`[PRISM:V2] Warnings ${storeId}:`, warnings);
}

// ── Self-Learning Engine ─────────────────────────────────
//
// When a merchant manually overrides a classification, PRISM:
// 1. Records the correction (what was wrong and what's right)
// 2. Analyzes which signals led to the wrong answer
// 3. Adjusts per-store signal weights to avoid the same mistake
// 4. Next classification run uses tuned weights automatically
//
// This creates a feedback loop:
//   Merchant corrects → PRISM learns → better accuracy → fewer corrections

/**
 * Record a merchant override and tune signal weights.
 */
export async function learnFromOverride(
  storeId: string, productId: string,
  correctClassification: string, previousClassification: string,
  signals: string[],
): Promise<void> {
  // 1. Record the learning
  try {
    await rest('/classification_learnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_id: storeId, product_id: productId,
        correct_classification: correctClassification,
        previous_classification: previousClassification,
        signals_at_time: { v2_signals: signals },
        learned_at: new Date().toISOString(),
      }),
    });
  } catch { /* table may not exist */ }

  // 2. Analyze and adjust weights
  try {
    await tuneWeightsFromCorrection(storeId, signals, previousClassification, correctClassification);
  } catch { /* non-critical */ }

  // 3. Clear weight cache so next run uses new weights
  weightCache.delete(storeId);
}

/**
 * Tune per-store signal weights based on a correction.
 *
 * Logic: if PRISM said "main" but correct is "upsell":
 *   - Signals that pushed score UP were WRONG → decrease their weight
 *   - Signals that pushed score DOWN were RIGHT → increase their weight
 * And vice versa.
 */
async function tuneWeightsFromCorrection(
  storeId: string,
  signals: string[],
  previousClass: string,
  correctClass: string,
): Promise<void> {
  // Determine if the score was too high (false main) or too low (false upsell)
  const scoredTooHigh = previousClass === 'main' && (correctClass === 'upsell' || correctClass === 'downsell');
  const scoredTooLow = previousClass === 'upsell' && correctClass === 'main';
  if (!scoredTooHigh && !scoredTooLow) return;

  // Parse signal names from signal strings like "alone_rate 45% +15"
  const signalNames = new Set<string>();
  for (const s of signals) {
    const match = s.match(/^(\w+)/);
    if (match) signalNames.add(match[1]);
  }

  // Map signal strings to weight keys
  const signalToWeight: Record<string, string> = {
    above_price_threshold: 'price_threshold', below_price_threshold: 'price_threshold',
    high_price_ratio: 'price_ratio', low_price_ratio: 'price_ratio',
    alone_rate: 'alone_rate',
    revenue_share: 'revenue_share',
    often_co_occurs: 'co_occurrence', rarely_co_occurs: 'co_occurrence',
    first_purchase: 'first_purchase', low_first_purchase: 'first_purchase',
    first_in_order: 'order_position', always_last_in_order: 'order_position',
    mystery_box_title: 'mystery_title',
  };

  // Load current weights
  const currentWeights = await getLearnedWeights(storeId);
  const LEARNING_RATE = 0.15; // 15% adjustment per correction

  for (const signalStr of signals) {
    const nameMatch = signalStr.match(/^(\w+)/);
    if (!nameMatch) continue;
    const signalName = nameMatch[1];
    const weightKey = signalToWeight[signalName];
    if (!weightKey) continue;

    const isPositiveSignal = signalStr.includes('+');
    const currentWeight = currentWeights[weightKey] ?? DEFAULT_WEIGHTS[weightKey] ?? 10;

    let newWeight: number;
    if (scoredTooHigh) {
      // Score was too high → positive signals should weigh less, negative signals more
      newWeight = isPositiveSignal
        ? currentWeight * (1 - LEARNING_RATE)   // decrease
        : currentWeight * (1 + LEARNING_RATE);   // increase
    } else {
      // Score was too low → positive signals should weigh more, negative signals less
      newWeight = isPositiveSignal
        ? currentWeight * (1 + LEARNING_RATE)   // increase
        : currentWeight * (1 - LEARNING_RATE);   // decrease
    }

    // Clamp between 1 and 50 (never zero, never extreme)
    newWeight = Math.max(1, Math.min(50, Math.round(newWeight * 100) / 100));

    const isCorrect = (scoredTooHigh && !isPositiveSignal) || (scoredTooLow && isPositiveSignal);

    await rest('/store_signal_weights?on_conflict=store_id,signal_name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        signal_name: weightKey,
        weight: newWeight,
        correct_count: isCorrect ? 1 : 0,
        wrong_count: isCorrect ? 0 : 1,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => null);
  }

  console.log(`[PRISM:Learn] ${storeId}: tuned weights from ${previousClass}→${correctClass} correction (${signals.length} signals adjusted)`);
}

/**
 * Auto-learn: compare product_config (merchant truth) with PRISM's behavioral classification.
 * If they disagree, treat product_config as ground truth and tune weights.
 *
 * Called during daily sync — PRISM evolves automatically without merchant doing anything.
 */
export async function autoLearnFromProductConfig(storeId: string): Promise<number> {
  // Get merchant-configured main products (ground truth)
  const configs = await rest<Array<{ product_id: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id`
  ).catch(() => []);
  if (configs.length === 0) return 0;
  const configMainIds = new Set(configs.map(r => r.product_id));

  // Get PRISM's behavioral classifications
  const classifications = await rest<Array<{
    product_id: string; classification: string; signals_used: { v2_signals?: string[] } | null;
    manual_override: boolean;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&classification_method=eq.universal_scoring&select=product_id,classification,signals_used,manual_override`
  ).catch(() => []);

  let corrections = 0;

  for (const cls of classifications) {
    if (cls.manual_override) continue; // don't learn from manual overrides (circular)

    const isConfigMain = configMainIds.has(cls.product_id);
    const prismSaysMain = cls.classification === 'main';

    // Disagreement = learning opportunity
    if (isConfigMain && !prismSaysMain) {
      // PRISM missed a main product → score was too low
      const signals = cls.signals_used?.v2_signals || [];
      await tuneWeightsFromCorrection(storeId, signals, cls.classification, 'main');
      corrections++;
    } else if (!isConfigMain && prismSaysMain) {
      // PRISM falsely detected main → score was too high
      const signals = cls.signals_used?.v2_signals || [];
      await tuneWeightsFromCorrection(storeId, signals, 'main', 'upsell');
      corrections++;
    }
  }

  if (corrections > 0) {
    weightCache.delete(storeId);
    console.log(`[PRISM:AutoLearn] ${storeId}: ${corrections} corrections from product_config comparison`);
  }

  return corrections;
}

// ── Product Activity Tracking ────────────────────────────
//
// Scans order data to learn first_order_date and last_order_date per product.
// Products with no orders in the last 14 days are marked is_active=false.
// This runs daily during auto-sync.

export async function updateProductActivityDates(storeId: string): Promise<number> {
  // Scan recent orders (newest first) to find activity per product.
  // Use 60-day cutoff to avoid scanning ancient data.
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoffIso = sixtyDaysAgo.toISOString();

  const orders = await rest<Array<{ line_items: string; created_at: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(cutoffIso)}&select=line_items,created_at&limit=5000&order=created_at.desc`
  ).catch(() => []);

  if (orders.length === 0) return 0;

  // Track first and last order date per product_id
  const activity = new Map<string, { firstDate: string; lastDate: string; title: string }>();

  for (const order of orders) {
    let items: Array<{ product_id?: string | number; title?: string }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }

    const orderDate = order.created_at.slice(0, 10); // YYYY-MM-DD

    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : '';
      if (!pid || pid === 'null' || pid === '0') continue;

      const existing = activity.get(pid);
      if (!existing) {
        activity.set(pid, { firstDate: orderDate, lastDate: orderDate, title: item.title || '' });
      } else {
        if (orderDate < existing.firstDate) existing.firstDate = orderDate;
        if (orderDate > existing.lastDate) existing.lastDate = orderDate;
        if (!existing.title && item.title) existing.title = item.title;
      }
    }
  }

  // Merge with existing DB dates (in case older scans had earlier first_order_dates)
  const existingRows = await rest<Array<{ product_id: string; first_order_date: string | null; last_order_date: string | null }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,first_order_date,last_order_date`
  ).catch(() => []);

  const existingMap = new Map<string, { first: string | null; last: string | null }>();
  for (const r of existingRows) existingMap.set(r.product_id, { first: r.first_order_date, last: r.last_order_date });

  // Determine active status: product had an order in last 14 days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 14);
  const cutoffStr = cutoffDate.toISOString().slice(0, 10);

  let updated = 0;
  const now = new Date().toISOString();

  // Build rows with merged dates (take earliest first, latest last)
  const rows = Array.from(activity.entries()).map(([pid, a]) => {
    const existing = existingMap.get(pid);
    const firstDate = existing?.first && existing.first < a.firstDate ? existing.first : a.firstDate;
    const lastDate = existing?.last && existing.last > a.lastDate ? existing.last : a.lastDate;
    return {
      store_id: storeId,
      product_id: pid,
      product_title: a.title,
      first_order_date: firstDate,
      last_order_date: lastDate,
      is_active: lastDate >= cutoffStr,
      updated_at: now,
    };
  });

  // Update via PATCH per product (ensures dates always move forward, never backward)
  for (const row of rows) {
    await rest(`/product_classifications?store_id=eq.${enc(storeId)}&product_id=eq.${enc(row.product_id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        first_order_date: row.first_order_date,
        last_order_date: row.last_order_date,
        is_active: row.is_active,
        updated_at: row.updated_at,
      }),
    }).catch(() => null);
    updated++;
  }

  const activeCount = rows.filter(r => r.is_active).length;
  const inactiveCount = rows.filter(r => !r.is_active).length;
  console.log(`[PRISM:Activity] ${storeId}: ${updated} products tracked, ${activeCount} active, ${inactiveCount} inactive`);

  return updated;
}
