/**
 * Campaign Intelligence
 *
 * Matches Meta ad campaigns to products with confidence scores.
 * Learns each store's naming conventions.
 *
 * Priority order (from V4.4):
 * 1. Manual mapping (merchant set) — confidence 1.0
 * 2. Single-product store — all spend to that product, confidence 0.95
 * 3. Exact match — campaign name contains full product title, confidence 0.8
 * 4. Keyword match — tokenized word overlap, variable confidence
 * 5. Unattributed — never distributed silently, confidence 0
 *
 * Re-runs on new campaigns, product changes, or weekly for low-confidence.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import type { CampaignMappingRow, ProductIntelligenceRow } from './types';

// ── Interfaces ──────────────────────────────────────────────

interface CampaignData {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
}

interface MappingResult {
  campaignId: string;
  campaignName: string;
  productId: string | null;
  productName: string;
  confidence: number;
  method: string;
}

// ── Stop words for tokenization ─────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'at',
  'by', 'with', 'from', 'up', 'out', 'is', 'it', 'as', 'be', 'was',
  // Ad-specific stop words
  'campaign', 'ad', 'ads', 'adset', 'test', 'testing', 'v1', 'v2', 'v3', 'v4',
  'broad', 'lookalike', 'lal', 'retargeting', 'rtrg', 'prospecting', 'prosp',
  'cbo', 'abo', 'dpa', 'daba', 'asc', 'advantage',
  'purchase', 'conversion', 'traffic', 'awareness', 'reach', 'engagement',
  'new', 'old', 'copy', 'creative', 'angle', 'hook',
  'interest', 'custom', 'audience', 'cold', 'warm', 'hot',
  'scale', 'scaling', 'phase', 'round', 'batch', 'wave',
  'us', 'usa', 'uk', 'eu', 'ww', 'worldwide', 'global',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  'q1', 'q2', 'q3', 'q4',
]);

// ── Main Mapping Function ───────────────────────────────────

export async function mapCampaignsToProducts(
  storeId: string,
  campaigns: CampaignData[],
  products: ProductIntelligenceRow[]
): Promise<MappingResult[]> {
  // Load existing manual mappings
  let existingMappings: CampaignMappingRow[] = [];
  try {
    existingMappings = await rest<CampaignMappingRow[]>(
      `/campaign_product_mappings?store_id=eq.${encodeURIComponent(storeId)}&method=eq.manual&select=*`
    );
  } catch { /* table might not exist */ }

  const manualMap = new Map<string, CampaignMappingRow>();
  for (const m of existingMappings) {
    manualMap.set(m.campaign_id, m);
  }

  // Filter to main products only for attribution (upsells don't drive ad spend)
  const mainProducts = products.filter(p =>
    p.classification === 'main' || p.classification === 'subscription'
  );

  const results: MappingResult[] = [];

  for (const campaign of campaigns) {
    // Priority 1: Manual mapping
    if (manualMap.has(campaign.campaignId)) {
      const manual = manualMap.get(campaign.campaignId)!;
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: manual.product_id,
        productName: manual.product_name || '',
        confidence: 1.0,
        method: 'manual',
      });
      continue;
    }

    // Priority 2: Single main product store
    if (mainProducts.length === 1) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: mainProducts[0].product_id,
        productName: mainProducts[0].product_title,
        confidence: 0.95,
        method: 'single_product',
      });
      continue;
    }

    // Priority 3: Exact match — full product title in campaign name
    const exactMatch = findExactMatch(campaign.campaignName, mainProducts);
    if (exactMatch) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: exactMatch.product_id,
        productName: exactMatch.product_title,
        confidence: 0.8,
        method: 'exact_match',
      });
      continue;
    }

    // Priority 4: Keyword match with confidence scoring
    const keywordMatch = findKeywordMatch(campaign.campaignName, mainProducts);
    if (keywordMatch && keywordMatch.score >= 0.3) {
      // Map score to V4.4-style confidence tiers
      const confidence = scoreToConfidence(keywordMatch.score);
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: keywordMatch.productId,
        productName: keywordMatch.productTitle,
        confidence,
        method: 'keyword_match',
      });
      continue;
    }

    // Priority 5: Unattributed — never silently distribute
    results.push({
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      productId: null,
      productName: '',
      confidence: 0,
      method: 'unattributed',
    });
  }

  return results;
}

