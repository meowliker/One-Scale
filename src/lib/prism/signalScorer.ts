/**
 * PRISM — Multi-Signal Product Scorer
 *
 * Computes 15+ signals per product from all data sources:
 * ad campaigns, pixel sessions, order patterns, Shopify metadata.
 * Produces a final classification score with full signal breakdown.
 */

import { rest } from '@/app/api/lib/supabase-persistence';

const enc = (v: string) => encodeURIComponent(v);

// ── Title/Description keyword lists ─────────────────────────

const UPSELL_TITLE_KEYWORDS = [
  'bundle', 'kit', 'pack', 'upgrade', 'bonus', 'add-on', 'addon',
  'fast', 'rush', 'vip', 'express', 'priority', 'warranty',
  'insurance', 'protection', 'gift-wrap', 'gift wrap', 'tip',
  'bump', 'expedited', 'shipping protection', 'extended warranty',
];

const MAIN_TITLE_KEYWORDS = [
  'course', 'masterclass', 'program', 'system', 'blueprint',
  'guide', 'complete', 'full', 'ultimate', 'signature',
];

const UPSELL_HANDLE_PREFIXES = ['upsell', 'bump', 'oto', 'downsell', 'addon'];

// ── Signal Weights (adaptive) ───────────────────────────────

interface WeightConfig {
  own_campaigns: number;
  ad_landing: number;
  title_keywords: number;
  alone_rate: number;
  session_entry: number;
  traffic_source: number;
  product_type_tags: number;
  price_relative: number;
  product_handle: number;
  position: number;
  first_order: number;
  direct_spend_share: number;
}

function computeAdaptiveWeights(hasPixelData: boolean, hasAdData: boolean): WeightConfig {
  if (hasPixelData && hasAdData) {
    return {
      own_campaigns: 0.25, ad_landing: 0.20, title_keywords: 0.05,
      alone_rate: 0.10, session_entry: 0.08, traffic_source: 0.06,
      product_type_tags: 0.03, price_relative: 0.02,
      product_handle: 0.02, position: 0.05,
      first_order: 0.03, direct_spend_share: 0.00,
    };
  }
  if (hasAdData) {
    return {
      own_campaigns: 0.30, ad_landing: 0.00, title_keywords: 0.10,
      alone_rate: 0.20, session_entry: 0.00, traffic_source: 0.00,
      product_type_tags: 0.05, price_relative: 0.03,
      product_handle: 0.03, position: 0.10,
      first_order: 0.05, direct_spend_share: 0.05,
    };
  }
  // No ad data, no pixel — rely on behavioral + metadata
  return {
    own_campaigns: 0.00, ad_landing: 0.00, title_keywords: 0.20,
    alone_rate: 0.25, session_entry: 0.00, traffic_source: 0.00,
    product_type_tags: 0.05, price_relative: 0.05,
    product_handle: 0.05, position: 0.15,
    first_order: 0.07, direct_spend_share: 0.00,
  };
}

// ── Main Entry Point ────────────────────────────────────────

export interface SignalScoreReport {
  store_id: string;
  products_scored: number;
  signals_available: number;
  products: Array<{
    product_id: string;
    product_title: string;
    classification: string;
    confidence: number;
    primary_signal: string;
    total_score: number;
    signal_count: number;
  }>;
}

