/**
 * PRISM — Master Product Classification Engine
 *
 * All 18 signals combined. Maximum accuracy.
 * No manual config. Works for every store.
 *
 * Signal collection via SQL function (get_product_signals).
 * Scoring + classification in TypeScript.
 *
 * Flow:
 *   1. SQL collects order-based signals (price, alone rate, revenue, co-occurrence, position, stamps)
 *   2. Existing product_classifications provides meta/tag/variant signals
 *   3. This module scores all signals and returns final classification
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── Signal Types ──────────────────────────────────────────

/** Raw signals from SQL function get_product_signals */
export interface ProductSignals {
  product_id: string;
  title: string;

  // Price
  avg_price: number;
  min_price: number;
  max_price: number;
  has_heavy_discount: boolean;
  price_gap_class: 'above_threshold' | 'below_threshold';
  price_ratio_to_order: number;

  // Alone rate
  total_orders: number;
  alone_orders: number;
  alone_rate: number;

  // Revenue
  total_revenue: number;
  revenue_share: number;

  // Co-occurrence
  always_with_other: boolean;
  co_occur_rate: number;
  co_occurs_with: string | null;

  // Upsell stamps
  has_upsell_stamps: boolean;

  // SKU
  sku_class: 'main' | 'upsell' | 'downsell' | null;

  // Customer
  first_purchase_rate: number;

  // Position
  avg_position_in_order: number;
  always_last: boolean;
}

/** Enrichment signals from product_classifications table */
export interface EnrichmentSignals {
  has_own_campaigns: boolean;
  ad_landing_rate: number;
  has_main_tag: boolean;
  has_upsell_tag: boolean;
  has_exclude_tag: boolean;
  has_yes_no_variant: boolean;
  has_size_color_variant: boolean;
  manual_override: boolean;
  manual_classification: string | null;
}

/** Combined signals for scoring */
export interface CombinedSignals extends ProductSignals {
  has_own_campaign: boolean;
  meta_attribution_rate: number;
  has_main_tag: boolean;
  has_upsell_tag: boolean;
  has_exclude_tag: boolean;
  has_yes_no_variant: boolean;
  has_size_color_variant: boolean;
}

/** Classification result */
export interface MasterClassificationResult {
  product_id: string;
  product_title: string;
  classification: 'main' | 'upsell' | 'downsell' | 'bundle' | 'excluded' | 'pending';
  confidence: number;
  score: number;
  method: string;
  signals: string[];
  needs_review: boolean;
}

// ── Signal Collection ────────────────────────────────────

/**
 * Fetch raw order-based signals via SQL function.
 * Falls back to empty array if function doesn't exist yet.
 */
export async function fetchProductSignals(storeId: string): Promise<ProductSignals[]> {
  try {
    const signals = await rest<ProductSignals[]>('/rpc/get_product_signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ p_store_id: storeId }),
    });
    return signals ?? [];
  } catch (err) {
    console.warn('[PRISM:Master] SQL function not available, falling back:', err instanceof Error ? err.message : 'Unknown');
    return [];
  }
}

/**
 * Fetch enrichment signals from existing product_classifications.
 */
async function fetchEnrichmentSignals(storeId: string): Promise<Map<string, EnrichmentSignals>> {
  const map = new Map<string, EnrichmentSignals>();
  try {
    const rows = await rest<Array<{
      product_id: string;
      has_own_campaigns: boolean;
      ad_landing_rate: number;
      manual_override: boolean;
      classification: string;
      variant_option_signal: string | null;
      product_type: string | null;
    }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,has_own_campaigns,ad_landing_rate,manual_override,classification,variant_option_signal,product_type`
    );
    for (const row of rows) {
      map.set(row.product_id, {
        has_own_campaigns: row.has_own_campaigns ?? false,
        ad_landing_rate: row.ad_landing_rate ?? 0,
        has_main_tag: false,  // Tags checked separately
        has_upsell_tag: false,
        has_exclude_tag: false,
        has_yes_no_variant: row.variant_option_signal === 'yes_no',
        has_size_color_variant: row.variant_option_signal === 'size_color' || row.variant_option_signal === 'standard',
        manual_override: row.manual_override ?? false,
        manual_classification: row.manual_override ? row.classification : null,
      });
    }
  } catch {
    // Table may not have all columns yet
  }
  return map;
}

/**
 * Fetch Shopify tag signals from product_classifications.
 */
async function fetchTagSignals(storeId: string): Promise<Map<string, { main: boolean; upsell: boolean; exclude: boolean }>> {
  const map = new Map<string, { main: boolean; upsell: boolean; exclude: boolean }>();
  try {
    const rows = await rest<Array<{ product_id: string; classification_method: string; classification: string }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&classification_method=eq.shopify_tag&select=product_id,classification_method,classification`
    );
    for (const row of rows) {
      map.set(row.product_id, {
        main: row.classification === 'main',
        upsell: row.classification === 'upsell',
        exclude: row.classification === 'excluded',
      });
    }
  } catch {
    // Ignore
  }
  return map;
}

