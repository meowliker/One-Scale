/**
 * URL Matching Utility for Product-to-Meta Campaign Mapping
 * Strictly matches Shopify product handles to Meta ad landing URLs.
 */

export interface ShopifyProductUrl {
  productId: string;
  productName: string;
  url: string;
  handle: string; // e.g., "kids-life-skills" from /products/kids-life-skills
}

export interface MetaAdUrl {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  adId: string;
  adName: string;
  url: string;
}

export interface ProductMatch {
  productId: string;
  productName: string;
  shopifyUrl: string;
  matchedCampaignId: string;
  matchedCampaignName: string;
  matchedAdAccountId: string;
  matchedAdId: string;
  matchedAdUrl: string;
  matchReason: 'exact_handle_path' | 'contains_handle';
  matchScore: number; // 0-100
}

/**
 * Normalize a URL for comparison
 * - Remove protocol (http/https)
 * - Remove www
 * - Remove trailing slashes
 * - Remove query parameters and fragments
 * - Convert to lowercase
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  
  const normalized = url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\?.*$/, '') // Remove query params
    .replace(/#.*$/, '') // Remove fragments
    .replace(/\/+$/, ''); // Remove trailing slashes
  
  return normalized;
}

/**
 * Extract the product handle/slug from a Shopify URL
 * e.g., "https://mindingart.com/products/kids-life-skills" -> "kids-life-skills"
 */
export function extractProductHandle(url: string): string | null {
  const normalized = normalizeUrl(url);
  
  // Match /products/[handle] pattern
  const match = normalized.match(/\/products\/([^\/\?#]+)/);
  if (match) {
    return match[1];
  }
  
  // Try to extract from path if no /products/ prefix
  const pathMatch = normalized.match(/\/([^\/\?#]+)$/);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  return null;
}

export function normalizeHandle(handle: string): string {
  return handle
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Calculate strict-handle similarity score between product handle and ad URL.
 * Returns a score in [0, 100]. Non-handle matches are always 0.
 */
export function calculateUrlSimilarity(shopifyUrl: string, adUrl: string): number {
  const handle = extractProductHandle(shopifyUrl);
  if (!handle) return 0;
  return scoreHandleAgainstUrl(handle, adUrl).score;
}

function scoreHandleAgainstUrl(
  handle: string,
  adUrl: string
): { score: number; reason: ProductMatch['matchReason'] | null } {
  const normalizedHandle = normalizeHandle(handle);
  if (!normalizedHandle) return { score: 0, reason: null };

  const normalizedAd = normalizeUrl(adUrl);
  if (!normalizedAd) return { score: 0, reason: null };

  const exactPath = new RegExp(`/products/${escapeRegExp(normalizedHandle)}$`);
  if (exactPath.test(normalizedAd)) {
    return { score: 100, reason: 'exact_handle_path' };
  }

  return { score: 0, reason: null };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match Shopify products to Meta ad URLs
 * Returns the best match for each product (if any)
 */
export function matchProductsToAds(
  shopifyProducts: ShopifyProductUrl[],
  metaAdUrls: MetaAdUrl[],
  minMatchScore: number = 70
): Map<string, ProductMatch> {
  const matches = new Map<string, ProductMatch>();
  
  for (const product of shopifyProducts) {
    let bestMatch: ProductMatch | null = null;
    let bestScore = 0;
    
    const handle = normalizeHandle(product.handle || extractProductHandle(product.url) || '');
    if (!handle) continue;

    for (const ad of metaAdUrls) {
      const scored = scoreHandleAgainstUrl(handle, ad.url);
      const score = scored.score;
      if (score >= minMatchScore && score > bestScore) {
        bestScore = score;
        bestMatch = {
          productId: product.productId,
          productName: product.productName,
          shopifyUrl: product.url,
          matchedCampaignId: ad.campaignId,
          matchedCampaignName: ad.campaignName,
          matchedAdAccountId: ad.adAccountId,
          matchedAdId: ad.adId,
          matchedAdUrl: ad.url,
          matchReason: scored.reason || 'contains_handle',
          matchScore: score,
        };
      }
    }
    
    if (bestMatch) {
      matches.set(product.productId, bestMatch);
    }
  }
  
  return matches;
}

/**
 * Extract all unique ad URLs from cached Meta ads data
 */
export function extractAdUrlsFromSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adsData: any[],
  adAccountId: string
): MetaAdUrl[] {
  const results: MetaAdUrl[] = [];
  
  for (const ad of adsData) {
    if (!ad) continue;
    
    // Try to extract URL from various locations in the ad object
    const creative = ad.creative || {};
    const url = 
      creative.destinationUrl ||
      creative.object_url ||
      creative.link_url ||
      creative.object_story_spec?.link_data?.link ||
      creative.object_story_spec?.video_data?.call_to_action?.value?.link ||
      null;
    
    const rowAdAccountId = ad.ad_account_id || ad.account_id || ad.adAccountId || adAccountId;
    if (url && typeof url === 'string') {
      results.push({
        campaignId: ad.campaign_id || ad.campaignId || '',
        campaignName: ad.campaign_name || ad.campaignName || '',
        adAccountId: rowAdAccountId || '',
        adId: ad.id || '',
        adName: ad.name || '',
        url: url,
      });
    }
  }
  
  return results;
}

/**
 * Build Shopify product URL from store domain and product data
 */
export function buildShopifyProductUrl(
  storeDomain: string,
  productHandle: string
): string {
  const cleanDomain = storeDomain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  
  return `https://${cleanDomain}/products/${productHandle}`;
}
