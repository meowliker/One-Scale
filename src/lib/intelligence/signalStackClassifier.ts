/**
 * Signal Stack Classifier
 *
 * 8 weighted signals combined into a main/upsell score.
 * High confidence → auto-classify. Low confidence → flag for merchant review.
 * Gift cards → EXCLUDE always. <10 orders → PENDING always.
 */

import type {
  ProductOrderPattern,
  ClassificationSignals,
  SignalStackResult,
  ProductClassificationType,
} from './types';
import { DIGITAL_KEYWORDS, BUNDLE_KEYWORDS } from './storeTypeDetector';

// ── Shopify Tag Priority Map ────────────────────────────────
const TAG_MAP: Record<string, string> = {
  'onescale:main': 'main', 'onescale:upsell': 'upsell', 'onescale:exclude': 'exclude', 'onescale:bundle': 'bundle',
  'upsell': 'upsell', 'order-bump': 'upsell', 'order_bump': 'upsell', 'bump': 'upsell',
  'addon': 'upsell', 'add-on': 'upsell', 'cross-sell': 'upsell', 'crosssell': 'upsell',
  'main-product': 'main', 'hero-product': 'main', 'hero': 'main',
  'exclude-pnl': 'exclude', 'no-pnl': 'exclude',
};
const TAG_KEYS = new Set(Object.keys(TAG_MAP));

export function checkShopifyTags(tags: string): string | null {
  if (!tags) return null;
  const productTags = tags.toLowerCase().split(',').map(t => t.trim());
  for (const tag of productTags) {
    if (TAG_KEYS.has(tag)) return TAG_MAP[tag];
  }
  return null;
}

export const REVIEW_CONFIDENCE_THRESHOLD = 65;

// ── Tag/Title Keywords ──────────────────────────────────────

const UPSELL_TAG_KEYWORDS = [
  'upsell', 'addon', 'add-on', 'bump', 'order-bump', 'order bump',
  'downsell', 'cross-sell', 'post-purchase',
];

const MAIN_TAG_KEYWORDS = [
  'main', 'hero', 'flagship', 'primary', 'core', 'featured',
];

const UPSELL_TITLE_KEYWORDS = [
  'bump', 'addon', 'add-on', 'add on', 'warranty', 'tip', 'rush',
  'gift-wrap', 'gift wrap', 'expedited', 'express shipping',
  'insurance', 'protection plan', 'priority shipping',
  'extended warranty', 'shipping protection',
];

// ── Signal Computation ──────────────────────────────────────

export function computeSignals(
  pattern: ProductOrderPattern,
  medianPrice: number,
): ClassificationSignals {
  // Signal 1: Order patterns (40 points max)
  let alone_pct_score = 0;
  if (pattern.alone_pct > 50) alone_pct_score = 35;
  else if (pattern.alone_pct > 30) alone_pct_score = 20;
  else if (pattern.alone_pct < 5) alone_pct_score = -30;

  let position_score = 0;
  if (pattern.first_position_pct > 65) position_score = 25;
  else if (pattern.avg_position > 2.5) position_score = -25;

  // Signal 2: Revenue share (20 points max)
  let revenue_score = 0;
  if (pattern.revenue_share > 30) revenue_score = 20;
  else if (pattern.revenue_share < 5) revenue_score = -10;

  // Signal 3: Shopify tags (40 points — explicit merchant intent)
  const tagsLower = (pattern.tags || '').toLowerCase();
  let tag_score = 0;
  if (UPSELL_TAG_KEYWORDS.some(k => tagsLower.includes(k))) tag_score = -40;
  else if (MAIN_TAG_KEYWORDS.some(k => tagsLower.includes(k))) tag_score = 40;

  // Signal 4: Product type
  let type_score = 0;
  const typeLower = (pattern.product_type || '').toLowerCase();
  if (typeLower === 'gift card' || typeLower === 'gift_card') {
    type_score = -999; // sentinel for EXCLUDE
  }
  if (DIGITAL_KEYWORDS.some(k => typeLower.includes(k) || tagsLower.includes(k))) {
    type_score = Math.max(type_score, 10); // digital products lean MAIN
  }

  // Signal 5: Title keywords
  const titleLower = (pattern.product_title || '').toLowerCase();
  let title_score = 0;
  if (UPSELL_TITLE_KEYWORDS.some(k => titleLower.includes(k))) title_score = -20;

  // Signal 6: Price relative to store median
  let price_score = 0;
  if (medianPrice > 0 && pattern.price < medianPrice * 0.3 && pattern.alone_pct < 15) {
    price_score = -15;
  }

  // Signal 7: Upsell app detection
  let app_score = 0;
  if (pattern.added_programmatically_pct > 70) app_score = -35;

  // Signal 8: Subscription
  let subscription_score = 0;
  if (pattern.requires_selling_plan) subscription_score = 50;

  // ── Aggregate scores ──────────────────────────────────────

  const rawSum = alone_pct_score + position_score + revenue_score + tag_score +
    (type_score === -999 ? 0 : type_score) + // exclude gift card sentinel from aggregate
    title_score + price_score + app_score + subscription_score;

  const main_score = Math.max(0, rawSum);
  const upsell_score = Math.max(0, -rawSum);
  const confidence = Math.min(100, Math.abs(main_score - upsell_score));

  return {
    alone_pct_score,
    position_score,
    revenue_score,
    tag_score,
    type_score,
    title_score,
    price_score,
    app_score,
    subscription_score,
    main_score,
    upsell_score,
    confidence,
  };
}

