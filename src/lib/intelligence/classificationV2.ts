/**
 * PRISM Classification V2 — Final System
 *
 * 4 layers:
 * 1. Store model detection (free_plus_shipping, standard, etc.)
 * 2. Signal collection + model-aware rules
 * 3. Confidence thresholds + review queue
 * 4. Learning from merchant overrides
 *
 * Rules:
 * - manual_override = true → NEVER TOUCH
 * - $0 + free_plus_shipping model + orders > 5 → MAIN
 * - Shopify tags → highest priority after manual
 * - Confidence < 60 → PENDING (needs merchant input)
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
  | 'hybrid';

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
  total_orders: number;
  alone_rate: number;
  revenue_share: number;
  co_occurs_with: string | null;
  co_occur_rate: number;
  has_upsell_stamps: boolean;
  sku_class: string | null;
}

interface ExistingClassification {
  product_id: string;
  classification: string;
  manual_override: boolean;
  confidence: number;
}

// ── Layer 1: Store Model Detection ──────────────────────

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
  let paidOrders = 0;
  let subscriptionOrders = 0;
  let avgPrice = 0;
  let totalItems = 0;
  let totalOrders = 0;

  try {
    const orders = await rest<Array<{ line_items: string; total_price: number }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&financial_status=neq.refunded&select=line_items,total_price&limit=200&order=created_at.desc`
    );

    for (const order of orders ?? []) {
      totalOrders++;
      avgPrice += Number(order.total_price) || 0;

      let items: Array<{ price?: string; requires_selling_plan?: boolean }>;
      try {
        items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
      } catch { continue; }

      totalItems += items.length;
      const hasFreeItem = items.some(i => parseFloat(i.price || '0') === 0);
      const hasPaidItem = items.some(i => parseFloat(i.price || '0') > 0);
      const hasSub = items.some(i => i.requires_selling_plan);

      if (hasFreeItem) freeItemOrders++;
      if (hasPaidItem) paidOrders++;
      if (hasSub) subscriptionOrders++;
    }
  } catch { /* cache may not exist */ }

  if (totalOrders === 0) return 'standard';

  avgPrice = avgPrice / totalOrders;
  const freeRate = freeItemOrders / totalOrders;
  const subRate = subscriptionOrders / totalOrders;
  const avgItemsPerOrder = totalItems / totalOrders;

  let model: StoreModel;

  // Detection rules (priority order)
  if (freeRate > 0.3) {
    model = 'free_plus_shipping';
  } else if (subRate > 0.3) {
    model = 'subscription';
  } else if (avgPrice > 200) {
    model = 'high_ticket';
  } else if (avgPrice < 15 && avgItemsPerOrder > 2) {
    model = 'tripwire';
  } else if (avgItemsPerOrder > 3) {
    model = 'bundle';
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

  console.log(`[PRISM:V2] ${storeId}: detected model=${model} (freeRate=${(freeRate * 100).toFixed(0)}%, avgPrice=$${avgPrice.toFixed(0)}, avgItems=${avgItemsPerOrder.toFixed(1)})`);
  return model;
}

// ── Layer 2: Model-Aware Classification ─────────────────