/**
 * Map campaigns and save results to campaign_product_mappings table.
 */
export async function mapAndSaveCampaigns(
  storeId: string,
  campaigns: CampaignData[],
  products: ProductIntelligenceRow[]
): Promise<MappingResult[]> {
  const results = await mapCampaignsToProducts(storeId, campaigns, products);

  // Save auto-detected mappings (don't overwrite manual ones)
  const autoMappings = results.filter(r => r.method !== 'manual' && r.productId);
  const now = new Date().toISOString();

  if (autoMappings.length > 0) {
    const payloads = autoMappings.map(r => ({
      store_id: storeId,
      campaign_id: r.campaignId,
      campaign_name: r.campaignName,
      product_id: r.productId,
      product_name: r.productName,
      confidence: r.confidence,
      method: r.method,
      last_updated_at: now,
    }));

    // Upsert in chunks
    for (let i = 0; i < payloads.length; i += 50) {
      const chunk = payloads.slice(i, i + 50);
      await rest(
        '/campaign_product_mappings?on_conflict=store_id,campaign_id',
        {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(chunk),
        }
      );
    }
  }

  // Update store_intelligence
  try {
    await rest(
      `/store_intelligence?store_id=eq.${encodeURIComponent(storeId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          campaigns_mapped_at: now,
          updated_at: now,
        }),
      }
    );
  } catch { /* ignore */ }

  return results;
}

// ── Matching Helpers ────────────────────────────────────────

function findExactMatch(
  campaignName: string,
  products: ProductIntelligenceRow[]
): ProductIntelligenceRow | null {
  const nameLower = campaignName.toLowerCase();

  for (const product of products) {
    const titleLower = product.product_title.toLowerCase();
    // Full title must appear in campaign name (minimum 3 chars to avoid false positives)
    if (titleLower.length >= 3 && nameLower.includes(titleLower)) {
      return product;
    }
  }

  return null;
}

function findKeywordMatch(
  campaignName: string,
  products: ProductIntelligenceRow[]
): { productId: string; productTitle: string; score: number } | null {
  const campaignTokens = tokenize(campaignName);
  if (campaignTokens.length === 0) return null;

  let bestMatch: { productId: string; productTitle: string; score: number } | null = null;

  for (const product of products) {
    const productTokens = tokenize(product.product_title);
    if (productTokens.length === 0) continue;

    // Count matches
    let matchCount = 0;
    for (const token of productTokens) {
      if (campaignTokens.includes(token)) {
        matchCount++;
      }
    }

    const score = matchCount / productTokens.length;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = {
        productId: product.product_id,
        productTitle: product.product_title,
        score,
      };
    }
  }

  return bestMatch;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

/**
 * Convert raw keyword match score to V4.4-style confidence tiers:
 * 100% match → 0.8, 80% → 0.6, 60% → 0.5, 40% → 0.4, 30% → 0.35
 */
function scoreToConfidence(score: number): number {
  if (score >= 1.0) return 0.8;
  if (score >= 0.8) return 0.6;
  if (score >= 0.6) return 0.5;
  if (score >= 0.4) return 0.4;
  return 0.35;
}

/**
 * Set manual campaign-to-product mapping.
 */
export async function setManualCampaignMapping(
  storeId: string,
  campaignId: string,
  campaignName: string,
  productId: string,
  productName: string
): Promise<void> {
  await rest(
    '/campaign_product_mappings?on_conflict=store_id,campaign_id',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        store_id: storeId,
        campaign_id: campaignId,
        campaign_name: campaignName,
        product_id: productId,
        product_name: productName,
        confidence: 1.0,
        method: 'manual',
        last_updated_at: new Date().toISOString(),
      }]),
    }
  );
}
