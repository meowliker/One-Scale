import { rest } from '@/app/api/lib/supabase-persistence';

export interface AdaptiveThresholds {
  lookbackDays: number;
  minOrderThreshold: number;
  topCompanionsLimit: number;
  clearMainRatio: number;
  clearUpsellRatio: number;
  minScoreForDecision: number;
}

// Compute lookback window from store's order velocity
export async function computeLookbackWindow(storeId: string): Promise<number> {
  const oldest = await rest<Array<{ created_at: string }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=created_at&order=created_at.asc&limit=1`
  ).catch(() => []);

  if (oldest.length === 0) return 30;

  const storeAgeDays = Math.max(1, (Date.now() - new Date(oldest[0].created_at).getTime()) / 86400000);

  // Count total orders and products
  const orderCount = await rest<Array<{ count: number }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=shopify_order_id&limit=1`,
    { headers: { 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' } }
  ).catch(() => []);

  const productCount = await rest<Array<{ product_id: string }>>(
    `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id`
  ).catch(() => []);

  const totalOrders = Array.isArray(orderCount) ? 1 : 100; // fallback
  const products = productCount.length || 1;
  const orderVelocity = totalOrders / Math.max(storeAgeDays, 1);

  // Need ~10 orders per product for statistical confidence
  const minOrdersNeeded = products * 10;
  const daysNeeded = orderVelocity > 0 ? Math.ceil(minOrdersNeeded / orderVelocity) : 30;

  const minWindow = Math.min(14, Math.floor(storeAgeDays));
  const maxWindow = Math.min(Math.floor(storeAgeDays), 365);

  return Math.min(maxWindow, Math.max(minWindow, daysNeeded));
}

// Compute min order threshold from store volume
export async function computeMinOrderThreshold(storeId: string): Promise<number> {
  const profile = await rest<Array<{ avg_items_per_order: number }>>(
    `/store_behavior_profiles?store_id=eq.${encodeURIComponent(storeId)}&select=avg_items_per_order&limit=1`
  ).catch(() => []);

  const products = await rest<Array<{ product_id: string; total_orders: number }>>(
    `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,total_orders`
  ).catch(() => []);

  if (products.length === 0) return 3;

  // Compute median order count across products
  const orderCounts = products.map(p => p.total_orders).sort((a, b) => a - b);
  const median = orderCounts[Math.floor(orderCounts.length / 2)] || 5;

  // Threshold = 5% of median, floored at 3, capped at 50
  const computed = Math.round(median * 0.05);
  return Math.min(50, Math.max(3, computed));
}

// Compute top companions limit from avg items per order
export async function computeTopCompanionsLimit(storeId: string): Promise<number> {
  const profile = await rest<Array<{ avg_items_per_order: number }>>(
    `/store_behavior_profiles?store_id=eq.${encodeURIComponent(storeId)}&select=avg_items_per_order&limit=1`
  ).catch(() => []);

  const avgItems = profile[0]?.avg_items_per_order || 2;
  const computed = Math.round(avgItems * 0.8);

  const products = await rest<Array<{ product_id: string }>>(
    `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id`
  ).catch(() => []);

  return Math.min(Math.max(products.length - 1, 1), Math.max(2, computed));
}

// Get classification thresholds -- learned from merchant corrections
export async function getClassificationThresholds(storeId: string): Promise<{
  clearMainRatio: number;
  clearUpsellRatio: number;
  minScoreForDecision: number;
}> {
  // Check for platform-wide learned thresholds
  const platform = await rest<Array<{ key: string; value: string }>>(
    `/platform_settings?key=eq.classification_thresholds&select=key,value&limit=1`
  ).catch(() => []);

  if (platform[0]?.value) {
    try {
      return JSON.parse(platform[0].value);
    } catch { /* fall through */ }
  }

  // Check store-specific corrections to tune thresholds
  const corrections = await rest<Array<{
    from_classification: string;
    to_classification: string;
    signals_at_correction: string;
  }>>(
    `/classification_corrections?store_id=eq.${encodeURIComponent(storeId)}&select=from_classification,to_classification,signals_at_correction&limit=100`
  ).catch(() => []);

  if (corrections.length < 5) {
    // Not enough data -- use sensible defaults
    return { clearMainRatio: 1.5, clearUpsellRatio: 1.5, minScoreForDecision: 30 };
  }

  // If many corrections went main->upsell, increase the main ratio requirement
  const mainToUpsell = corrections.filter(c => c.from_classification === 'main' && c.to_classification === 'upsell').length;
  const upsellToMain = corrections.filter(c => c.from_classification === 'upsell' && c.to_classification === 'main').length;

  let clearMainRatio = 1.5;
  let clearUpsellRatio = 1.5;

  if (mainToUpsell > corrections.length * 0.3) clearMainRatio = 1.8; // Stricter main threshold
  if (upsellToMain > corrections.length * 0.3) clearUpsellRatio = 1.8; // Stricter upsell threshold

  return { clearMainRatio, clearUpsellRatio, minScoreForDecision: 30 };
}

// Compute all adaptive thresholds at once
export async function computeAllThresholds(storeId: string): Promise<AdaptiveThresholds> {
  const [lookbackDays, minOrderThreshold, topCompanionsLimit, classThresholds] = await Promise.all([
    computeLookbackWindow(storeId),
    computeMinOrderThreshold(storeId),
    computeTopCompanionsLimit(storeId),
    getClassificationThresholds(storeId),
  ]);

  return {
    lookbackDays,
    minOrderThreshold,
    topCompanionsLimit,
    ...classThresholds,
  };
}

// Record a merchant correction for platform learning
export async function recordMerchantCorrection(
  storeId: string,
  productId: string,
  fromClassification: string,
  toClassification: string,
  signals: Record<string, unknown>
): Promise<void> {
  await rest('/classification_corrections', {
    method: 'POST',
    body: JSON.stringify({
      store_id: storeId,
      product_id: productId,
      from_classification: fromClassification,
      to_classification: toClassification,
      signals_at_correction: JSON.stringify(signals),
      corrected_at: new Date().toISOString(),
    }),
  }).catch(() => null);
}
