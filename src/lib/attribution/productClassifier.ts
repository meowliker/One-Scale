/**
 * Product Classification Logic
 *
 * Classifies products as main/upsell/downsell/addon using multiple detection
 * methods. Manual overrides from the product_classifications table are permanent
 * and never overwritten by auto-detection.
 *
 * From V4.4 script logic:
 * - $0 price items = MAIN product
 * - price > $0 = UPSELL
 * - If product appears as first line item in 70%+ of orders -> MAIN regardless of price
 * - Subscription products (requires_selling_plan = true) -> always MAIN
 * - Manual overrides are permanent
 */

import type { ProductCategory } from '@/types/productPnl';

export type ProductClassification = ProductCategory;
export type DetectionMethod = 'price_based' | 'frequency_based' | 'subscription' | 'manual' | 'signal_stack' | 'store_type_rule' | 'edge_case';

export interface ClassificationResult {
  productId: string;
  productTitle: string;
  classification: ProductClassification;
  detectionMethod: DetectionMethod;
  manualOverride: boolean;
}

export interface OrderLineData {
  orderId: string;
  lineItems: Array<{
    productId: string;
    productTitle: string;
    price: number;
    quantity: number;
    position: number; // 0-based position in order
    requiresSellingPlan?: boolean;
  }>;
}

const FIRST_LINE_ITEM_THRESHOLD = 0.7; // 70% threshold for frequency-based detection

/**
 * Classify products based on order line item data.
 * Accepts pre-loaded manual overrides to avoid server-only DB imports.
 */
export function classifyProducts(
  orders: OrderLineData[],
  existingOverrides: ClassificationResult[] = []
): ClassificationResult[] {
  const manualOverrides = new Map<string, ClassificationResult>();
  for (const s of existingOverrides) {
    if (s.manualOverride) {
      manualOverrides.set(s.productId, s);
    }
  }

  // Gather all unique products from orders
  const productMap = new Map<
    string,
    { title: string; prices: number[]; firstItemCount: number; totalOrders: number; isSubscription: boolean }
  >();

  for (const order of orders) {
    const sorted = [...order.lineItems].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const existing = productMap.get(item.productId) || {
        title: item.productTitle,
        prices: [],
        firstItemCount: 0,
        totalOrders: 0,
        isSubscription: false,
      };
      existing.prices.push(item.price);
      existing.totalOrders++;
      if (i === 0) existing.firstItemCount++;
      if (item.requiresSellingPlan) existing.isSubscription = true;
      productMap.set(item.productId, existing);
    }
  }

  const totalOrders = orders.length;
  const results: ClassificationResult[] = [];

  for (const [productId, data] of productMap) {
    // Manual override takes absolute priority
    if (manualOverrides.has(productId)) {
      results.push(manualOverrides.get(productId)!);
      continue;
    }

    let classification: ProductClassification;
    let detectionMethod: DetectionMethod;

    // Subscription products are always MAIN
    if (data.isSubscription) {
      classification = 'main';
      detectionMethod = 'subscription';
    }
    // Frequency-based: appears as first line item in 70%+ of orders
    else if (totalOrders > 0 && data.firstItemCount / totalOrders >= FIRST_LINE_ITEM_THRESHOLD) {
      classification = 'main';
      detectionMethod = 'frequency_based';
    }
    // Price-based: $0 items are MAIN, priced items are UPSELL
    else {
      const avgPrice = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
      classification = avgPrice === 0 ? 'main' : 'upsell';
      detectionMethod = 'price_based';
    }

    results.push({
      productId,
      productTitle: data.title,
      classification,
      detectionMethod,
      manualOverride: false,
    });
  }

  return results;
}

/**
 * Get stored classifications from the DB via API (for client-side use).
 */
export async function getStoredClassifications(
  storeId: string
): Promise<ClassificationResult[]> {
  try {
    const res = await fetch(
      `/api/pnl/product-classifications?storeId=${encodeURIComponent(storeId)}`
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}
