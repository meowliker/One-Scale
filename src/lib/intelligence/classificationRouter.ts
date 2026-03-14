/**
 * Classification Router
 *
 * Routes each store through the correct classification path based on store type.
 * Never runs unnecessary classification — single_product and general stores skip
 * the signal stack entirely.
 *
 * Manual overrides are permanent and never overwritten during re-runs.
 * One store's classification never affects another.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { detectStoreType } from './storeTypeDetector';
import { analyzeOrderPatterns, partitionByDataSufficiency } from './orderPatternAnalyzer';
import { computeSignals, classifyProduct, computeMedianPrice, checkShopifyTags } from './signalStackClassifier';
import { getStoreIntelligence } from './storeIntelligence';
import type { StoreType, SignalStackResult, ProductOrderPattern } from './types';

// ── Interfaces ───────────────────────────────────────────────

interface StoredClassification {
  product_id: string;
  classification: string;
  manual_override: boolean;
  confidence: number;
}

export interface ClassifyResult {
  classified: number;
  needsReview: number;
  results: SignalStackResult[];
}

// ── Main Entry Point ─────────────────────────────────────────

export async function classifyAllProducts(storeId: string): Promise<ClassifyResult> {
  const enc = (v: string) => encodeURIComponent(v);

  // ── Bootstrap path: stores with < 30 recent orders ──────────────────
  // Provides best-guess classifications with low confidence instead of
  // showing everything as 'pending'. Automatically upgraded when more
  // data arrives via the weekly cron or next onboarding run.
  const recentCutoff = new Date(Date.now() - 60 * 86400000).toISOString();
  const recentOrders = await rest<Array<{ shopify_order_id: string; line_items: string; total_price: number }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(recentCutoff)}&order_status=neq.cancelled&financial_status=neq.refunded&select=shopify_order_id,line_items,total_price&limit=500`
  ).catch(() => []);

  if (recentOrders.length < 30) {
    console.log(`[Classification] ${storeId}: ${recentOrders.length} recent orders — using bootstrap classifier`);
    return bootstrapClassify(storeId, recentOrders);
  }

  // 1. Get or detect store intelligence
  let intel = await getStoreIntelligence(storeId);
  if (!intel || !('store_type' in intel)) {
    await detectStoreType(storeId);
    intel = await getStoreIntelligence(storeId);
  }

  // Determine effective store type (merchant override takes priority)
  const rawIntel = intel as Record<string, unknown> | null;
  const merchantConfirmed = rawIntel?.merchant_confirmed_type as StoreType | null;
  const detectedType = (rawIntel?.store_type as StoreType) || 'mixed';
  const storeType: StoreType = merchantConfirmed || detectedType;

  // 2. Load existing manual overrides — NEVER overwrite these
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.true&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as StoredClassification[]);

  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

  // 2b. Tag-first pass — check Shopify tags before signal stack
  const allPatterns = await analyzeOrderPatterns(storeId);
  const tagMatchedResults: SignalStackResult[] = [];
  const tagMatchedIds = new Set<string>();

  for (const p of allPatterns) {
    if (manualOverrideIds.has(p.product_id)) continue;
    const tagResult = checkShopifyTags(p.tags || '');
    if (tagResult) {
      tagMatchedIds.add(p.product_id);
      const classification = tagResult === 'exclude' ? 'excluded' : tagResult;
      tagMatchedResults.push({
        product_id: p.product_id,
        product_title: p.product_title,
        product_type: p.product_type,
        classification: classification as SignalStackResult['classification'],
        confidence: 100,
        method: 'shopify_tag',
        signals: null,
        alone_pct: p.alone_pct,
        first_position_pct: p.first_position_pct,
        avg_position: p.avg_position,
        revenue_share: p.revenue_share,
        total_orders_analyzed: p.total_orders,
        needs_review: false,
      });
    }
  }

  // 3. Route by store type (skip tag-matched products)
  let results: SignalStackResult[];

  switch (storeType) {
    case 'single_product':
    case 'general':
      results = await markAllAsMain(storeId, storeType, manualOverrideIds, tagMatchedIds);
      break;
    case 'subscription':
      results = await classifyWithSubscriptionPriority(storeId, manualOverrideIds, tagMatchedIds);
      break;
    case 'funnel':
    case 'mixed':
    default:
      results = await runFullSignalStack(storeId, manualOverrideIds, tagMatchedIds);
      break;
  }

  // Merge tag-matched results
  results = [...tagMatchedResults, ...results];

  // 4. Apply edge cases to ALL results regardless of store type
  results = applyEdgeCases(results);

  // 5. Persist to product_classifications table (skip manual overrides)
  await persistClassifications(storeId, results, manualOverrideIds);

  // 6. Update store_intelligence timestamp
  await rest(
    `/store_intelligence?store_id=eq.${enc(storeId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        store_type_detected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }
  ).catch(() => { /* table might not exist */ });

  const needsReview = results.filter(r => r.needs_review).length;
  return { classified: results.length, needsReview, results };
}