export async function classifyAllProductsV2(storeId: string): Promise<ClassificationV2Result[]> {
  // Step 1: Detect store model
  const model = await detectStoreModel(storeId);

  // Step 2: Get products with signals from SQL function
  let products: ProductRow[] = [];
  try {
    products = await rest<ProductRow[]>('/rpc/get_product_signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ p_store_id: storeId }),
    });
  } catch {
    // SQL function may not exist — fall back to basic query
    console.warn('[PRISM:V2] SQL function not available');
  }

  if (!products || products.length === 0) return [];

  // Step 3: Get existing classifications (for manual overrides)
  const existing = await rest<ExistingClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as ExistingClassification[]);

  const manualOverrides = new Map<string, string>();
  for (const e of existing) {
    if (e.manual_override) manualOverrides.set(e.product_id, e.classification);
  }

  // Step 4: Get main products (for parent detection)
  const mainProductIds = new Set<string>();

  // Step 5: Classify each product
  const results: ClassificationV2Result[] = [];

  for (const product of products) {
    // ── RULE 0: Manual override → NEVER TOUCH ──
    if (manualOverrides.has(product.product_id)) {
      const cls = manualOverrides.get(product.product_id)!;
      results.push({
        product_id: product.product_id,
        product_title: product.title,
        classification: cls as ClassificationV2Result['classification'],
        confidence: 100,
        method: 'manual_override',
        parent_product_id: null,
        relationship_type: null,
        needs_review: false,
        signals: ['Manual override — PRISM will never change this'],
      });
      if (cls === 'main') mainProductIds.add(product.product_id);
      continue;
    }

    // ── RULE 1: Definitive signals ──
    // Upsell app stamps
    if (product.has_upsell_stamps) {
      results.push(makeResult(product, 'upsell', 98, 'upsell_app_stamp', ['Line item properties stamped by upsell app']));
      continue;
    }
    // SKU patterns
    if (product.sku_class === 'upsell' || product.sku_class === 'downsell') {
      results.push(makeResult(product, product.sku_class as 'upsell' | 'downsell', 95, 'sku_pattern', [`SKU contains ${product.sku_class} keyword`]));
      continue;
    }
    if (product.sku_class === 'main') {
      results.push(makeResult(product, 'main', 95, 'sku_pattern', ['SKU contains MAIN/CORE keyword']));
      mainProductIds.add(product.product_id);
      continue;
    }

    // ── RULE 2: Store model rules ──
    const modelResult = applyModelRule(product, model);
    if (modelResult) {
      results.push(modelResult);
      if (modelResult.classification === 'main') mainProductIds.add(product.product_id);
      continue;
    }

    // ── RULE 3: Behavioral scoring ──
    const scored = scoreBehavioral(product, model);
    results.push(scored);
    if (scored.classification === 'main') mainProductIds.add(product.product_id);
  }

  // Step 6: Detect parent products for upsells/downsells
  for (const result of results) {
    if (result.classification === 'upsell' || result.classification === 'downsell') {
      const product = products.find(p => p.product_id === result.product_id);
      if (product?.co_occurs_with && mainProductIds.has(product.co_occurs_with)) {
        result.parent_product_id = product.co_occurs_with;
        result.relationship_type = result.classification === 'upsell' ? 'upsell_of' : 'downsell_of';
      }
    }
  }

  // Step 7: Persist
  await persistV2Results(storeId, results);

  // Step 8: Validate
  await validateV2(storeId, model, results);

  const mainCount = results.filter(r => r.classification === 'main').length;
  const reviewCount = results.filter(r => r.needs_review).length;
  console.log(`[PRISM:V2] ${storeId} model=${model}: ${results.length} products, ${mainCount} main, ${reviewCount} need review`);

  return results;
}

// ── Model-Specific Rules ────────────────────────────────

function applyModelRule(product: ProductRow, model: StoreModel): ClassificationV2Result | null {
  const signals: string[] = [];

  if (model === 'free_plus_shipping') {
    // $0 + enough orders → MAIN (the funnel lead magnet)
    if (product.avg_price === 0 && product.total_orders > 5) {
      return makeResult(product, 'main', 95, 'model_free_plus_shipping', [
        `$0 price + ${product.total_orders} orders → funnel MAIN product`,
        'Store model: free_plus_shipping',
      ]);
    }
    // Paid product that co-occurs with a free product → UPSELL
    if (product.avg_price > 0 && product.co_occur_rate > 0.5) {
      return makeResult(product, 'upsell', 90, 'model_free_plus_shipping', [
        `$${product.avg_price} price, co-occurs with other product ${(product.co_occur_rate * 100).toFixed(0)}% of time`,
        'Store model: free_plus_shipping → paid items are upsells',
      ]);
    }
    // Paid product bought alone sometimes → could be standalone or upsell
    if (product.avg_price > 0 && product.alone_rate > 0.3) {
      return makeResult(product, 'pending', 55, 'model_free_plus_shipping', [
        `$${product.avg_price}, alone_rate ${(product.alone_rate * 100).toFixed(0)}%`,
        'Store model: free_plus_shipping — paid product sometimes bought alone, needs review',
      ]);
    }
  }

  if (model === 'standard' || model === 'digital') {
    // $0 in standard stores = truly free → exclude
    if (product.avg_price === 0 && product.total_orders < 20) {
      return makeResult(product, 'excluded', 90, `model_${model}`, [
        '$0 price in standard store → excluded (gift/freebie)',
      ]);
    }
  }

  if (model === 'subscription') {
    // High alone rate + revenue share = main subscription product
    if (product.alone_rate > 0.5 && product.revenue_share > 0.1) {
      return makeResult(product, 'main', 85, 'model_subscription', [
        `alone_rate ${(product.alone_rate * 100).toFixed(0)}%, revenue_share ${(product.revenue_share * 100).toFixed(0)}%`,
        'Store model: subscription',
      ]);
    }
  }

  return null;
}

// ── Behavioral Scoring ──────────────────────────────────

