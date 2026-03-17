/**
 * Relative Behavioral Product Classifier
 *
 * Classifies products by comparing them RELATIVE to their own store's data.
 * No hardcoded price rules. No fixed thresholds. Every signal is computed
 * by comparing a product's behavior against the store's distribution.
 */

import type { ProductBehavior } from './behaviorExtractor';
import type { StoreBehaviorProfile } from './storeProfiler';

// ── Output Interface ────────────────────────────────────────

export interface ClassificationResult {
  product_id: string;
  product_title: string;
  classification: 'main' | 'upsell' | 'downsell' | 'addon' | 'bundle' | 'excluded' | 'pending' | 'unknown';
  confidence: number; // 0-100
  method: string;
  signals: string[];
  parent_product: string | null; // title of the main product this upsell/downsell belongs to
  downsell_of: string | null; // product_id of the main product (for downsells)
  needs_review: boolean;
}

// ── Recognized Shopify Tags ─────────────────────────────────

const RECOGNIZED_TAGS: Record<string, ClassificationResult['classification']> = {
  'onescale:main': 'main',
  'onescale:upsell': 'upsell',
  'onescale:exclude': 'excluded',
  'onescale:bundle': 'bundle',
};

// ── Helper Functions ────────────────────────────────────────

/**
 * Returns 0-1: where this value sits in the store's distribution.
 *   >= p75:          0.9 – 1.0
 *   median to p75:   0.5 – 0.9
 *   p25 to median:   0.3 – 0.5
 *   below p25:       0.0 – 0.3
 */
function relativePosition(
  value: number,
  p25: number,
  median: number,
  p75: number,
): number {
  if (p75 <= p25) {
    // Degenerate distribution — everything is the same
    return 0.5;
  }

  if (value >= p75) {
    // 0.9 – 1.0 range
    const range = p75 > 0 ? p75 : 1;
    const excess = (value - p75) / range;
    return Math.min(1.0, 0.9 + 0.1 * Math.min(excess, 1));
  }

  if (value >= median) {
    // 0.5 – 0.9 range
    const span = p75 - median || 1;
    const ratio = (value - median) / span;
    return 0.5 + 0.4 * ratio;
  }

  if (value >= p25) {
    // 0.3 – 0.5 range
    const span = median - p25 || 1;
    const ratio = (value - p25) / span;
    return 0.3 + 0.2 * ratio;
  }

  // Below p25: 0.0 – 0.3
  const floor = p25 || 1;
  const ratio = value / floor;
  return 0.3 * Math.max(0, Math.min(1, ratio));
}

/**
 * Returns 0-1: what fraction of values in the sorted array are below this one.
 */
function rankPercentile(value: number, sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0.5;

  let below = 0;
  for (const v of sortedValues) {
    if (v < value) below++;
  }

  return below / sortedValues.length;
}

/**
 * Format a number as a percentage string, e.g. 42 → "42%"
 */
function pct(n: number): string {
  return `${Math.round(n)}%`;
}

// ── Core Classification Function ────────────────────────────

export function classifyAllProducts(
  behaviors: ProductBehavior[],
  storeProfile: StoreBehaviorProfile,
  manualOverrides: Map<string, string>, // product_id → classification from manual_override=true
  tagOverrides: Map<string, string>,    // product_id → classification from Shopify tags
): ClassificationResult[] {
  // Pre-compute sorted arrays for rank percentile lookups
  const allFirstRates = behaviors
    .filter(b => b.total_orders >= 5)
    .map(b => b.first_rate)
    .sort((a, b) => a - b);

  const allRevenueShares = behaviors
    .filter(b => b.total_orders >= 5)
    .map(b => b.revenue_share)
    .sort((a, b) => a - b);

  // Build a lookup by product_id for companion resolution
  const behaviorMap = new Map<string, ProductBehavior>();
  for (const b of behaviors) {
    behaviorMap.set(b.product_id, b);
  }

  const results = behaviors.map(behavior =>
    classifySingleProduct(
      behavior,
      storeProfile,
      manualOverrides,
      tagOverrides,
      allFirstRates,
      allRevenueShares,
      behaviorMap,
    ),
  );

  // Post-processing: detect downsells and reconcile symmetric pairs
  detectDownsells(results, behaviorMap);
  reconcileDownsellPairs(results, behaviorMap);

  return results;
}