export async function computeAllSignals(storeId: string): Promise<SignalScoreReport> {
  // Load data sources in parallel
  const [classifications, attributions, behaviors, metaSessions, orders] = await Promise.all([
    rest<Array<{
      product_id: string; product_title: string; product_type: string;
      product_handle: string | null; alone_pct: number; first_position_pct: number;
      avg_position: number; revenue_share: number; has_own_campaigns: boolean;
      ad_landing_rate: number; manual_override: boolean;
    }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,product_title,product_type,product_handle,alone_pct,first_position_pct,avg_position,revenue_share,has_own_campaigns,ad_landing_rate,manual_override`
    ).catch(() => []),

    rest<Array<{
      campaign_id: string; product_id: string; confidence: number; method: string;
    }>>(
      `/campaign_product_attributions?store_id=eq.${enc(storeId)}&select=campaign_id,product_id,confidence,method`
    ).catch(() => []),

    rest<Array<{
      product_id: string; alone_rate: number; first_rate: number;
      avg_position: number; revenue_share: number; co_occurrence_rate: number;
    }>>(
      `/product_behaviors?store_id=eq.${enc(storeId)}&select=product_id,alone_rate,first_rate,avg_position,revenue_share,co_occurrence_rate`
    ).catch(() => []),

    rest<Array<{
      first_product_viewed_id: string; order_id: string | null;
    }>>(
      `/visitor_attribution?store_id=eq.${enc(storeId)}&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,fbclid.not.is.null)&select=first_product_viewed_id,order_id`
    ).catch(() => []),

    rest<Array<{ line_items: string; created_at: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&order_status=neq.cancelled&financial_status=neq.refunded&select=line_items,created_at&order=created_at.asc&limit=1000`
    ).catch(() => []),
  ]);

  const hasAdData = attributions.length > 0;
  const hasPixelData = metaSessions.length > 0;
  const weights = computeAdaptiveWeights(hasPixelData, hasAdData);

  // Build lookup maps
  const behaviorMap = new Map(behaviors.map(b => [b.product_id, b]));
  const attributionsByProduct = new Map<string, number>();
  for (const a of attributions) {
    attributionsByProduct.set(a.product_id, (attributionsByProduct.get(a.product_id) ?? 0) + 1);
  }

  // Pixel landing counts
  const totalMetaSessions = metaSessions.length;
  const landingCounts = new Map<string, number>();
  for (const s of metaSessions) {
    if (s.first_product_viewed_id) {
      landingCounts.set(s.first_product_viewed_id, (landingCounts.get(s.first_product_viewed_id) ?? 0) + 1);
    }
  }

  // Median revenue share for relative scoring
  const revenueShares = classifications.map(c => c.revenue_share).filter(p => p > 0).sort((a, b) => a - b);
  const medianRevenueShare = revenueShares.length > 0 ? revenueShares[Math.floor(revenueShares.length / 2)] : 0;

  // First-order appearance
  const firstOrderProducts = new Set<string>();
  if (orders.length > 0) {
    const earlyOrders = orders.slice(0, Math.max(10, Math.floor(orders.length * 0.1)));
    for (const o of earlyOrders) {
      let items: Array<{ product_id?: string | number }>;
      try { items = typeof o.line_items === 'string' ? JSON.parse(o.line_items) : o.line_items || []; } catch { continue; }
      for (const item of items) {
        if (item.product_id) firstOrderProducts.add(String(item.product_id));
      }
    }
  }

  const totalCampaigns = new Set(attributions.map(a => a.campaign_id)).size;

  // Score each product
  const scoredProducts: SignalScoreReport['products'] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scoreRows: Array<Record<string, any>> = [];

  for (const product of classifications) {
    if (product.manual_override) continue;

    const behavior = behaviorMap.get(product.product_id);
    const hasOwnCampaigns = (attributionsByProduct.get(product.product_id) ?? 0) > 0;
    const landingSessions = landingCounts.get(product.product_id) ?? 0;
    const landingRate = totalMetaSessions > 0 ? landingSessions / totalMetaSessions : 0;
    const campaignCount = attributionsByProduct.get(product.product_id) ?? 0;
    const spendShare = totalCampaigns > 0 ? campaignCount / totalCampaigns : 0;

    // Compute individual signal scores (-1 to +1, positive = main, negative = upsell)
    const scores: Record<string, number> = {};
    let signalCount = 0;

    // Ad signals
    scores.own_campaigns = hasOwnCampaigns ? 1.0 : (hasAdData ? -0.5 : 0);
    if (hasAdData) signalCount++;

    scores.ad_landing = landingRate > 0.1 ? 0.8 : (landingRate > 0 ? 0.3 : (hasPixelData ? -0.5 : 0));
    if (hasPixelData) signalCount++;

    scores.direct_spend_share = spendShare > 0.2 ? 0.8 : (spendShare > 0 ? 0.3 : 0);
    if (hasAdData && spendShare > 0) signalCount++;

    // Behavioral signals
    const aloneRate = behavior?.alone_rate ?? (product.alone_pct / 100);
    scores.alone_rate = aloneRate > 0.5 ? 0.8 : (aloneRate > 0.3 ? 0.3 : (aloneRate < 0.05 ? -0.8 : -0.3));
    signalCount++;

    const firstRate = behavior?.first_rate ?? (product.first_position_pct / 100);
    scores.position = firstRate > 0.65 ? 0.7 : (product.avg_position > 2.5 ? -0.7 : 0);
    signalCount++;

    scores.revenue_share = product.revenue_share > 30 ? 0.6 : (product.revenue_share < 5 ? -0.4 : 0);
    signalCount++;

    // Shopify metadata signals
    const titleLower = (product.product_title || '').toLowerCase();
    const typeLower = (product.product_type || '').toLowerCase();
    const handleLower = (product.product_handle || '').toLowerCase();

    scores.title_keywords = UPSELL_TITLE_KEYWORDS.some(k => titleLower.includes(k)) ? -0.7
      : MAIN_TITLE_KEYWORDS.some(k => titleLower.includes(k)) ? 0.6 : 0;
    if (scores.title_keywords !== 0) signalCount++;

    scores.product_type_tags = typeLower.includes('upsell') || typeLower.includes('bump') ? -0.8
      : typeLower.includes('main') || typeLower.includes('hero') ? 0.7 : 0;
    if (scores.product_type_tags !== 0) signalCount++;

    scores.price_relative = product.revenue_share < medianRevenueShare * 0.3 ? -0.3
      : product.revenue_share > medianRevenueShare * 1.5 ? 0.3 : 0;
    if (scores.price_relative !== 0) signalCount++;

    scores.product_handle = UPSELL_HANDLE_PREFIXES.some(p => handleLower.startsWith(p)) ? -0.8 : 0;
    if (scores.product_handle !== 0) signalCount++;

    scores.description_keywords = 0;
    scores.compare_at_price = 0;
    scores.session_entry = 0;
    scores.traffic_source = landingRate > 0.2 ? 0.5 : 0;
    if (hasPixelData && scores.traffic_source !== 0) signalCount++;

    scores.add_to_cart_source = 0;
    scores.first_order = firstOrderProducts.has(product.product_id) ? 0.4 : -0.2;
    signalCount++;
    scores.refund_rate = 0;

    // Compute weighted total
    let totalScore = 0;
    totalScore += scores.own_campaigns * weights.own_campaigns;
    totalScore += scores.ad_landing * weights.ad_landing;
    totalScore += scores.direct_spend_share * weights.direct_spend_share;
    totalScore += scores.alone_rate * weights.alone_rate;
    totalScore += scores.position * weights.position;
    totalScore += scores.title_keywords * weights.title_keywords;
    totalScore += scores.product_type_tags * weights.product_type_tags;
    totalScore += scores.price_relative * weights.price_relative;
    totalScore += scores.product_handle * weights.product_handle;
    totalScore += scores.traffic_source * weights.traffic_source;
    totalScore += scores.first_order * weights.first_order;

    // Find primary signal
    let primarySignal = 'behavioral';
    let maxContribution = 0;
    const contributions: Record<string, number> = {
      'ad_campaigns': Math.abs(scores.own_campaigns * weights.own_campaigns),
      'ad_landing': Math.abs(scores.ad_landing * weights.ad_landing),
      'alone_rate': Math.abs(scores.alone_rate * weights.alone_rate),
      'position': Math.abs(scores.position * weights.position),
      'title_keywords': Math.abs(scores.title_keywords * weights.title_keywords),
      'product_type': Math.abs(scores.product_type_tags * weights.product_type_tags),
      'product_handle': Math.abs(scores.product_handle * weights.product_handle),
    };
    for (const [signal, contribution] of Object.entries(contributions)) {
      if (contribution > maxContribution) {
        maxContribution = contribution;
        primarySignal = signal;
      }
    }

    // Determine classification
    let classification: string;
    let confidence: number;
    if (totalScore > 0.3) {
      classification = 'main';
      confidence = Math.min(99, Math.round(totalScore * 100));
    } else if (totalScore < -0.3) {
      classification = 'upsell';
      confidence = Math.min(99, Math.round(Math.abs(totalScore) * 100));
    } else {
      classification = 'pending';
      confidence = Math.round(Math.abs(totalScore) * 100);
    }

    scoredProducts.push({
      product_id: product.product_id,
      product_title: product.product_title,
      classification, confidence, primary_signal: primarySignal,
      total_score: Math.round(totalScore * 1000) / 1000,
      signal_count: signalCount,
    });

    scoreRows.push({
      store_id: storeId,
      product_id: product.product_id,
      score_own_campaigns: scores.own_campaigns,
      score_ad_landing: scores.ad_landing,
      score_direct_spend_share: scores.direct_spend_share,
      score_alone_rate: scores.alone_rate,
      score_position: scores.position,
      score_revenue_share: scores.revenue_share,
      score_title_keywords: scores.title_keywords,
      score_product_type_tags: scores.product_type_tags,
      score_price_relative: scores.price_relative,
      score_description_keywords: scores.description_keywords,
      score_product_handle: scores.product_handle,
      score_compare_at_price: scores.compare_at_price,
      score_session_entry: scores.session_entry,
      score_traffic_source: scores.traffic_source,
      score_add_to_cart_source: scores.add_to_cart_source,
      score_first_order_appearance: scores.first_order,
      score_refund_rate: scores.refund_rate,
      total_score: totalScore,
      signal_count: signalCount,
      classification,
      confidence,
      primary_signal: primarySignal,
      computed_at: new Date().toISOString(),
    });
  }

  // Persist scores
  for (let i = 0; i < scoreRows.length; i += 50) {
    const chunk = scoreRows.slice(i, i + 50);
    await rest(
      '/product_signal_scores?on_conflict=store_id,product_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      }
    ).catch(() => null);
  }

  return {
    store_id: storeId,
    products_scored: scoredProducts.length,
    signals_available: hasAdData && hasPixelData ? 15 : hasAdData ? 10 : 8,
    products: scoredProducts,
  };
}
