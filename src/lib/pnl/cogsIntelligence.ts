import { rest } from '@/app/api/lib/supabase-persistence';

export interface CogsResult {
  amount: number;
  source: 'configured_fixed' | 'configured_percentage' | 'shopify_cost' | 'inferred_digital' | 'not_configured';
  confidence: number;
  warning?: string;
  setupLink?: string;
}

export interface CogsCompleteness {
  configuredCount: number;
  totalCount: number;
  completeness: number;
  unconfiguredProducts: Array<{ id: string; title: string; revenueShare: number }>;
  estimatedProfitImpact: number | null;
}

// Calculate COGS for a product — fully adaptive
export async function calculateCogs(
  storeId: string,
  productId: string,
  productTitle: string,
  quantity: number,
  lineRevenue: number
): Promise<CogsResult> {
  // Priority 1: Merchant-configured cost
  const costs = await rest<Array<{
    product_id: string;
    cost_per_unit: number;
    cost_type: string;
    source?: string;
  }>>(
    `/pnl_product_costs?store_id=eq.${encodeURIComponent(storeId)}&product_id=eq.${encodeURIComponent(productId)}&select=product_id,cost_per_unit,cost_type,source&limit=1`
  ).catch(() => []);

  const costConfig = costs[0];
  if (costConfig) {
    // Check source — Shopify inventory cost vs user-configured
    if (costConfig.source === 'shopify_cost') {
      return {
        amount: Math.round(costConfig.cost_per_unit * quantity * 100) / 100,
        source: 'shopify_cost',
        confidence: 0.9,
      };
    }
    if (costConfig.cost_type === 'fixed') {
      return {
        amount: Math.round(costConfig.cost_per_unit * quantity * 100) / 100,
        source: 'configured_fixed',
        confidence: 1.0,
      };
    }
    if (costConfig.cost_type === 'percentage') {
      return {
        amount: Math.round(lineRevenue * (costConfig.cost_per_unit / 100) * 100) / 100,
        source: 'configured_percentage',
        confidence: 1.0,
      };
    }
  }

  // Priority 2: Infer digital product from store's own data
  const digitalResult = await inferIsDigital(storeId, productId, productTitle);
  if (digitalResult.isDigital && digitalResult.confidence > 0.7) {
    return {
      amount: 0,
      source: 'inferred_digital',
      confidence: digitalResult.confidence,
      // No warning — $0 COGS is correct for digital
    };
  }

  // Priority 3: Not configured — $0 with warning
  return {
    amount: 0,
    source: 'not_configured',
    confidence: 0,
    warning: `COGS not set — profit for "${productTitle}" may be overstated`,
    setupLink: `/dashboard/settings/pnl?product=${encodeURIComponent(productId)}`,
  };
}

