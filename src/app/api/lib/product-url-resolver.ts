import { extractProductHandle, normalizeHandle } from './url-matcher.ts';

export interface ResolverInputProduct {
  name: string;
  shopifyUrl?: string;
  landingUrl?: string;
  shopifyHandle?: string;
}

export interface ShopifyCatalogProduct {
  id: number;
  title: string;
  handle: string;
}

export interface ResolvedProductIdentity {
  shopifyUrl: string;
  handle: string;
  needsUrlReview: boolean;
  confidence: number;
  source: 'explicit' | 'catalog' | 'fallback';
}

export function normalizeProductText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugifyProductName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/--+/g, '-');
}

export function scoreProductNameSimilarity(lhs: string, rhs: string): number {
  const left = normalizeProductText(lhs);
  const right = normalizeProductText(rhs);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }

  const jaccard = overlap / (leftTokens.size + rightTokens.size - overlap);
  const containsBoost = right.includes(left) || left.includes(right) ? 0.15 : 0;
  return Math.min(1, jaccard + containsBoost);
}

export function findShopifyCandidateByTitle(
  productName: string,
  catalog: ShopifyCatalogProduct[],
  minConfidence = 0.85
): { handle: string; confidence: number } | null {
  let best: { handle: string; confidence: number } | null = null;

  for (const row of catalog) {
    const confidence = scoreProductNameSimilarity(productName, row.title);
    if (!best || confidence > best.confidence) {
      best = { handle: normalizeHandle(row.handle), confidence };
    }
  }

  if (!best || !best.handle) return null;
  if (best.confidence < minConfidence) return null;
  return best;
}

export function resolveProductIdentity(
  product: ResolverInputProduct,
  opts: {
    storeDomain: string;
    catalog: ShopifyCatalogProduct[];
    unsureThreshold?: number;
  }
): ResolvedProductIdentity {
  const storeDomain = opts.storeDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const explicitUrl = (product.shopifyUrl || product.landingUrl || '').trim();
  const explicitHandle = normalizeHandle(
    product.shopifyHandle || extractProductHandle(explicitUrl) || ''
  );

  if (explicitHandle) {
    return {
      shopifyUrl: explicitUrl || (storeDomain ? `https://${storeDomain}/products/${explicitHandle}` : ''),
      handle: explicitHandle,
      needsUrlReview: false,
      confidence: 1,
      source: 'explicit',
    };
  }

  const candidate = findShopifyCandidateByTitle(product.name, opts.catalog);
  if (candidate) {
    return {
      shopifyUrl: storeDomain ? `https://${storeDomain}/products/${candidate.handle}` : '',
      handle: candidate.handle,
      needsUrlReview: candidate.confidence < (opts.unsureThreshold ?? 0.9),
      confidence: candidate.confidence,
      source: 'catalog',
    };
  }

  return {
    shopifyUrl: '',
    handle: '',
    needsUrlReview: true,
    confidence: 0,
    source: 'fallback',
  };
}