function classifySingleProduct(
  behavior: ProductBehavior,
  storeProfile: StoreBehaviorProfile,
  manualOverrides: Map<string, string>,
  tagOverrides: Map<string, string>,
  allFirstRates: number[],
  allRevenueShares: number[],
  behaviorMap: Map<string, ProductBehavior>,
): ClassificationResult {
  const base = {
    product_id: behavior.product_id,
    product_title: behavior.product_title,
    parent_product: null as string | null,
    downsell_of: null as string | null,
  };

  // ── 1. Insufficient data ────────────────────────────────
  if (behavior.total_orders < 5) {
    return {
      ...base,
      classification: 'pending',
      confidence: 0,
      method: 'insufficient_data',
      signals: ['Insufficient order data'],
      needs_review: false,
    };
  }

  // ── 2. Manual override ──────────────────────────────────
  const manualClass = manualOverrides.get(behavior.product_id);
  if (manualClass) {
    return {
      ...base,
      classification: manualClass as ClassificationResult['classification'],
      confidence: 100,
      method: 'manual_override',
      signals: [`Manually classified as "${manualClass}" by merchant`],
      needs_review: false,
    };
  }

  // ── 3. Shopify tag override ─────────────────────────────
  const tagClass = tagOverrides.get(behavior.product_id);
  if (tagClass && tagClass in RECOGNIZED_TAGS) {
    const mapped = RECOGNIZED_TAGS[tagClass as keyof typeof RECOGNIZED_TAGS];
    return {
      ...base,
      classification: mapped,
      confidence: 100,
      method: 'shopify_tag',
      signals: [`Shopify tag "${tagClass}" → classified as "${mapped}"`],
      needs_review: false,
    };
  }
  // Also handle the case where tagOverrides already has the mapped value
  if (tagClass) {
    const validClassifications: ClassificationResult['classification'][] = [
      'main', 'upsell', 'addon', 'bundle', 'excluded', 'pending', 'unknown',
    ];
    if (validClassifications.includes(tagClass as ClassificationResult['classification'])) {
      return {
        ...base,
        classification: tagClass as ClassificationResult['classification'],
        confidence: 100,
        method: 'shopify_tag',
        signals: [`Shopify tag override → classified as "${tagClass}"`],
        needs_review: false,
      };
    }
  }

  // ── 4. Single-focus store ───────────────────────────────
  if (storeProfile.inferred_structure === 'single_focus') {
    const topProduct = findTopOrderProduct(behaviorMap);
    const isTop = topProduct === behavior.product_id;

    return {
      ...base,
      classification: isTop ? 'main' : 'upsell',
      confidence: isTop ? 92 : 80,
      method: 'store_structure',
      signals: [
        isTop
          ? `Highest order count in a single-focus store (${behavior.total_orders} orders)`
          : `Secondary product in single-focus store (${pct(behavior.alone_rate)} alone rate)`,
      ],
      parent_product: isTop ? null : findParentTitle(behavior, behaviorMap),
      needs_review: false,
    };
  }

  // ── 5. Catalog store ────────────────────────────────────
  if (storeProfile.inferred_structure === 'catalog') {
    return {
      ...base,
      classification: 'main',
      confidence: 75,
      method: 'store_structure',
      signals: ['Catalog store — all products are independent'],
      needs_review: false,
    };
  }

  // ── 6. Funnel / mixed stores — relative scoring ─────────
  return classifyByRelativeSignals(
    behavior,
    storeProfile,
    allFirstRates,
    allRevenueShares,
    behaviorMap,
  );
}

