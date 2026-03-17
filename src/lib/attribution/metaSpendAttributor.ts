/**
 * Meta Spend Attributor
 *
 * Attributes Meta ad spend to products using multiple methods:
 * 1. Manual mappings (highest priority, from campaign_product_mappings table)
 * 2. Single-product stores (100% of spend to that product)
 * 3. Multi-product keyword scoring (match campaign names to product titles)
 * 4. Unattributed spend shown separately -- never silently distributed
 */

export interface CampaignSpendData {
  campaignId: string;
  campaignName: string;
  spend: number;
  adAccountId: string;
}

export interface ProductData {
  productId: string;
  productTitle: string;
}

export type AttributionMethod =
  | 'manual_mapping'
  | 'prism_attribution'
  | 'keyword_match'
  | 'single_product'
  | 'unattributed';

export interface PrismAttribution {
  campaignId: string;
  productId: string;
  confidence: number;
}

export interface SpendAttribution {
  campaignId: string;
  campaignName: string;
  productId: string | null;
  spend: number;
  confidence: number; // 0-1
  method: AttributionMethod;
}

export interface ManualMapping {
  campaignId: string;
  productId: string;
}

const KEYWORD_MATCH_MIN_SCORE = 0.3; // minimum score to prevent wrong matches

/**
 * Attribute Meta ad spend to products.
 *
 * Priority order (from V4.4):
 * 1. Manual mappings -- ALWAYS take priority
 * 2. Single-product stores: 100% of spend to that product
 * 3. Multi-product: keyword scoring against product titles
 * 4. Unmatched spend shown as "Unattributed Spend"
 *
 * Accepts pre-loaded manual mappings to avoid server-only DB imports.
 */
export function attributeSpend(
  campaigns: CampaignSpendData[],
  products: ProductData[],
  manualMappings: ManualMapping[] = [],
  prismAttributions: PrismAttribution[] = [],
): SpendAttribution[] {
  const manualMap = new Map<string, string>();
  for (const m of manualMappings) {
    manualMap.set(m.campaignId, m.productId);
  }

  const prismMap = new Map<string, PrismAttribution>();
  for (const p of prismAttributions) {
    prismMap.set(p.campaignId, p);
  }

  const results: SpendAttribution[] = [];

  for (const campaign of campaigns) {
    // Priority 1: Manual mapping
    if (manualMap.has(campaign.campaignId)) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: manualMap.get(campaign.campaignId)!,
        spend: campaign.spend,
        confidence: 1.0,
        method: 'manual_mapping',
      });
      continue;
    }

    // Priority 2: PRISM auto-attribution (pixel/creative/correlation)
    const prism = prismMap.get(campaign.campaignId);
    if (prism && prism.confidence >= 50) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: prism.productId,
        spend: campaign.spend,
        confidence: prism.confidence / 100,
        method: 'prism_attribution',
      });
      continue;
    }

    // Priority 3: Single-product store
    if (products.length === 1) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: products[0].productId,
        spend: campaign.spend,
        confidence: 0.95,
        method: 'single_product',
      });
      continue;
    }

    // Priority 4: Multi-product keyword matching
    const match = findBestKeywordMatch(campaign.campaignName, products);
    if (match && match.score >= KEYWORD_MATCH_MIN_SCORE) {
      results.push({
        campaignId: campaign.campaignId,
        campaignName: campaign.campaignName,
        productId: match.productId,
        spend: campaign.spend,
        confidence: match.score,
        method: 'keyword_match',
      });
      continue;
    }

    // Priority 5: Unattributed -- never silently distribute
    results.push({
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      productId: null,
      spend: campaign.spend,
      confidence: 0,
      method: 'unattributed',
    });
  }

  return results;
}

/**
 * Keyword-based matching: score campaign name against product titles.
 * Tokenizes both strings and computes overlap ratio.
 */
function findBestKeywordMatch(
  campaignName: string,
  products: ProductData[]
): { productId: string; score: number } | null {
  const campaignTokens = tokenize(campaignName);
  if (campaignTokens.length === 0) return null;

  let bestMatch: { productId: string; score: number } | null = null;

  for (const product of products) {
    const productTokens = tokenize(product.productTitle);
    if (productTokens.length === 0) continue;

    // Count how many product tokens appear in the campaign name
    let matchCount = 0;
    for (const token of productTokens) {
      if (campaignTokens.includes(token)) {
        matchCount++;
      }
    }

    const score = matchCount / productTokens.length;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { productId: product.productId, score };
    }
  }

  return bestMatch;
}

/**
 * Tokenize a string into lowercase words, filtering out common stop words
 * and short tokens that add noise to matching.
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'of', 'on', 'at',
    'by', 'with', 'from', 'up', 'out', 'is', 'it', 'as', 'be', 'was',
    'campaign', 'ad', 'ads', 'adset', 'test', 'v1', 'v2', 'v3',
    'broad', 'lookalike', 'retargeting', 'prospecting', 'cbo', 'abo',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
}
