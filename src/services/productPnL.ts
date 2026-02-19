import { mockProductPnL } from '@/data/mockProductPnL';
import type { ProductPnLData, ProductFBMetrics } from '@/types/productPnL';
import type { ShopifyOrder, ShopifyProduct } from '@/types/shopify';
import type { PnLSettings } from '@/types/pnlSettings';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';
import { buildStoreScopedKey, memoizePromise } from '@/services/perfCache';

// ------ Mock Implementation ------

async function mockGetProductPnL(): Promise<ProductPnLData[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockProductPnL;
}

// ------ Helpers ------

/**
 * Fetch Meta insights directly using storeId only (no accountIds).
 * This lets the API fall back to DB-stored ad accounts, which are always correct.
 */
async function fetchInsightsDirectly(
  datePreset: string,
): Promise<{ data: { date: string; metrics: Record<string, number> }[] }> {
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;
  if (!storeId) return { data: [] };

  const res = await fetch(
    `/api/meta/insights?storeId=${encodeURIComponent(storeId)}&datePreset=${datePreset}`,
  );
  if (!res.ok) return { data: [] };
  return res.json();
}

/**
 * Fetch P&L settings from DB for COGS calculation.
 */
async function fetchPnLSettings(): Promise<PnLSettings | null> {
  try {
    const data = await apiClient<PnLSettings>('/api/settings/pnl');
    return data;
  } catch {
    return null;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Aggregate daily Meta insights into account-level FB metrics.
 */
function aggregateFBMetrics(
  insights: { date: string; metrics: Record<string, number> }[],
  totalRevenue: number,
  totalOrders: number,
): ProductFBMetrics {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let purchases = 0;
  let addToCarts = 0;

  for (const day of insights) {
    spend += day.metrics.spend || 0;
    impressions += day.metrics.impressions || 0;
    clicks += day.metrics.clicks || 0;
    purchases += day.metrics.purchases || 0;
    addToCarts += day.metrics.addToCart || day.metrics.add_to_cart || 0;
  }

  const cpc = clicks > 0 ? round2(spend / clicks) : 0;
  const cpm = impressions > 0 ? round2((spend / impressions) * 1000) : 0;
  const ctr = impressions > 0 ? round2((clicks / impressions) * 100) : 0;
  const roas = spend > 0 ? round2(totalRevenue / spend) : 0;
  const aov = totalOrders > 0 ? round2(totalRevenue / totalOrders) : 0;
  const atcRate = clicks > 0 ? round2((addToCarts / clicks) * 100) : 0;

  const reach = Math.round(impressions * 0.72);
  return {
    roas,
    cpc,
    cpm,
    ctr,
    aov,
    atcRate,
    spend: round2(spend),
    impressions,
    clicks,
    purchases,
    costPerPurchase: purchases > 0 ? round2(spend / purchases) : 0,
    frequency: reach > 0 ? round2(impressions / reach) : 0,
    reach,
  };
}

// ------ Real Implementation ------

async function realGetProductPnLUncached(): Promise<ProductPnLData[]> {
  const [ordersRes, productsRes, insightsRes, pnlSettings] = await Promise.all([
    apiClient<{ data: ShopifyOrder[] }>('/api/shopify/orders', {
      params: { limit: '250' },
    }),
    apiClient<{ data: ShopifyProduct[] }>('/api/shopify/products'),
    fetchInsightsDirectly('last_30d'),
    fetchPnLSettings(),
  ]);

  const orders = ordersRes.data;
  const products = productsRes.data;
  const insights = insightsRes.data;

  // Build product lookup by ID for images and metadata
  const productMap = new Map<
    number,
    { title: string; image: string | null; handle: string }
  >();
  for (const product of products) {
    productMap.set(product.id, {
      title: product.title,
      image: product.images.length > 0 ? product.images[0].src : null,
      handle: product.title.toLowerCase().replace(/\s+/g, '-'),
    });
  }

  // Group order line items by productId
  const productAgg = new Map<
    string,
    {
      productName: string;
      sku: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      shipping: number;
      fees: number;
      productImage: string | null;
      shopifyUrl: string | null;
    }
  >();

  let totalRevenue = 0;
  let totalOrders = 0;

  for (const order of orders) {
    totalOrders += 1;
    const orderTotal = parseFloat(order.totalPrice);
    totalRevenue += orderTotal;

    // Distribute shipping proportionally across line items
    const orderShipping = parseFloat(order.totalShippingPrice || '0');
    const orderSubtotal = parseFloat(order.subtotalPrice) || 1; // avoid div-by-zero

    for (const lineItem of order.lineItems) {
      const productId = lineItem.productId
        ? String(lineItem.productId)
        : `unknown_${lineItem.title}`;

      const lineRevenue = parseFloat(lineItem.price) * lineItem.quantity;
      const revenueRatio = lineRevenue / orderSubtotal;
      const lineShipping = round2(orderShipping * revenueRatio);

      // COGS: use PnL settings product costs if available, else 30% default
      let lineCogs: number;
      const isDigital = pnlSettings?.productType === 'digital';
      if (isDigital) {
        lineCogs = 0;
      } else {
        const productCost = pnlSettings?.productCosts?.find(
          (pc) => pc.productId === productId,
        );
        if (productCost) {
          lineCogs =
            productCost.costType === 'fixed'
              ? productCost.costPerUnit * lineItem.quantity
              : round2(lineRevenue * (productCost.costPerUnit / 100));
        } else {
          lineCogs = round2(lineRevenue * 0.3);
        }
      }

      // Payment processing fees: ~3% default
      const lineFees = round2(lineRevenue * 0.03);

      // Look up product metadata
      const shopifyProduct = lineItem.productId
        ? productMap.get(lineItem.productId)
        : null;

      const existing = productAgg.get(productId);
      if (existing) {
        existing.unitsSold += lineItem.quantity;
        existing.revenue += lineRevenue;
        existing.cogs += lineCogs;
        existing.shipping += lineShipping;
        existing.fees += lineFees;
      } else {
        productAgg.set(productId, {
          productName: shopifyProduct?.title || lineItem.title,
          sku: lineItem.sku || '',
          unitsSold: lineItem.quantity,
          revenue: lineRevenue,
          cogs: lineCogs,
          shipping: lineShipping,
          fees: lineFees,
          productImage: shopifyProduct?.image || null,
          shopifyUrl: lineItem.productId
            ? `/admin/products/${lineItem.productId}`
            : null,
        });
      }
    }
  }

  // Compute account-level FB metrics from insights
  const fbMetrics = aggregateFBMetrics(insights, totalRevenue, totalOrders);

  // Build final ProductPnLData array
  const result: ProductPnLData[] = [];
  for (const [productId, agg] of productAgg.entries()) {
    const netProfit = round2(agg.revenue - agg.cogs - agg.shipping - agg.fees);
    const margin = agg.revenue > 0 ? round2((netProfit / agg.revenue) * 100) : 0;

    result.push({
      productId,
      productName: agg.productName,
      productImage: agg.productImage,
      shopifyUrl: agg.shopifyUrl,
      sku: agg.sku,
      unitsSold: agg.unitsSold,
      revenue: round2(agg.revenue),
      cogs: round2(agg.cogs),
      shipping: round2(agg.shipping),
      fees: round2(agg.fees),
      netProfit,
      margin,
      fbMetrics,
      // Ad mapping - populated when we can match products to ad landing pages
      isAdvertised: false,
      adLandingPageUrl: null,
      adName: null,
      adSetName: null,
      campaignName: null,
    });
  }

  // Sort by revenue descending by default
  result.sort((a, b) => b.revenue - a.revenue);

  return result;
}

async function realGetProductPnL(): Promise<ProductPnLData[]> {
  const key = buildStoreScopedKey('product-pnl:data');
  return memoizePromise(key, 60_000, realGetProductPnLUncached);
}

// ------ Export ------

export const getProductPnL = createServiceFn<ProductPnLData[]>(
  'shopify',
  mockGetProductPnL,
  realGetProductPnL,
);