// ── Store-Type-Specific Paths ────────────────────────────────

/**
 * single_product & general: mark ALL products as MAIN.
 * No signal stack needed. Every product is independent/hero.
 */
async function markAllAsMain(
  storeId: string,
  reason: string,
  skipIds: Set<string>,
  tagMatchedIds: Set<string> = new Set(),
): Promise<SignalStackResult[]> {
  const patterns = await analyzeOrderPatterns(storeId);
  return patterns
    .filter(p => !skipIds.has(p.product_id) && !tagMatchedIds.has(p.product_id))
    .map(p => ({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'main' as const,
      confidence: 90,
      method: 'store_type_rule' as const,
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    }));
}

/**
 * subscription: subscription products → MAIN always.
 * Non-subscription products → run signal stack.
 */
async function classifyWithSubscriptionPriority(
  storeId: string,
  skipIds: Set<string>,
  tagMatchedIds: Set<string> = new Set(),
): Promise<SignalStackResult[]> {
  const patterns = await analyzeOrderPatterns(storeId);
  const results: SignalStackResult[] = [];

  const subscriptionPatterns: ProductOrderPattern[] = [];
  const nonSubscriptionPatterns: ProductOrderPattern[] = [];

  for (const p of patterns) {
    if (skipIds.has(p.product_id) || tagMatchedIds.has(p.product_id)) continue;
    if (p.requires_selling_plan) {
      subscriptionPatterns.push(p);
    } else {
      nonSubscriptionPatterns.push(p);
    }
  }

  // Subscription products → MAIN
  for (const p of subscriptionPatterns) {
    results.push({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'main',
      confidence: 95,
      method: 'store_type_rule',
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    });
  }

  // Non-subscription → signal stack
  const { sufficient, pending } = partitionByDataSufficiency(nonSubscriptionPatterns);
  const medianPrice = computeMedianPrice(sufficient);

  for (const p of sufficient) {
    const signals = computeSignals(p, medianPrice);
    results.push(classifyProduct(p, signals));
  }

  // Pending products (< 10 orders)
  for (const p of pending) {
    results.push({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'pending',
      confidence: 0,
      method: 'edge_case',
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    });
  }

  return results;
}

/**
 * funnel & mixed: run full signal stack for all products.
 */
async function runFullSignalStack(
  storeId: string,
  skipIds: Set<string>,
  tagMatchedIds: Set<string> = new Set(),
): Promise<SignalStackResult[]> {
  const patterns = await analyzeOrderPatterns(storeId);
  const filtered = patterns.filter(p => !skipIds.has(p.product_id) && !tagMatchedIds.has(p.product_id));
  const { sufficient, pending } = partitionByDataSufficiency(filtered);
  const medianPrice = computeMedianPrice(sufficient);

  const results: SignalStackResult[] = [];

  for (const p of sufficient) {
    const signals = computeSignals(p, medianPrice);
    results.push(classifyProduct(p, signals));
  }

  for (const p of pending) {
    results.push({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'pending',
      confidence: 0,
      method: 'edge_case',
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    });
  }

  return results;
}

// ── Edge Cases ───────────────────────────────────────────────

// ── Bootstrap Classifier ──────────────────────────────────────
// For stores with < 30 recent orders. Uses alone-rate, Shopify tags,
// and title hints to produce best-guess classifications with low
// confidence. Automatically superseded once enough data exists.

