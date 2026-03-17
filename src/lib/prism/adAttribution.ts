/**
 * PRISM — Ad Attribution Engine
 *
 * Automatically detects which Meta campaigns drive which products.
 * Four methods, cascading confidence:
 *   1. Pixel session data (95% confidence)
 *   2. Ad creative URL matching (90% confidence)
 *   3. Revenue correlation (70% confidence)
 *   4. Campaign name intelligence (50% confidence)
 *
 * Results stored in campaign_product_attributions table.
 * Recomputed periodically — gets smarter over time.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { AdAttributionMethod } from '@/lib/intelligence/types';

const enc = (v: string) => encodeURIComponent(v);

interface AttributionCandidate {
  campaign_id: string;
  campaign_name: string;
  product_id: string;
  product_title: string;
  confidence: number;
  method: AdAttributionMethod;
  sessions_tracked: number;
  conversions_tracked: number;
  correlation_score: number;
  creative_url: string | null;
}

export interface AttributionReport {
  store_id: string;
  total_campaigns: number;
  attributed: number;
  unattributed: number;
  by_method: Record<string, number>;
  attributions: AttributionCandidate[];
}

// ── Main Orchestrator ────────────────────────────────────────

export async function computeAdAttributions(
  storeId: string,
  metaToken?: string,
): Promise<AttributionReport> {
  // Get all campaigns with spend in last 30 days
  const ninetyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const campaigns = await rest<Array<{
    campaign_id: string; campaign_name: string;
  }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${ninetyDaysAgo}` +
    `&select=campaign_id,campaign_name` +
    `&order=campaign_id`
  ).catch(() => []);

  // Deduplicate campaigns (meta_spend_cache has daily rows)
  const campaignMap = new Map<string, string>();
  for (const c of campaigns) {
    if (!campaignMap.has(c.campaign_id)) {
      campaignMap.set(c.campaign_id, c.campaign_name);
    }
  }
  const uniqueCampaigns = Array.from(campaignMap.entries()).map(
    ([campaign_id, campaign_name]) => ({ campaign_id, campaign_name })
  );

  if (uniqueCampaigns.length === 0) {
    return { store_id: storeId, total_campaigns: 0, attributed: 0, unattributed: 0, by_method: {}, attributions: [] };
  }

  // Get products from product_classifications
  const products = await rest<Array<{
    product_id: string; product_title: string; product_handle: string | null;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,product_title,product_handle`
  ).catch(() => []);

  // Run all four methods
  const pixelResults = await pixelSessionAttribution(storeId, uniqueCampaigns);
  const creativeResults = metaToken
    ? await adCreativeUrlAttribution(storeId, uniqueCampaigns, products, metaToken)
    : [];
  const correlationResults = await revenueCorrelationAttribution(storeId, uniqueCampaigns, products);
  const nameResults = campaignNameAttribution(uniqueCampaigns, products);

  // Merge: highest confidence wins per campaign
  const bestPerCampaign = new Map<string, AttributionCandidate>();

  // Process in reverse priority order so higher confidence overwrites
  for (const result of [...nameResults, ...correlationResults, ...creativeResults, ...pixelResults]) {
    const existing = bestPerCampaign.get(result.campaign_id);
    if (!existing || result.confidence > existing.confidence) {
      bestPerCampaign.set(result.campaign_id, result);
    }
  }

  const attributions = Array.from(bestPerCampaign.values());
  const byMethod: Record<string, number> = {};
  for (const a of attributions) {
    byMethod[a.method] = (byMethod[a.method] || 0) + 1;
  }

  // Persist to campaign_product_attributions
  await persistAttributions(storeId, attributions);

  return {
    store_id: storeId,
    total_campaigns: uniqueCampaigns.length,
    attributed: attributions.length,
    unattributed: uniqueCampaigns.length - attributions.length,
    by_method: byMethod,
    attributions,
  };
}

// ── Method 1: Pixel Session Attribution (95% confidence) ────

async function pixelSessionAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
): Promise<AttributionCandidate[]> {
  const sessions = await rest<Array<{
    utm_campaign: string;
    first_product_viewed_id: string;
    first_product_viewed_title: string;
    order_id: string | null;
  }>>(
    `/visitor_attribution?store_id=eq.${enc(storeId)}` +
    `&or=(utm_source.ilike.*facebook*,utm_source.ilike.*meta*,utm_source.ilike.*instagram*,fbclid.not.is.null)` +
    `&utm_campaign=not.is.null&first_product_viewed_id=not.is.null` +
    `&select=utm_campaign,first_product_viewed_id,first_product_viewed_title,order_id`
  ).catch(() => []);

  if (sessions.length === 0) return [];

  // Group by campaign + product
  const campProductStats = new Map<string, Map<string, {
    title: string; sessions: number; conversions: number;
  }>>();

  for (const s of sessions) {
    const campaignKey = s.utm_campaign;
    if (!campProductStats.has(campaignKey)) {
      campProductStats.set(campaignKey, new Map());
    }
    const productMap = campProductStats.get(campaignKey)!;
    const pid = s.first_product_viewed_id;
    const existing = productMap.get(pid) ?? { title: s.first_product_viewed_title || '', sessions: 0, conversions: 0 };
    existing.sessions++;
    if (s.order_id) existing.conversions++;
    productMap.set(pid, existing);
  }

  const results: AttributionCandidate[] = [];

  // Match utm_campaign values to actual campaign_ids
  const campaignNameToId = new Map<string, string>();
  for (const c of campaigns) {
    campaignNameToId.set(c.campaign_name.toLowerCase(), c.campaign_id);
    campaignNameToId.set(c.campaign_id, c.campaign_id);
  }

  for (const [utmCampaign, productMap] of campProductStats) {
    const campaignId = campaignNameToId.get(utmCampaign.toLowerCase()) ?? campaignNameToId.get(utmCampaign);
    if (!campaignId) continue;

    const campaignName = campaigns.find(c => c.campaign_id === campaignId)?.campaign_name ?? utmCampaign;

    // Product with most sessions wins
    let bestProduct: { pid: string; title: string; sessions: number; conversions: number } | null = null;
    let totalSessions = 0;

    for (const [pid, stats] of productMap) {
      totalSessions += stats.sessions;
      if (!bestProduct || stats.sessions > bestProduct.sessions) {
        bestProduct = { pid, title: stats.title, sessions: stats.sessions, conversions: stats.conversions };
      }
    }

    if (!bestProduct || totalSessions < 3) continue;

    const dominance = bestProduct.sessions / totalSessions;
    const confidence = Math.round(95 * dominance);

    results.push({
      campaign_id: campaignId,
      campaign_name: campaignName,
      product_id: bestProduct.pid,
      product_title: bestProduct.title,
      confidence: Math.min(95, confidence),
      method: 'pixel_session',
      sessions_tracked: bestProduct.sessions,
      conversions_tracked: bestProduct.conversions,
      correlation_score: 0,
      creative_url: null,
    });
  }

  return results;
}

// ── Method 2: Ad Creative URL Attribution (90% confidence) ──

async function adCreativeUrlAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
  metaToken: string,
): Promise<AttributionCandidate[]> {
  const { fetchAdCreativeUrls } = await import('@/app/api/lib/meta-client');

  const results: AttributionCandidate[] = [];
  const handleToProduct = new Map<string, { product_id: string; product_title: string }>();

  for (const p of products) {
    if (p.product_handle) {
      handleToProduct.set(p.product_handle.toLowerCase(), { product_id: p.product_id, product_title: p.product_title });
    }
    // Also try deriving handle from title (fallback)
    const derivedHandle = p.product_title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (derivedHandle && !handleToProduct.has(derivedHandle)) {
      handleToProduct.set(derivedHandle, { product_id: p.product_id, product_title: p.product_title });
    }
  }

  if (handleToProduct.size === 0) return results;

  for (const campaign of campaigns) {
    try {
      const creatives = await fetchAdCreativeUrls(metaToken, campaign.campaign_id);

      for (const creative of creatives) {
        const match = creative.url.match(/\/products\/([^/?#]+)/);
        if (!match) continue;

        const handle = match[1].toLowerCase();
        const product = handleToProduct.get(handle);
        if (!product) continue;

        results.push({
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.campaign_name,
          product_id: product.product_id,
          product_title: product.product_title,
          confidence: 90,
          method: 'ad_creative_url',
          sessions_tracked: 0,
          conversions_tracked: 0,
          correlation_score: 0,
          creative_url: creative.url,
        });
        break; // One match per campaign is enough
      }
    } catch {
      // Skip campaign if API fails
    }
  }

  return results;
}

// ── Method 3: Revenue Correlation (70% confidence) ──────────

async function revenueCorrelationAttribution(
  storeId: string,
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
): Promise<AttributionCandidate[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const spendRows = await rest<Array<{ campaign_id: string; date: string; spend: number }>>(
    `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${thirtyDaysAgo}` +
    `&select=campaign_id,date,spend&order=date`
  ).catch(() => []);

  if (spendRows.length === 0) return [];

  const orders = await rest<Array<{ created_at: string; line_items: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(thirtyDaysAgo + 'T00:00:00Z')}` +
    `&order_status=neq.cancelled&financial_status=neq.refunded` +
    `&select=created_at,line_items&order=created_at`
  ).catch(() => []);

  if (orders.length === 0) return [];

  // Build daily revenue per product
  const productDailyRevenue = new Map<string, Map<string, number>>();
  for (const order of orders) {
    const date = order.created_at.split('T')[0];
    let items: Array<{ product_id?: string | number; price?: string; quantity?: number }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }
    for (const item of items) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);
      if (!productDailyRevenue.has(pid)) productDailyRevenue.set(pid, new Map());
      const dayMap = productDailyRevenue.get(pid)!;
      dayMap.set(date, (dayMap.get(date) ?? 0) + (parseFloat(item.price || '0') * (item.quantity || 1)));
    }
  }

  // Build daily spend per campaign
  const campaignDailySpend = new Map<string, Map<string, number>>();
  for (const row of spendRows) {
    if (!campaignDailySpend.has(row.campaign_id)) campaignDailySpend.set(row.campaign_id, new Map());
    const dayMap = campaignDailySpend.get(row.campaign_id)!;
    dayMap.set(row.date, (dayMap.get(row.date) ?? 0) + Number(row.spend));
  }

  // Collect all dates
  const allDates = new Set<string>();
  for (const dayMap of campaignDailySpend.values()) for (const d of dayMap.keys()) allDates.add(d);
  const sortedDates = Array.from(allDates).sort();
  if (sortedDates.length < 7) return [];

  const results: AttributionCandidate[] = [];

  for (const campaign of campaigns) {
    const spendByDay = campaignDailySpend.get(campaign.campaign_id);
    if (!spendByDay) continue;

    const spendVector = sortedDates.map(d => spendByDay.get(d) ?? 0);
    if (spendVector.every(v => v === 0)) continue;

    let bestCorrelation = 0;
    let bestProductId = '';
    let bestProductTitle = '';

    for (const product of products) {
      const revenueByDay = productDailyRevenue.get(product.product_id);
      if (!revenueByDay) continue;

      const revenueVector = sortedDates.map(d => revenueByDay.get(d) ?? 0);
      const correlation = pearsonCorrelation(spendVector, revenueVector);

      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestProductId = product.product_id;
        bestProductTitle = product.product_title;
      }
    }

    if (bestCorrelation > 0.5 && bestProductId) {
      results.push({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        product_id: bestProductId,
        product_title: bestProductTitle,
        confidence: Math.round(70 * bestCorrelation),
        method: 'revenue_correlation',
        sessions_tracked: 0,
        conversions_tracked: 0,
        correlation_score: Math.round(bestCorrelation * 1000) / 1000,
        creative_url: null,
      });
    }
  }

  return results;
}

// ── Method 4: Campaign Name Intelligence (50% confidence) ───

function campaignNameAttribution(
  campaigns: Array<{ campaign_id: string; campaign_name: string }>,
  products: Array<{ product_id: string; product_title: string; product_handle: string | null }>,
): AttributionCandidate[] {
  const results: AttributionCandidate[] = [];

  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'at',
    'by', 'with', 'from', 'up', 'out', 'is', 'it', 'as', 'be', 'was',
    'campaign', 'ad', 'ads', 'adset', 'test', 'v1', 'v2', 'v3', 'v4',
    'broad', 'lookalike', 'retargeting', 'prospecting', 'cbo', 'abo',
    'purchase', 'conversion', 'sales', 'traffic', 'reach', 'engagement',
    'new', 'copy', 'creative', 'interest', 'lal',
  ]);

  function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(t => t.length > 2 && !STOP_WORDS.has(t));
  }

  for (const campaign of campaigns) {
    const campaignTokens = tokenize(campaign.campaign_name);
    if (campaignTokens.length === 0) continue;

    let bestScore = 0;
    let bestProduct: { product_id: string; product_title: string } | null = null;

    for (const product of products) {
      const productTokens = tokenize(product.product_title);
      if (productTokens.length === 0) continue;

      let matchCount = 0;
      for (const token of productTokens) {
        if (campaignTokens.includes(token)) matchCount++;
      }

      const score = matchCount / productTokens.length;
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (bestScore >= 0.3 && bestProduct) {
      results.push({
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.campaign_name,
        product_id: bestProduct.product_id,
        product_title: bestProduct.product_title,
        confidence: Math.round(50 * bestScore),
        method: 'campaign_name',
        sessions_tracked: 0,
        conversions_tracked: 0,
        correlation_score: 0,
        creative_url: null,
      });
    }
  }

  return results;
}

// ── Pearson Correlation ─────────────────────────────────────

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  if (denominator === 0) return 0;

  return Math.max(0, numerator / denominator);
}

// ── Persistence ─────────────────────────────────────────────

async function persistAttributions(
  storeId: string,
  attributions: AttributionCandidate[],
): Promise<void> {
  if (attributions.length === 0) return;

  const now = new Date().toISOString();
  const rows = attributions.map(a => ({
    store_id: storeId,
    campaign_id: a.campaign_id,
    campaign_name: a.campaign_name,
    product_id: a.product_id,
    product_title: a.product_title,
    confidence: a.confidence,
    method: a.method,
    sessions_tracked: a.sessions_tracked,
    conversions_tracked: a.conversions_tracked,
    correlation_score: a.correlation_score,
    creative_url: a.creative_url,
    last_computed_at: now,
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await rest(
      '/campaign_product_attributions?on_conflict=store_id,campaign_id',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(chunk),
      }
    ).catch(() => null);
  }
}