// ── Classification ──────────────────────────────────────────

export function classifyProduct(
  pattern: ProductOrderPattern,
  signals: ClassificationSignals,
): SignalStackResult {
  const base = {
    product_id: pattern.product_id,
    product_title: pattern.product_title,
    product_type: pattern.product_type,
    alone_pct: pattern.alone_pct,
    first_position_pct: pattern.first_position_pct,
    avg_position: pattern.avg_position,
    revenue_share: pattern.revenue_share,
    total_orders_analyzed: pattern.total_orders,
  };

  // ── EXCLUSIONS (non-negotiable) ───────────────────────────

  // Gift card
  if (signals.type_score <= -999) {
    return {
      ...base,
      classification: 'excluded',
      confidence: 100,
      method: 'edge_case',
      signals,
      needs_review: false,
    };
  }

  // Free gift with purchase: alone_pct < 2% AND $0 price
  if (pattern.alone_pct < 2 && pattern.price === 0) {
    return {
      ...base,
      classification: 'excluded',
      confidence: 95,
      method: 'edge_case',
      signals,
      needs_review: false,
    };
  }

  // Insufficient data
  if (pattern.total_orders < 10) {
    return {
      ...base,
      classification: 'pending',
      confidence: 0,
      method: 'edge_case',
      signals,
      needs_review: false,
    };
  }

  // ── Bundle detection ──────────────────────────────────────

  const titleLower = (pattern.product_title || '').toLowerCase();
  const tagsLower = (pattern.tags || '').toLowerCase();
  if (BUNDLE_KEYWORDS.some(k => titleLower.includes(k) || tagsLower.includes(k))) {
    // Bundles with high alone% are MAIN bundles, otherwise just mark as bundle
    if (pattern.alone_pct > 40) {
      return {
        ...base,
        classification: 'main',
        confidence: 75,
        method: 'signal_stack',
        signals,
        needs_review: false,
      };
    }
    return {
      ...base,
      classification: 'bundle',
      confidence: 70,
      method: 'signal_stack',
      signals,
      needs_review: false,
    };
  }

  // ── HIGH CONFIDENCE auto-classify ─────────────────────────

  if (signals.main_score > 60 && signals.main_score > signals.upsell_score + 20) {
    return {
      ...base,
      classification: 'main',
      confidence: signals.confidence,
      method: 'signal_stack',
      signals,
      needs_review: false,
    };
  }

  if (signals.upsell_score > 60 && signals.upsell_score > signals.main_score + 20) {
    return {
      ...base,
      classification: 'upsell',
      confidence: signals.confidence,
      method: 'signal_stack',
      signals,
      needs_review: false,
    };
  }

  // ── LOW CONFIDENCE → flag for review ──────────────────────

  return {
    ...base,
    classification: 'unknown',
    confidence: signals.confidence,
    method: 'signal_stack',
    signals,
    needs_review: true,
  };
}

/**
 * Compute median price from an array of patterns.
 */
export function computeMedianPrice(patterns: ProductOrderPattern[]): number {
  const prices = patterns.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
  if (prices.length === 0) return 0;
  const mid = Math.floor(prices.length / 2);
  return prices.length % 2 === 0
    ? (prices[mid - 1] + prices[mid]) / 2
    : prices[mid];
}