// ── Relative Signal Scoring (funnel / mixed stores) ─────────

function classifyByRelativeSignals(
  behavior: ProductBehavior,
  storeProfile: StoreBehaviorProfile,
  allFirstRates: number[],
  allRevenueShares: number[],
  behaviorMap: Map<string, ProductBehavior>,
): ClassificationResult {
  let mainScore = 0;
  let upsellScore = 0;
  const signals: string[] = [];

  // ── Signal 1: Alone Rate (max 40 points) ────────────────
  const alonePos = relativePosition(
    behavior.alone_rate,
    storeProfile.p25_alone_rate,
    storeProfile.median_alone_rate,
    storeProfile.p75_alone_rate,
  );

  if (alonePos > 0.6) {
    const points = 40 * alonePos;
    mainScore += points;
    signals.push(
      `Alone rate ${pct(behavior.alone_rate)} is above store P75 — bought independently (main signal +${Math.round(points)})`,
    );
  } else if (alonePos < 0.3) {
    const points = 40 * (1 - alonePos);
    upsellScore += points;
    signals.push(
      `Alone rate ${pct(behavior.alone_rate)} is below store P25 — rarely bought alone (upsell signal +${Math.round(points)})`,
    );
  } else {
    signals.push(
      `Alone rate ${pct(behavior.alone_rate)} is near store median — neutral`,
    );
  }

  // ── Signal 2: First Position Rate (max 30 points) ───────
  const firstRank = rankPercentile(behavior.first_rate, allFirstRates);

  if (firstRank > 0.7) {
    const points = 30 * firstRank;
    mainScore += points;
    signals.push(
      `First-in-cart rate ${pct(behavior.first_rate)} ranks top ${pct((1 - firstRank) * 100)} — drives purchase intent (main signal +${Math.round(points)})`,
    );
  } else if (firstRank < 0.3) {
    const points = 30 * (1 - firstRank);
    upsellScore += points;
    signals.push(
      `First-in-cart rate ${pct(behavior.first_rate)} ranks bottom ${pct(firstRank * 100)} — added after decision (upsell signal +${Math.round(points)})`,
    );
  } else {
    signals.push(
      `First-in-cart rate ${pct(behavior.first_rate)} is mid-range — neutral`,
    );
  }

  // ── Signal 3: Revenue Share (max 20 points) ─────────────
  const revenueRank = rankPercentile(behavior.revenue_share, allRevenueShares);

  if (revenueRank > 0.7) {
    const points = 20 * revenueRank;
    mainScore += points;
    signals.push(
      `Revenue share ${pct(behavior.revenue_share)} ranks top ${pct((1 - revenueRank) * 100)} — major revenue driver (main signal +${Math.round(points)})`,
    );
  } else if (revenueRank < 0.25 && behavior.co_occurrence_rate > 0.5) {
    const points = 20 * (1 - revenueRank);
    upsellScore += points;
    signals.push(
      `Revenue share ${pct(behavior.revenue_share)} is low but co-occurrence is ${pct(behavior.co_occurrence_rate)} — add-on behavior (upsell signal +${Math.round(points)})`,
    );
  } else {
    signals.push(
      `Revenue share ${pct(behavior.revenue_share)} — neutral`,
    );
  }

  // ── Signal 4: Co-occurrence Dependency (max 25 points) ──
  const topCompanion = behavior.top_companions?.[0];
  if (topCompanion && topCompanion.co_rate * 100 > 70) {
    const companionBehavior = behaviorMap.get(topCompanion.product_id);
    if (companionBehavior && companionBehavior.alone_rate > behavior.alone_rate * 1.5) {
      upsellScore += 25;
      signals.push(
        `Appears with "${topCompanion.product_title}" in ${pct(topCompanion.co_rate * 100)} of orders, and that product has ${pct(companionBehavior.alone_rate)} alone rate vs this product's ${pct(behavior.alone_rate)} — dependent on companion (upsell signal +25)`,
      );
    }
  }

  // ── Signal 5: Value Lift (max 15 points) ────────────────
  if (behavior.value_lift > 0 && behavior.alone_rate < storeProfile.median_alone_rate) {
    upsellScore += 15;
    signals.push(
      `Value lift of +${pct(behavior.value_lift)} when added to orders, with below-median alone rate — increases AOV when present (upsell signal +15)`,
    );
  }

  // ── Decision ────────────────────────────────────────────
  const totalScore = mainScore + upsellScore;
  const confidence = Math.min(95, (Math.max(mainScore, upsellScore) / Math.max(totalScore, 1)) * 100);

  let classification: ClassificationResult['classification'];
  let needsReview = false;
  let parentProduct: string | null = null;

  if (mainScore > upsellScore * 1.5 && mainScore > 30) {
    classification = 'main';
    signals.push(
      `Decision: MAIN (main score ${Math.round(mainScore)} vs upsell score ${Math.round(upsellScore)}, confidence ${Math.round(confidence)}%)`,
    );
  } else if (upsellScore > mainScore * 1.5 && upsellScore > 30) {
    classification = 'upsell';
    parentProduct = findParentTitle(behavior, behaviorMap);
    signals.push(
      `Decision: UPSELL (upsell score ${Math.round(upsellScore)} vs main score ${Math.round(mainScore)}, confidence ${Math.round(confidence)}%)${parentProduct ? ` — parent: "${parentProduct}"` : ''}`,
    );
  } else {
    classification = 'unknown';
    needsReview = true;
    signals.push(
      `Decision: UNKNOWN — scores too close (main ${Math.round(mainScore)} vs upsell ${Math.round(upsellScore)}). Needs merchant review.`,
    );
  }

  return {
    product_id: behavior.product_id,
    product_title: behavior.product_title,
    classification,
    confidence: Math.round(confidence),
    method: 'relative_signals',
    signals,
    parent_product: parentProduct,
    downsell_of: null,
    needs_review: needsReview,
  };
}

