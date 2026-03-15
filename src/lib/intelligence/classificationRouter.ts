/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 *
 * Universal Classification Router
 *
 * One path for every store: behavioral signals → relative comparison → classification.
 * No store type detection. No assumptions about what the store sells.
 * Classification emerges from the data, not from guessing the store model.
 *
 * Manual overrides are permanent and never overwritten during re-runs.
 * One store's classification never affects another.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { PRISM } from '@/lib/prism';
import { analyzeOrderPatterns, partitionByDataSufficiency } from './orderPatternAnalyzer';
import { computeSignals, classifyProduct, computeMedianPrice, checkShopifyTags } from './signalStackClassifier';
import { detectPostPurchaseUpsells } from './postPurchaseDetector';
import { computeAdvancedSignals } from './advancedSignals';
import { scanNovelSignals } from './novelSignals';
import type { SignalStackResult } from './types';

const enc = (v: string) => encodeURIComponent(v);

// ── Ad Signal Fetcher ───────────────────────────────────────

async function getAdSignalsForProducts(storeId: string): Promise<Map<string, { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number }>> {
  const signals = new Map<string, { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number }>();

  const [attributions, landingData] = await Promise.all([
    rest<Array<{ product_id: string }>>(
      `/campaign_product_attributions?store_id=eq.${enc(storeId)}&confidence=gte.50&select=product_id`
    ).catch(() => []),
    rest<Array<{ first_product_viewed_id: string }>>(
      `/visitor_attribution?store_id=eq.${enc(storeId)}&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,fbclid.not.is.null)&first_product_viewed_id=not.is.null&select=first_product_viewed_id`
    ).catch(() => []),
  ]);

  if (attributions.length === 0 && landingData.length === 0) return signals;

  const totalMetaSessions = landingData.length;
  const landingCounts = new Map<string, number>();
  for (const s of landingData) {
    if (s.first_product_viewed_id) {
      landingCounts.set(s.first_product_viewed_id, (landingCounts.get(s.first_product_viewed_id) ?? 0) + 1);
    }
  }

  const campaignsPerProduct = new Map<string, number>();
  for (const a of attributions) {
    campaignsPerProduct.set(a.product_id, (campaignsPerProduct.get(a.product_id) ?? 0) + 1);
  }
  const totalCampaigns = new Set(attributions.map(a => a.product_id)).size;

  const allProductIds = new Set([...campaignsPerProduct.keys(), ...landingCounts.keys()]);
  for (const pid of allProductIds) {
    const campaignCount = campaignsPerProduct.get(pid) ?? 0;
    const landingSessions = landingCounts.get(pid) ?? 0;
    signals.set(pid, {
      has_own_campaigns: campaignCount > 0,
      landing_page_rate: totalMetaSessions > 0 ? landingSessions / totalMetaSessions : 0,
      direct_spend_share: totalCampaigns > 0 ? campaignCount / totalCampaigns : 0,
    });
  }

  return signals;
}