// Infer whether a product is digital from the store's own patterns
async function inferIsDigital(
  storeId: string,
  productId: string,
  productTitle: string
): Promise<{ isDigital: boolean; confidence: number; signals: string[] }> {
  const signals: string[] = [];
  let score = 0;
  let totalWeight = 0;

  // Signal 1: Check if similar products in this store have $0 cost configured
  const allCosts = await rest<Array<{
    product_id: string;
    cost_per_unit: number;
    product_title?: string;
  }>>(
    `/pnl_product_costs?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,cost_per_unit,product_title&limit=500`
  ).catch(() => []);

  const zeroCostProducts = allCosts.filter(c => c.cost_per_unit === 0);
  if (zeroCostProducts.length > 0 && allCosts.length > 0) {
    // Check title similarity with zero-cost products
    const titleLower = productTitle.toLowerCase();
    const hasMatchingPattern = zeroCostProducts.some(p => {
      const pTitle = (p.product_title || '').toLowerCase();
      // Find common words (3+ chars) between zero-cost products and this product
      const words = pTitle.split(/\s+/).filter(w => w.length >= 3);
      return words.some(w => titleLower.includes(w));
    });
    if (hasMatchingPattern) {
      score += 35;
      signals.push('Title matches patterns of other $0-cost products in store');
    }
  }
  totalWeight += 35;

  // Signal 2: Check fulfillment pattern — digital products have no shipping
  const orders = await rest<Array<{
    total_shipping_price: number;
    line_items: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&select=total_shipping_price,line_items&limit=100&order=created_at.desc`
  ).catch(() => []);

  let productOrdersWithShipping = 0;
  let productOrdersTotal = 0;
  for (const order of orders) {
    try {
      const parsedItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
      const items = Array.isArray(parsedItems)
        ? (parsedItems as Array<{ product_id?: string | number }>)
        : [];
      const hasProduct = items.some((item) => String(item.product_id) === productId);
      if (hasProduct) {
        productOrdersTotal++;
        if ((order.total_shipping_price || 0) > 0) productOrdersWithShipping++;
      }
    } catch { /* skip malformed */ }
  }

  if (productOrdersTotal >= 3 && productOrdersWithShipping === 0) {
    score += 30;
    signals.push(`No shipping in ${productOrdersTotal} orders — likely digital`);
  }
  totalWeight += 30;

  // Signal 3: Price = $0 means no physical cost
  // Check from product behaviors if available
  const behaviors = await rest<Array<{ total_revenue: number; total_orders: number }>>(
    `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&product_id=eq.${encodeURIComponent(productId)}&select=total_revenue,total_orders&limit=1`
  ).catch(() => []);

  if (behaviors[0] && behaviors[0].total_orders > 0) {
    const avgPrice = behaviors[0].total_revenue / behaviors[0].total_orders;
    if (avgPrice === 0) {
      score += 25;
      signals.push('Average price is $0 — no physical cost possible');
    }
  }
  totalWeight += 25;

  // Signal 4: Store-wide digital rate
  // If most products in this store are $0 cost → higher chance this one is too
  if (allCosts.length >= 5) {
    const digitalRate = zeroCostProducts.length / allCosts.length;
    if (digitalRate > 0.7) {
      score += 10;
      signals.push(`${Math.round(digitalRate * 100)}% of configured products are $0 cost`);
    }
  }
  totalWeight += 10;

  const confidence = totalWeight > 0 ? Math.round((score / totalWeight) * 100) / 100 : 0;
  return { isDigital: confidence > 0.6, confidence, signals };
}

// Revenue-weighted COGS completeness for a store
export async function getCogsCompleteness(storeId: string): Promise<CogsCompleteness> {
  // Get all products with their revenue from product_behaviors
  const products = await rest<Array<{
    product_id: string;
    product_title: string;
    total_revenue: number;
  }>>(
    `/product_behaviors?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,product_title,total_revenue&order=total_revenue.desc`
  ).catch(() => []);

  const costs = await rest<Array<{ product_id: string; cost_per_unit: number }>>(
    `/pnl_product_costs?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,cost_per_unit`
  ).catch(() => []);

  const configuredIds = new Set(costs.map(c => c.product_id));
  const totalRevenue = products.reduce((s, p) => s + (p.total_revenue || 0), 0);

  const unconfigured = products
    .filter(p => !configuredIds.has(p.product_id))
    .map(p => ({
      id: p.product_id,
      title: p.product_title || 'Unknown',
      revenueShare: totalRevenue > 0 ? p.total_revenue / totalRevenue : 0,
    }));

  // Estimate impact using average configured COGS rate
  const configuredWithCost = costs.filter(c => c.cost_per_unit > 0);
  const avgCogsRate = configuredWithCost.length > 0
    ? configuredWithCost.reduce((s, c) => s + c.cost_per_unit, 0) / configuredWithCost.length
    : null;

  const unconfiguredRevenue = unconfigured.reduce((s, p) => s + p.revenueShare * totalRevenue, 0);
  const estimatedImpact = avgCogsRate !== null ? Math.round(unconfiguredRevenue * avgCogsRate / 100) : null;

  return {
    configuredCount: configuredIds.size,
    totalCount: products.length,
    completeness: products.length > 0 ? configuredIds.size / products.length : 1,
    unconfiguredProducts: unconfigured.slice(0, 20), // Top 20 by revenue
    estimatedProfitImpact: estimatedImpact,
  };
}