// ── Internal Helpers ────────────────────────────────────────

/**
 * Find the product_id with the most orders.
 */
function findTopOrderProduct(behaviorMap: Map<string, ProductBehavior>): string {
  let topId = '';
  let topOrders = -1;
  for (const [id, b] of behaviorMap) {
    if (b.total_orders > topOrders) {
      topOrders = b.total_orders;
      topId = id;
    }
  }
  return topId;
}

/**
 * For upsell products, find the most likely parent: the top companion
 * that has a higher alone_rate than this product.
 */
function findParentTitle(
  behavior: ProductBehavior,
  behaviorMap: Map<string, ProductBehavior>,
): string | null {
  if (!behavior.top_companions || behavior.top_companions.length === 0) {
    return null;
  }

  for (const companion of behavior.top_companions) {
    const companionBehavior = behaviorMap.get(companion.product_id);
    if (companionBehavior && companionBehavior.alone_rate > behavior.alone_rate) {
      return companion.product_title;
    }
  }

  // Fallback: return the top companion regardless
  return behavior.top_companions[0]?.product_title ?? null;
}

// ── Downsell Detection ──────────────────────────────────────

/**
 * Jaccard similarity on lowercased word sets from product titles.
 */
const DS_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'in', 'on', 'to', 'with',
]);

function dsTokenize(title: string): Set<string> {
  const words = new Set<string>();
  for (const w of title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (w.length > 1 && !DS_STOP_WORDS.has(w)) words.add(w);
  }
  return words;
}

function dsJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) { if (b.has(w)) intersection++; }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Checks each classified product for downsell potential.
 *
 * A downsell is a cheaper alternative to a main product that customers buy
 * INSTEAD OF (not in addition to) the main product. Key signals:
 *
 * 1. **Exclusivity** (35pts): High mutual exclusion rate — they don't appear
 *    in the same order, suggesting they're alternatives.
 * 2. **Title Similarity** (25pts): Similar product names suggest variants
 *    (e.g., "Premium Widget" vs "Basic Widget").
 * 3. **Price Ratio** (25pts): Downsell must be cheaper than the main product.
 *    Ideal range: 30%-80% of the main product's price.
 * 4. **Behavioral Asymmetry** (15pts): Main product has higher alone_rate,
 *    meaning customers prefer the main but some opt for the cheaper version.
 */
function detectDownsells(
  results: ClassificationResult[],
  behaviorMap: Map<string, ProductBehavior>,
): void {
  const resultMap = new Map<string, ClassificationResult>();
  for (const r of results) resultMap.set(r.product_id, r);

  for (const result of results) {
    // Only check products not already manually classified or with strong classifications
    if (result.method === 'manual_override' || result.method === 'shopify_tag') continue;
    if (result.classification === 'excluded' || result.classification === 'bundle') continue;
    if (result.classification === 'pending') continue;

    const behavior = behaviorMap.get(result.product_id);
    if (!behavior || !behavior.mutual_exclusions || behavior.mutual_exclusions.length === 0) continue;
    if (behavior.total_orders < 5) continue;

    // Check each mutual exclusion candidate
    for (const excl of behavior.mutual_exclusions) {
      const mainBehavior = behaviorMap.get(excl.product_id);
      if (!mainBehavior) continue;

      const mainResult = resultMap.get(excl.product_id);
      if (!mainResult) continue;

      // The potential "main" product must be classified as main or unknown
      if (mainResult.classification !== 'main' && mainResult.classification !== 'unknown') continue;

      const score = computeDownsellScore(behavior, mainBehavior, excl);

      if (score.total >= 55) {
        result.classification = 'downsell';
        result.downsell_of = excl.product_id;
        result.parent_product = excl.product_title;
        result.confidence = Math.min(95, Math.round(score.total));
        result.method = 'downsell_detection';
        result.needs_review = score.total < 70;
        result.signals.push(
          ...score.signals,
          `Decision: DOWNSELL of "${excl.product_title}" (score ${Math.round(score.total)}, confidence ${result.confidence}%)`,
        );
        break; // Found a downsell match, stop checking
      }
    }
  }
}

interface DownsellScore {
  total: number;
  signals: string[];
}

function computeDownsellScore(
  candidate: ProductBehavior,
  mainProduct: ProductBehavior,
  exclusion: { exclusion_rate: number; price: number },
): DownsellScore {
  let total = 0;
  const signals: string[] = [];

  // Signal 1: Exclusivity (max 35 points)
  // High exclusion rate means they rarely appear in the same order
  if (exclusion.exclusion_rate > 0.7) {
    const points = 35 * Math.min(1, exclusion.exclusion_rate);
    total += points;
    signals.push(
      `Exclusivity: ${pct(exclusion.exclusion_rate * 100)} mutual exclusion rate — rarely bought together (downsell signal +${Math.round(points)})`,
    );
  } else if (exclusion.exclusion_rate > 0.5) {
    const points = 20 * exclusion.exclusion_rate;
    total += points;
    signals.push(
      `Exclusivity: ${pct(exclusion.exclusion_rate * 100)} mutual exclusion — moderate alternative behavior (downsell signal +${Math.round(points)})`,
    );
  }

  // Signal 2: Title Similarity (max 25 points)
  const titleSim = dsJaccard(
    dsTokenize(candidate.product_title),
    dsTokenize(mainProduct.product_title),
  );
  if (titleSim > 0.3) {
    const points = 25 * Math.min(1, titleSim / 0.7);
    total += points;
    signals.push(
      `Title similarity: ${pct(titleSim * 100)} Jaccard overlap — likely variant (downsell signal +${Math.round(points)})`,
    );
  }

  // Signal 3: Price Ratio (max 25 points)
  // Downsell should be cheaper. Ideal range: 30%-80% of main price.
  if (mainProduct.avg_unit_price > 0 && candidate.avg_unit_price > 0) {
    const priceRatio = candidate.avg_unit_price / mainProduct.avg_unit_price;
    if (priceRatio > 0.1 && priceRatio < 0.85) {
      // Sweet spot: 30%-70% of main price gets max points
      let points: number;
      if (priceRatio >= 0.3 && priceRatio <= 0.7) {
        points = 25;
      } else if (priceRatio < 0.3) {
        points = 15; // Very cheap — might be an accessory, not downsell
      } else {
        points = 20; // 70-85% — close in price, weaker signal
      }
      total += points;
      signals.push(
        `Price ratio: ${pct(priceRatio * 100)} of main product price ($${candidate.avg_unit_price.toFixed(2)} vs $${mainProduct.avg_unit_price.toFixed(2)}) (downsell signal +${points})`,
      );
    }
  }

  // Signal 4: Behavioral Asymmetry (max 15 points)
  // Main product should have higher alone_rate (bought independently more often)
  if (mainProduct.alone_rate > candidate.alone_rate * 1.2) {
    const ratio = mainProduct.alone_rate / Math.max(candidate.alone_rate, 0.01);
    const points = Math.min(15, 10 * Math.min(ratio, 3) / 3 + 5);
    total += points;
    signals.push(
      `Behavioral asymmetry: main product alone rate ${pct(mainProduct.alone_rate * 100)} vs this product ${pct(candidate.alone_rate * 100)} — main is more independent (downsell signal +${Math.round(points)})`,
    );
  }

  return { total, signals };
}