function deriveHandle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

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
  // ── Bootstrap path: stores with < 30 recent orders ──────────────────
  const recentCutoff = new Date(Date.now() - PRISM.dataWindows.behavioralAnalysisDays * 86400000).toISOString();
  const recentOrders = await rest<Array<{ shopify_order_id: string; line_items: string; total_price: number }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(recentCutoff)}&order_status=neq.cancelled&financial_status=neq.refunded&select=shopify_order_id,line_items,total_price&limit=500`
  ).catch(() => []);

  if (recentOrders.length < PRISM.classification.minOrdersForBehavioral) {
    console.log(`[PRISM:Classify] ${storeId}: ${recentOrders.length} recent orders — using bootstrap`);
    return bootstrapClassify(storeId, recentOrders);
  }

  // 1. Load manual overrides — NEVER overwrite
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.true&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as StoredClassification[]);
  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

  // 2. Tag-first pass — Shopify tags are merchant intent (confidence 100)
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

  // 2b. TIER 1 — Definitive signals (100% confidence)
  //     Post-purchase order updates and SKU patterns
  const tier1Ids = new Set<string>();
  try {
    const postPurchaseResults = await detectPostPurchaseUpsells(storeId);
    for (const pp of postPurchaseResults) {
      if (manualOverrideIds.has(pp.product_id) || tagMatchedIds.has(pp.product_id)) continue;
      tier1Ids.add(pp.product_id);
    }

    // SKU pattern + price/AOV + repeat purchase signals
    const advancedResults = await computeAdvancedSignals(storeId);
    for (const adv of advancedResults.products) {
      if (manualOverrideIds.has(adv.product_id) || tagMatchedIds.has(adv.product_id)) continue;
      if (adv.sku_pattern_signal === 'upsell_sku' || adv.sku_pattern_signal === 'main_sku') {
        tier1Ids.add(adv.product_id);
      }
    }

    // Novel signals: line item properties, variant options, creation timestamp
    const novelResults = await scanNovelSignals(storeId);
    for (const novel of novelResults.products) {
      if (manualOverrideIds.has(novel.product_id) || tagMatchedIds.has(novel.product_id)) continue;
      if (novel.line_item_stamped || novel.has_bump_variants) {
        tier1Ids.add(novel.product_id);
      }
    }
  } catch (err) {
    console.warn(`[PRISM:Classify] Tier 1 signals error:`, err instanceof Error ? err.message : 'Unknown');
  }

  // 3. ONE UNIVERSAL PATH — behavioral signal stack for remaining products
  const filtered = allPatterns.filter(p =>
    !manualOverrideIds.has(p.product_id) && !tagMatchedIds.has(p.product_id) && !tier1Ids.has(p.product_id)
  );
  const { sufficient, pending } = partitionByDataSufficiency(filtered);
  const medianPrice = computeMedianPrice(sufficient);

  // 3b. Fetch ad signals for all products (from PRISM attribution engine)
  const adSignalMap = await getAdSignalsForProducts(storeId);

  const behavioralResults: SignalStackResult[] = [];

  for (const p of sufficient) {
    const adSig = adSignalMap.get(p.product_id);
    const signals = computeSignals(p, medianPrice, adSig);
    behavioralResults.push(classifyProduct(p, signals));
  }

  for (const p of pending) {
    behavioralResults.push({
      product_id: p.product_id,
      product_title: p.product_title,
      product_type: p.product_type,
      classification: 'pending',
      confidence: 0,
      method: 'insufficient_data',
      signals: null,
      alone_pct: p.alone_pct,
      first_position_pct: p.first_position_pct,
      avg_position: p.avg_position,
      revenue_share: p.revenue_share,
      total_orders_analyzed: p.total_orders,
      needs_review: false,
    });
  }

  // Merge tag results + behavioral results
  let results = [...tagMatchedResults, ...behavioralResults];

  // 4. Edge cases (gift cards → excluded)
  results = applyEdgeCases(results);

  // 5. Confidence floor — low confidence → pending
  results = enforceConfidenceFloor(results);

  // 6. Persist
  await persistClassifications(storeId, results, manualOverrideIds, adSignalMap);

  // 7. Validate distribution
  await validateClassifications(storeId);

  const needsReview = results.filter(r => r.needs_review).length;
  console.log(`[PRISM:Classify] ${storeId}: ${results.length} classified, ${needsReview} need review`);
  return { classified: results.length, needsReview, results };
}

// ── Bootstrap Classifier ──────────────────────────────────────
// For stores with < 30 recent orders. Uses alone-rate and title hints.
// Ambiguous = pending. Never guesses main.

async function bootstrapClassify(
  storeId: string,
  orders: Array<{ shopify_order_id: string; line_items: string; total_price: number }>,
): Promise<ClassifyResult> {
  const existingOverrides = await rest<StoredClassification[]>(
    `/product_classifications?store_id=eq.${enc(storeId)}&manual_override=eq.true&select=product_id,classification,manual_override,confidence`
  ).catch(() => [] as StoredClassification[]);
  const manualOverrideIds = new Set(existingOverrides.map(o => o.product_id));

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
  const UPSELL_HINTS = ['upsell', 'upgrade', 'bundle', 'bonus', 'add-on', 'addon', 'extra', 'premium', 'vip', 'rush'];

  for (const [pid, s] of stats) {
    if (manualOverrideIds.has(pid)) continue;

    let classification: string;
    let confidence: number;
    let method: string;
    const aloneRate = s.total > 0 ? s.alone / s.total : 0;
    const titleLower = s.title.toLowerCase();

    if (s.total >= 3) {
      if (aloneRate >= 0.7) {
        classification = 'main'; confidence = Math.min(35 + s.total * 3, 65); method = 'bootstrap_alone_rate';
      } else if (aloneRate <= 0.1) {
        classification = 'upsell'; confidence = Math.min(35 + s.total * 3, 65); method = 'bootstrap_alone_rate';
      } else {
        classification = 'pending'; confidence = 25; method = 'bootstrap_ambiguous';
      }
    } else if (UPSELL_HINTS.some(kw => titleLower.includes(kw))) {
      classification = 'upsell'; confidence = 20; method = 'bootstrap_title_hint';
    } else {
      classification = 'pending'; confidence = 15; method = 'bootstrap_insufficient';
    }

    // Gift cards → excluded
    if (s.productType.toLowerCase() === 'gift card' || s.productType.toLowerCase() === 'gift_card') {
      classification = 'excluded'; confidence = 100; method = 'edge_case';
    }

    results.push({
      product_id: pid, product_title: s.title, product_type: s.productType,
      classification: classification as SignalStackResult['classification'],
      confidence, method: method as SignalStackResult['method'],
      signals: null, alone_pct: aloneRate * 100, first_position_pct: 0,
      avg_position: 0, revenue_share: 0, total_orders_analyzed: s.total,
      needs_review: confidence < 50,
    });
  }

  await persistClassifications(storeId, results, manualOverrideIds);
  const needsReview = results.filter(r => r.needs_review).length;
  console.log(`[PRISM:Classify] Bootstrap: ${results.length} classified (${needsReview} need review)`);
  return { classified: results.length, needsReview, results };
}

// ── Edge Cases ───────────────────────────────────────────────

function applyEdgeCases(results: SignalStackResult[]): SignalStackResult[] {
  return results.map(r => {
    const typeLower = (r.product_type || '').toLowerCase();
    if (typeLower === 'gift card' || typeLower === 'gift_card') {
      return { ...r, classification: 'excluded', confidence: 100, method: 'edge_case', needs_review: false };
    }
    return r;
  });
}

// ── Confidence Floor ─────────────────────────────────────────
// Only shopify_tag and manual_override are trusted. Everything else
// must meet the confidence threshold or gets downgraded to pending.

function enforceConfidenceFloor(results: SignalStackResult[]): SignalStackResult[] {
  const TRUSTED = new Set(['shopify_tag', 'manual_override', 'edge_case']);
  const VALID_CLASSIFICATIONS = new Set(['main', 'upsell', 'downsell', 'bundle', 'pending', 'excluded']);
  return results.map(r => {
    // Invalid/unknown classification → pending (never show 'unknown' or 'other')
    if (!VALID_CLASSIFICATIONS.has(r.classification)) {
      return { ...r, classification: 'pending' as const, needs_review: true };
    }
    if (TRUSTED.has(r.method)) return r;
    if (r.classification === 'pending' || r.classification === 'excluded') return r;
    if (r.confidence < PRISM.classification.lowConfidenceThreshold) {
      return { ...r, classification: 'pending' as const, needs_review: true };
    }
    return r;
  });
}

// ── Post-Classification Validation ──────────────────────────

async function validateClassifications(storeId: string): Promise<void> {
  const rows = await rest<Array<{ classification: string; confidence: number; manual_override: boolean }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=classification,confidence,manual_override`
  ).catch(() => []);

  if (rows.length === 0) return;

  const nonManual = rows.filter(r => !r.manual_override);
  const total = nonManual.length;
  if (total <= 5) return;

  const mainCount = nonManual.filter(r => r.classification === 'main').length;
  const mainRate = mainCount / total;

  if (mainRate > 0.4) {
    console.warn(`[PRISM:Classify] WARNING — ${storeId}: ${Math.round(mainRate * 100)}% MAIN (${mainCount}/${total}). Auto-correcting.`);
    await rest(
      `/product_classifications?store_id=eq.${enc(storeId)}&classification=eq.main&manual_override=eq.false&confidence=lt.${PRISM.classification.lowConfidenceThreshold}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ classification: 'pending', needs_review: true, updated_at: new Date().toISOString() }),
      }
    ).catch(() => null);
  }

  const dist: Record<string, number> = {};
  for (const r of rows) dist[r.classification] = (dist[r.classification] || 0) + 1;
  console.log(`[PRISM:Classify] Final: ${storeId} → ${JSON.stringify(dist)}`);
}

// ── Persistence ──────────────────────────────────────────────

async function persistClassifications(
  storeId: string,
  results: SignalStackResult[],
  skipIds: Set<string>,
  adSignalMap?: Map<string, { has_own_campaigns: boolean; landing_page_rate: number; direct_spend_share: number }>,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = results
    .filter(r => !skipIds.has(r.product_id))
    .map(r => {
      const adSig = adSignalMap?.get(r.product_id);
      return {
        store_id: storeId,
        product_id: r.product_id,
        product_title: r.product_title,
        product_type: r.product_type || '',
        product_handle: deriveHandle(r.product_title),
        classification: r.classification,
        confidence: r.confidence,
        classification_method: r.method,
        detection_method: r.method,
        signals_used: r.signals || {},
        alone_pct: r.alone_pct,
        first_position_pct: r.first_position_pct,
        avg_position: r.avg_position,
        revenue_share: r.revenue_share,
        total_orders_analyzed: r.total_orders_analyzed,
        needs_review: r.needs_review,
        manual_override: false,
        has_own_campaigns: adSig?.has_own_campaigns ?? false,
        ad_landing_rate: adSig?.landing_page_rate ?? 0,
        ad_signal_confidence: (r.method === 'ad_campaign_detected' || r.method === 'ad_traffic_landing') ? r.confidence : 0,
        ad_signal_method: (r.method === 'ad_campaign_detected' || r.method === 'ad_traffic_landing') ? r.method : null,
        last_analyzed: now,
        updated_at: now,
      };
    });

  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await rest(
      '/product_classifications?on_conflict=store_id,product_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      }
    ).catch(() => null);
  }
}