// ── Scoring Engine ──────────────────────────────────────

function makeResult(
  productId: string,
  title: string,
  classification: MasterClassificationResult['classification'],
  confidence: number,
  method: string,
  score: number = 0,
  signals: string[] = [],
): MasterClassificationResult {
  return {
    product_id: productId,
    product_title: title,
    classification,
    confidence,
    score,
    method,
    signals,
    needs_review: confidence < 65,
  };
}

/**
 * Score a single product using all combined signals.
 */
export function scoreProduct(s: CombinedSignals): MasterClassificationResult {
  // ── INSTANT DECISIONS (no scoring needed) ──

  if (s.has_main_tag)
    return makeResult(s.product_id, s.title, 'main', 100, 'shopify_tag');

  if (s.has_upsell_tag)
    return makeResult(s.product_id, s.title, 'upsell', 100, 'shopify_tag');

  if (s.has_exclude_tag)
    return makeResult(s.product_id, s.title, 'excluded', 100, 'shopify_tag');

  if (s.has_upsell_stamps)
    return makeResult(s.product_id, s.title, 'upsell', 98, 'upsell_app_stamp');

  if (s.has_yes_no_variant)
    return makeResult(s.product_id, s.title, 'upsell', 95, 'yes_no_variant');

  if (s.sku_class)
    return makeResult(s.product_id, s.title, s.sku_class as MasterClassificationResult['classification'], 95, 'sku_pattern');

  // Apps Script rule: $0 = MAIN for funnel/free+shipping stores
  if (s.avg_price === 0 && s.total_orders > 5)
    return makeResult(s.product_id, s.title, 'main', 95, 'zero_price_funnel_main');

  // ── HARD VETO RULES ──

  // Veto 1: Revenue too small + low price = cannot be main
  if (s.revenue_share < 0.03 && s.avg_price < 10) {
    return makeResult(s.product_id, s.title, 'upsell', 90,
      'veto_low_revenue_low_price', -50,
      [`revenue_share ${s.revenue_share} + avg_price $${s.avg_price} — too small to be main`]);
  }

  // Veto 2: Always appears with higher-revenue product
  if (s.always_with_other && s.revenue_share < 0.1) {
    return makeResult(s.product_id, s.title, 'upsell', 88,
      'veto_always_co_occurs', -40,
      [`always_co_occurs (${(s.co_occur_rate * 100).toFixed(0)}%) + low_revenue_share ${s.revenue_share}`]);
  }

  // Veto 3: Below price threshold AND low alone_rate
  if (s.price_gap_class === 'below_threshold' && s.alone_rate < 0.15) {
    return makeResult(s.product_id, s.title, 'upsell', 85,
      'veto_below_threshold_low_alone', -35,
      [`below_price_threshold + alone_rate ${(s.alone_rate * 100).toFixed(1)}%`]);
  }

  // ── SCORING ──

  let score = 0;
  const reasons: string[] = [];

  // PRICE SIGNALS (max ±25)
  if (s.price_gap_class === 'above_threshold') {
    score += 25;
    reasons.push('above_price_threshold +25');
  } else {
    score -= 20;
    reasons.push('below_price_threshold -20');
  }
  if (s.price_ratio_to_order > 0.5) {
    score += 10;
    reasons.push(`high_price_ratio ${s.price_ratio_to_order} +10`);
  } else if (s.price_ratio_to_order < 0.15) {
    score -= 10;
    reasons.push(`low_price_ratio ${s.price_ratio_to_order} -10`);
  }

  // ALONE RATE SIGNALS (max ±30)
  // KEY FIX: alone_rate only fully counts if above price threshold
  if (s.price_gap_class === 'above_threshold') {
    if (s.alone_rate > 0.4) {
      score += 30;
      reasons.push(`alone_rate ${(s.alone_rate * 100).toFixed(1)}% +30`);
    } else if (s.alone_rate > 0.2) {
      score += 15;
      reasons.push(`alone_rate ${(s.alone_rate * 100).toFixed(1)}% +15`);
    } else if (s.alone_rate < 0.05) {
      score -= 20;
      reasons.push(`alone_rate ${(s.alone_rate * 100).toFixed(1)}% -20`);
    }
  } else {
    // Below price threshold — alone_rate is discounted
    if (s.alone_rate > 0.3) {
      score += 5;
      reasons.push(`alone_rate ${(s.alone_rate * 100).toFixed(1)}% +5 (below threshold, discounted)`);
    } else if (s.alone_rate < 0.05) {
      score -= 15;
      reasons.push(`alone_rate ${(s.alone_rate * 100).toFixed(1)}% -15`);
    }
  }

  // REVENUE SIGNALS (max ±25)
  if (s.revenue_share > 0.2) {
    score += 25;
    reasons.push(`revenue_share ${(s.revenue_share * 100).toFixed(1)}% +25`);
  } else if (s.revenue_share > 0.1) {
    score += 15;
    reasons.push(`revenue_share ${(s.revenue_share * 100).toFixed(1)}% +15`);
  } else if (s.revenue_share > 0.05) {
    score += 8;
    reasons.push(`revenue_share ${(s.revenue_share * 100).toFixed(1)}% +8`);
  } else if (s.revenue_share >= 0.03) {
    score += 3;
    reasons.push(`revenue_share ${(s.revenue_share * 100).toFixed(1)}% +3`);
  } else if (s.revenue_share < 0.02) {
    score -= 20;
    reasons.push(`revenue_share ${(s.revenue_share * 100).toFixed(1)}% -20`);
  }

  // META ADS SIGNALS (max +35)
  if (s.has_own_campaign) {
    score += 35;
    reasons.push('has_own_meta_campaign +35');
  }
  if (s.meta_attribution_rate > 0.3) {
    score += 20;
    reasons.push(`meta_attributed ${(s.meta_attribution_rate * 100).toFixed(0)}% +20`);
  } else if (s.meta_attribution_rate < 0.02 && !s.has_own_campaign) {
    score -= 15;
    reasons.push('not_meta_attributed -15');
  }

  // CO-OCCURRENCE SIGNALS (max ±20)
  if (s.always_with_other) {
    score -= 20;
    reasons.push(`always_co_occurs (${(s.co_occur_rate * 100).toFixed(0)}%) -20`);
  } else if (s.co_occur_rate < 0.1) {
    score += 10;
    reasons.push('rarely_co_occurs +10');
  }

  // FIRST PURCHASE SIGNAL (max +15)
  if (s.first_purchase_rate > 0.5) {
    score += 15;
    reasons.push(`first_purchase ${(s.first_purchase_rate * 100).toFixed(0)}% +15`);
  } else if (s.first_purchase_rate > 0.3) {
    score += 8;
    reasons.push(`first_purchase ${(s.first_purchase_rate * 100).toFixed(0)}% +8`);
  } else if (s.first_purchase_rate < 0.05) {
    score -= 10;
    reasons.push(`low_first_purchase ${(s.first_purchase_rate * 100).toFixed(0)}% -10`);
  }

  // ORDER POSITION SIGNALS (max ±10)
  if (s.avg_position_in_order <= 1.2) {
    score += 10;
    reasons.push('first_in_order +10');
  } else if (s.always_last) {
    score -= 10;
    reasons.push('always_last_in_order -10');
  }

  // VARIANT SIGNALS (max +10)
  if (s.has_size_color_variant) {
    score += 10;
    reasons.push('size_color_variant +10');
  }

  // HEAVY DISCOUNT note
  if (s.has_heavy_discount) {
    reasons.push('heavy_discount — relying on other signals');
  }

  // ── FINAL DECISION ──

  let classification: MasterClassificationResult['classification'];
  let confidence: number;

  if (score >= 70) {
    classification = 'main';
    confidence = 95;
  } else if (score >= 45) {
    classification = 'main';
    confidence = 80;
  } else if (score >= 20) {
    classification = 'main';
    confidence = 65;
  } else if (score >= -10) {
    classification = 'pending';
    confidence = 50;
  } else if (score >= -35) {
    classification = 'upsell';
    confidence = 70;
  } else {
    classification = 'upsell';
    confidence = 90;
  }

  return makeResult(s.product_id, s.title, classification, confidence, 'master_combined', score, reasons);
}