async function bootstrapClassify(
  storeId: string,
  orders: Array<{ shopify_order_id: string; line_items: string; total_price: number }>,
): Promise<ClassifyResult> {
  const enc = (v: string) => encodeURIComponent(v);

  // Load manual overrides — NEVER overwrite
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.true&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as StoredClassification[]);
  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

  // Aggregate per-product stats from the available orders
  const stats = new Map<string, { title: string; productType: string; total: number; alone: number; revenue: number }>();
  for (const order of orders) {
    let items: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number; product_type?: string }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
    const validItems = items.filter(i => i.product_id);
    const isAlone = validItems.length === 1;
    for (const item of validItems) {
      const pid = String(item.product_id);
      const existing = stats.get(pid) ?? { title: item.title || '', productType: item.product_type || '', total: 0, alone: 0, revenue: 0 };
      existing.total++;
      if (isAlone) existing.alone++;
      existing.revenue += parseFloat(item.price || '0') * (item.quantity || 1);
      stats.set(pid, existing);
    }
  }

  const results: SignalStackResult[] = [];
  const UPSELL_TITLE_HINTS = ['upsell', 'upgrade', 'bundle', 'bonus', 'add-on', 'addon', 'extra', 'premium', 'vip', 'rush'];

  for (const [pid, s] of stats) {
    if (manualOverrideIds.has(pid)) continue;

    // Check Shopify tags via any tag overrides in the order data
    const tagResult = checkShopifyTags(''); // Tags not available from line_items — handled by full classifier later
    let classification: string;
    let confidence: number;
    let method: string;

    const aloneRate = s.total > 0 ? s.alone / s.total : 0;
    const titleLower = s.title.toLowerCase();

    if (s.total >= 3) {
      // Enough orders for alone-rate signal
      if (aloneRate >= 0.7) {
        classification = 'main'; confidence = Math.min(35 + s.total * 3, 65); method = 'bootstrap_alone_rate';
      } else if (aloneRate <= 0.1) {
        classification = 'upsell'; confidence = Math.min(35 + s.total * 3, 65); method = 'bootstrap_alone_rate';
      } else {
        classification = 'main'; confidence = 25; method = 'bootstrap_default';
      }
    } else if (UPSELL_TITLE_HINTS.some(kw => titleLower.includes(kw))) {
      classification = 'upsell'; confidence = 20; method = 'bootstrap_title_hint';
    } else {
      classification = 'main'; confidence = 20; method = 'bootstrap_default';
    }

    // Gift cards always excluded
    if (s.productType.toLowerCase() === 'gift card' || s.productType.toLowerCase() === 'gift_card') {
      classification = 'excluded'; confidence = 100; method = 'edge_case';
    }

    results.push({
      product_id: pid,
      product_title: s.title,
      product_type: s.productType,
      classification: classification as SignalStackResult['classification'],
      confidence,
      method: method as SignalStackResult['method'],
      signals: null,
      alone_pct: aloneRate * 100,
      first_position_pct: 0,
      avg_position: 0,
      revenue_share: 0,
      total_orders_analyzed: s.total,
      needs_review: confidence < 50,
    });
  }

  await persistClassifications(storeId, results, manualOverrideIds);
  const needsReview = results.filter(r => r.needs_review).length;
  console.log(`[Classification] Bootstrap: ${results.length} classified (${needsReview} need review)`);
  return { classified: results.length, needsReview, results };
}

// ── Edge Cases ───────────────────────────────────────────────

function applyEdgeCases(results: SignalStackResult[]): SignalStackResult[] {
  return results.map(r => {
    const typeLower = (r.product_type || '').toLowerCase();

    // Gift cards → EXCLUDE always
    if (typeLower === 'gift card' || typeLower === 'gift_card') {
      return { ...r, classification: 'excluded', confidence: 100, method: 'edge_case', needs_review: false };
    }

    // $0 product with alone_pct < 2% → EXCLUDE (free gift with purchase)
    // NOTE: we don't have price in SignalStackResult directly, so this is handled
    // in the classifier itself via pattern.price

    // $0 product with alone_pct > 30% → MAIN (free lead magnet)
    // Also handled in classifier

    return r;
  });
}

// ── Persistence ──────────────────────────────────────────────

async function persistClassifications(
  storeId: string,
  results: SignalStackResult[],
  skipIds: Set<string>,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = results
    .filter(r => !skipIds.has(r.product_id))
    .map(r => ({
      store_id: storeId,
      product_id: r.product_id,
      product_title: r.product_title,
      product_type: r.product_type || '',
      classification: r.classification,
      confidence: r.confidence,
      classification_method: r.method,
      detection_method: r.method, // backward compat with existing column
      signals_used: r.signals || {},
      alone_pct: r.alone_pct,
      first_position_pct: r.first_position_pct,
      avg_position: r.avg_position,
      revenue_share: r.revenue_share,
      total_orders_analyzed: r.total_orders_analyzed,
      needs_review: r.needs_review,
      manual_override: false,
      last_analyzed: now,
      updated_at: now,
    }));

  if (rows.length === 0) return;

  // Batch upsert in chunks of 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await rest(
      '/product_classifications?on_conflict=store_id,product_id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(chunk),
      }
    ).catch(() => { /* table might not exist yet */ });
  }
}
