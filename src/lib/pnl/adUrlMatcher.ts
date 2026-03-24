/**
 * Extract Shopify product handle from a URL.
 * e.g. "https://mindingart.com/products/kids-life-skills" → "kids-life-skills"
 * e.g. "https://mindingart.com/products/kids-life-skills?variant=123" → "kids-life-skills"
 */
export function extractProductHandle(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  } catch {
    const match = url.match(/\/products\/([^/?#]+)/);
    return match ? match[1].toLowerCase() : null;
  }
}

/**
 * Match a product handle to a product_id using product names.
 * Handle "kids-life-skills" matches title "Kids Life Skills (FREE TODAY)"
 */
export function matchHandleToProduct(
  handle: string,
  products: Array<{ product_id: string; product_name: string }>
): string | null {
  if (!handle) return null;
  const handleWords = new Set(handle.split('-').filter(w => w.length > 2));
  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const p of products) {
    const titleWords = new Set(
      p.product_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
    );
    let overlap = 0;
    for (const w of handleWords) {
      if (titleWords.has(w)) overlap++;
    }
    const score = handleWords.size > 0 ? overlap / handleWords.size : 0;
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = p.product_id;
    }
  }
  return bestMatch;
}

/**
 * Build a map of ad_id → product_id from destination URLs.
 */
export function buildUrlAttributionMap(
  spendRows: Array<{ ad_id: string; destination_url?: string | null }>,
  products: Array<{ product_id: string; product_name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of spendRows) {
    if (!row.destination_url) continue;
    const handle = extractProductHandle(row.destination_url);
    if (!handle) continue;
    const productId = matchHandleToProduct(handle, products);
    if (productId) {
      map.set(row.ad_id, productId);
    }
  }
  return map;
}