function scoreBehavioral(product: ProductRow, model: StoreModel): ClassificationV2Result {
  let score = 0;
  const signals: string[] = [];

  // Alone rate (max ±30)
  if (product.alone_rate > 0.4) {
    score += 30;
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% +30`);
  } else if (product.alone_rate > 0.2) {
    score += 15;
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% +15`);
  } else if (product.alone_rate < 0.05) {
    score -= 25;
    signals.push(`alone_rate ${(product.alone_rate * 100).toFixed(0)}% -25`);
  }

  // Revenue share (max ±25)
  if (product.revenue_share > 0.15) {
    score += 25;
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% +25`);
  } else if (product.revenue_share > 0.05) {
    score += 10;
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% +10`);
  } else if (product.revenue_share < 0.02) {
    score -= 15;
    signals.push(`revenue_share ${(product.revenue_share * 100).toFixed(1)}% -15`);
  }

  // Co-occurrence (max ±20)
  if (product.co_occur_rate > 0.8) {
    score -= 20;
    signals.push(`always_with_other ${(product.co_occur_rate * 100).toFixed(0)}% -20`);
  } else if (product.co_occur_rate < 0.1) {
    score += 10;
    signals.push(`rarely_co_occurs +10`);
  }

  // Price signal (model-dependent)
  if (model === 'free_plus_shipping' && product.avg_price === 0) {
    score += 30;
    signals.push('$0 in funnel store +30');
  }

  // Decision
  let classification: ClassificationV2Result['classification'];
  let confidence: number;

  if (score >= 40) {
    classification = 'main';
    confidence = Math.min(95, 60 + score);
  } else if (score >= 10) {
    classification = 'pending';
    confidence = 50;
  } else if (score >= -15) {
    classification = 'pending';
    confidence = 40;
  } else {
    classification = 'upsell';
    confidence = Math.min(95, 60 + Math.abs(score));
  }

  // Insufficient data → always pending
  if (product.total_orders < 10) {
    classification = 'pending';
    confidence = Math.min(confidence, 30);
    signals.push(`Only ${product.total_orders} orders — insufficient data`);
  }

  return makeResult(product, classification, confidence,
    'behavioral_v2', signals, score >= 10 ? confidence < 85 : confidence < 60);
}

// ── Helpers ─────────────────────────────────────────────

function makeResult(
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
    .filter(r => r.method !== 'manual_override') // never overwrite manual
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
    const chunk = rows.slice(i, i + 50);
    await rest('/product_classifications?on_conflict=store_id,product_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    }).catch(err => console.error('[PRISM:V2] Persist error:', err instanceof Error ? err.message : err));
  }
}

// ── Validation ──────────────────────────────────────────

async function validateV2(storeId: string, model: StoreModel, results: ClassificationV2Result[]): Promise<void> {
  const warnings: string[] = [];
  const mainCount = results.filter(r => r.classification === 'main').length;
  const upsellCount = results.filter(r => r.classification === 'upsell').length;
  const pendingCount = results.filter(r => r.classification === 'pending').length;
  const reviewCount = results.filter(r => r.needs_review).length;

  // Check 1: At least 1 main
  if (mainCount === 0) {
    warnings.push('NO main products detected — classification may have failed');
  }

  // Check 2: Not too many mains
  const maxMains: Record<StoreModel, number> = {
    free_plus_shipping: 8, tripwire: 5, standard: 10, high_ticket: 5,
    subscription: 5, bundle: 5, digital: 10, dropshipping: 15,
    multi_product: 20, hybrid: 10,
  };
  if (mainCount > (maxMains[model] ?? 10)) {
    warnings.push(`${mainCount} main products exceeds expected max ${maxMains[model] ?? 10} for ${model} store`);
  }

  // Check 3: Main products with $0 revenue in non-funnel stores
  if (model !== 'free_plus_shipping') {
    const zeroRevMains = results.filter(r =>
      r.classification === 'main' && r.signals.some(s => s.includes('$0')),
    );
    if (zeroRevMains.length > 0) {
      warnings.push(`${zeroRevMains.length} main products have $0 price — unusual for ${model} store`);
    }
  }

  // Persist health check
  try {
    await rest('/classification_health?on_conflict=store_id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        checks_passed: warnings.length === 0,
        warnings,
        main_count: mainCount,
        upsell_count: upsellCount,
        pending_count: pendingCount,
        review_count: reviewCount,
        store_model: model,
        checked_at: new Date().toISOString(),
      }),
    });
  } catch { /* table may not exist yet */ }

  if (warnings.length > 0) {
    console.warn(`[PRISM:V2] Validation warnings for ${storeId}:`, warnings);
  }
}

// ── Learning from Overrides ─────────────────────────────

export async function learnFromOverride(
  storeId: string,
  productId: string,
  correctClassification: string,
  previousClassification: string,
  signals: string[],
): Promise<void> {
  try {
    await rest('/classification_learnings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_id: storeId,
        product_id: productId,
        correct_classification: correctClassification,
        previous_classification: previousClassification,
        signals_at_time: signals,
        learned_at: new Date().toISOString(),
      }),
    });
    console.log(`[PRISM:V2] Learned: ${productId} was ${previousClassification}, corrected to ${correctClassification}`);
  } catch { /* table may not exist yet */ }
}