// ── Main Entry Point ──────────────────────────────────

/**
 * Classify all products for a store using the master engine.
 * 1. Fetch SQL-based signals
 * 2. Merge enrichment signals from product_classifications
 * 3. Score each product
 * 4. Persist results
 */
export async function masterClassifyAll(storeId: string): Promise<MasterClassificationResult[]> {
  // Fetch all signal sources in parallel
  const [rawSignals, enrichment, tagSignals] = await Promise.all([
    fetchProductSignals(storeId),
    fetchEnrichmentSignals(storeId),
    fetchTagSignals(storeId),
  ]);

  if (rawSignals.length === 0) {
    console.log(`[PRISM:Master] ${storeId}: No signals from SQL function`);
    return [];
  }

  // Get manual overrides — never overwrite
  const manualOverrides = new Map<string, string>();
  for (const [pid, e] of enrichment) {
    if (e.manual_override && e.manual_classification) {
      manualOverrides.set(pid, e.manual_classification);
    }
  }

  const results: MasterClassificationResult[] = [];

  for (const raw of rawSignals) {
    // Skip manual overrides
    if (manualOverrides.has(raw.product_id)) {
      const cls = manualOverrides.get(raw.product_id)!;
      results.push(makeResult(
        raw.product_id, raw.title,
        cls as MasterClassificationResult['classification'],
        100, 'manual_override', 100,
        [`Manually classified as "${cls}" by merchant`],
      ));
      continue;
    }

    // Merge signals
    const e = enrichment.get(raw.product_id);
    const tags = tagSignals.get(raw.product_id);

    const combined: CombinedSignals = {
      ...raw,
      has_own_campaign: e?.has_own_campaigns ?? false,
      meta_attribution_rate: e?.ad_landing_rate ?? 0,
      has_main_tag: tags?.main ?? false,
      has_upsell_tag: tags?.upsell ?? false,
      has_exclude_tag: tags?.exclude ?? false,
      has_yes_no_variant: e?.has_yes_no_variant ?? false,
      has_size_color_variant: e?.has_size_color_variant ?? false,
    };

    results.push(scoreProduct(combined));
  }

  // Validate: if too many MAINs (>40%), keep only top N by revenue
  const mainResults = results.filter(r => r.classification === 'main');
  const nonManual = results.filter(r => r.method !== 'manual_override' && r.method !== 'shopify_tag');
  if (nonManual.length > 5 && mainResults.length > nonManual.length * 0.4) {
    console.warn(`[PRISM:Master] ${storeId}: ${mainResults.length}/${nonManual.length} MAIN — auto-correcting`);
    // Sort MAIN products by revenue_share desc, keep top ones
    const mainByRevenue = mainResults
      .filter(r => r.method !== 'manual_override' && r.method !== 'shopify_tag')
      .sort((a, b) => {
        const aRev = rawSignals.find(s => s.product_id === a.product_id)?.revenue_share ?? 0;
        const bRev = rawSignals.find(s => s.product_id === b.product_id)?.revenue_share ?? 0;
        return bRev - aRev;
      });

    // Find natural gap in revenue_share for cutoff
    const maxMains = Math.max(3, Math.ceil(nonManual.length * 0.2));
    for (let i = maxMains; i < mainByRevenue.length; i++) {
      const r = mainByRevenue[i];
      const idx = results.findIndex(x => x.product_id === r.product_id);
      if (idx >= 0) {
        results[idx] = { ...results[idx], classification: 'pending', confidence: 50, needs_review: true };
        results[idx].signals.push(`Auto-corrected from MAIN — too many MAIN products`);
      }
    }
  }

  // Persist
  await persistMasterClassifications(storeId, results);

  const mainCount = results.filter(r => r.classification === 'main').length;
  const upsellCount = results.filter(r => r.classification === 'upsell').length;
  console.log(`[PRISM:Master] ${storeId}: ${results.length} products — ${mainCount} main, ${upsellCount} upsell`);

  return results;
}

// ── Persistence ──────────────────────────────────────────

async function persistMasterClassifications(
  storeId: string,
  results: MasterClassificationResult[],
): Promise<void> {
  const now = new Date().toISOString();

  for (let i = 0; i < results.length; i += 50) {
    const chunk = results.slice(i, i + 50).map(r => ({
      store_id: storeId,
      product_id: r.product_id,
      product_title: r.product_title,
      classification: r.classification,
      confidence: r.confidence,
      classification_method: r.method,
      detection_method: r.method,
      signals_used: { score: r.score, reasons: r.signals },
      needs_review: r.needs_review,
      manual_override: r.method === 'manual_override',
      last_analyzed: now,
      updated_at: now,
    }));

    await rest(
      '/product_classifications?on_conflict=store_id,product_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      },
    ).catch(err => {
      console.error(`[PRISM:Master] Persist error:`, err instanceof Error ? err.message : err);
    });
  }
}