/**
 * Reconciles symmetric downsell pairs.
 *
 * If product A is classified as downsell of B, and B is also classified
 * as downsell of A, keep only the cheaper product as the downsell.
 * The more expensive product becomes (or stays) 'main'.
 */
function reconcileDownsellPairs(
  results: ClassificationResult[],
  behaviorMap: Map<string, ProductBehavior>,
): void {
  const downsells = results.filter(r => r.classification === 'downsell' && r.downsell_of);
  const resultMap = new Map<string, ClassificationResult>();
  for (const r of results) resultMap.set(r.product_id, r);

  // Find symmetric pairs
  const processed = new Set<string>();

  for (const ds of downsells) {
    if (processed.has(ds.product_id)) continue;

    const counterpart = resultMap.get(ds.downsell_of!);
    if (!counterpart || counterpart.classification !== 'downsell') continue;
    if (counterpart.downsell_of !== ds.product_id) continue;

    // Symmetric pair found: both are downsells of each other
    processed.add(ds.product_id);
    processed.add(counterpart.product_id);

    const dsBehavior = behaviorMap.get(ds.product_id);
    const counterBehavior = behaviorMap.get(counterpart.product_id);

    if (!dsBehavior || !counterBehavior) continue;

    // The cheaper one stays as downsell, the more expensive becomes main
    const dsPrice = dsBehavior.avg_unit_price;
    const counterPrice = counterBehavior.avg_unit_price;

    let downsellResult: ClassificationResult;
    let mainResult: ClassificationResult;

    if (dsPrice <= counterPrice) {
      downsellResult = ds;
      mainResult = counterpart;
    } else {
      downsellResult = counterpart;
      mainResult = ds;
    }

    // Promote the expensive one to main
    mainResult.classification = 'main';
    mainResult.downsell_of = null;
    mainResult.parent_product = null;
    mainResult.signals.push(
      `Reconciled: promoted to MAIN (more expensive in symmetric pair with "${downsellResult.product_title}")`,
    );

    // Ensure the cheap one points to the correct main
    downsellResult.downsell_of = mainResult.product_id;
    downsellResult.parent_product = mainResult.product_title;
    downsellResult.signals.push(
      `Reconciled: confirmed as DOWNSELL of "${mainResult.product_title}" (cheaper variant in symmetric pair)`,
    );
  }
}
