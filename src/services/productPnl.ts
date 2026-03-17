import { mockProductPnL } from '@/data/mockProductPnL';
import type { ProductPnLData, ProductFBMetrics, ProductCategory } from '@/types/productPnl';
import type { ShopifyOrder, ShopifyProduct } from '@/types/shopify';
import type { PnLSettings } from '@/types/pnlSettings';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';
import { buildStoreScopedKey, memoizePromise } from '@/services/perfCache';
import { classifyProducts, getStoredClassifications } from '@/lib/attribution/productClassifier';
import type { OrderLineData } from '@/lib/attribution/productClassifier';
import { attributeSpend } from '@/lib/attribution/metaSpendAttributor';
import type { CampaignSpendData, ProductData } from '@/lib/attribution/metaSpendAttributor';

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

/**
 * Simple inline fallback classifier used when the library-based classification
 * from productClassifier is not available (e.g., no storeId or no order line data).
 * The library classifier (classifyProducts) is preferred — it supports manual overrides,
 * frequency-based detection, and subscription detection.
 */
function classifyLineItemFallback(
  linePrice: number,
  maxPriceInOrder: number,
  isSingleItemOrder: boolean,
): 'main' | 'upsell' | 'downsell' | 'addon' {
  // Single-item orders are always main products
  if (isSingleItemOrder) return 'main';
  if (linePrice === 0) return 'addon';
  // The highest-priced item in the order is the main product
  if (linePrice >= maxPriceInOrder) return 'main';
  // Items within 70% of the max price are likely also main (e.g. bundles, variants)
  if (linePrice >= maxPriceInOrder * 0.7) return 'main';
  // Items between 30-70% of max are upsells
  if (linePrice >= maxPriceInOrder * 0.3) return 'upsell';
  return 'downsell';
}

/**
 * Convert Shopify orders to the OrderLineData format expected by the productClassifier library.
 */
function toOrderLineData(orders: ShopifyOrder[]): OrderLineData[] {
  return orders.map(order => ({
    orderId: String(order.id),
    lineItems: order.lineItems.map((li, index) => ({
      productId: li.productId ? String(li.productId) : `unknown_${li.title}`,
      productTitle: li.title,
      price: parseFloat(li.price),
      quantity: li.quantity,
      position: index,
    })),
  }));
}

/**
 * Build a product classification map using the library classifier.
 * Falls back to empty map if classification fails (caller uses inline fallback).
 */
async function buildClassificationMap(
  storeId: string,
  orders: ShopifyOrder[],
): Promise<Map<string, ProductCategory>> {
  const map = new Map<string, ProductCategory>();

  // Priority 1: Stored classifications from adaptive intelligence system (via API to avoid server-only deps in client bundle)
  try {
    const res = await fetch(`/api/intelligence/classifications?storeId=${encodeURIComponent(storeId)}`);
    if (res.ok) {
      const json = await res.json();
      const stored = (json.classifications || json.data || []) as Array<{ product_id: string; classification: string; manual_override?: boolean }>;
      for (const s of stored) {
        if (s.classification && s.classification !== 'pending' && s.classification !== 'unknown') {
          map.set(s.product_id, s.classification as ProductCategory);
        }
      }
      if (map.size > 0) return map;
    }
  } catch { /* API not available, fall through */ }

  // Priority 2: Legacy library classification
  try {
    const orderLineData = toOrderLineData(orders);
    const overrides = await getStoredClassifications(storeId);
    const classifications = classifyProducts(orderLineData, overrides);
    for (const c of classifications) {
      map.set(c.productId, c.classification);
    }
  } catch (err) {
    console.warn('[ProductPnL] Library classification failed, will use inline fallback:', err instanceof Error ? err.message : err);
  }
  return map;
}

/**
 * Use the metaSpendAttributor library to attribute ad spend to individual products.
 * Returns a Map of productId -> attributed spend amount.
 */
function buildProductSpendMap(
  insights: { date: string; metrics: Record<string, number> }[],
  products: Array<{ productId: string; productTitle: string }>,
): Map<string, number> {
  const spendMap = new Map<string, number>();
  try {
    const totalSpend = insights.reduce((sum, day) => sum + (day.metrics.spend || 0), 0);
    if (totalSpend <= 0 || products.length === 0) return spendMap;

    const campaigns: CampaignSpendData[] = [{
      campaignId: 'aggregated',
      campaignName: 'All Campaigns',
      spend: totalSpend,
      adAccountId: 'default',
    }];

    const productData: ProductData[] = products.map(p => ({
      productId: p.productId,
      productTitle: p.productTitle,
    }));

    const attributions = attributeSpend(campaigns, productData);
    for (const attr of attributions) {
      if (attr.productId) {
        const existing = spendMap.get(attr.productId) || 0;
        spendMap.set(attr.productId, existing + attr.spend);
      }
    }
  } catch (err) {
    console.warn('[ProductPnL] Spend attribution failed, using account-level metrics:', err instanceof Error ? err.message : err);
  }
  return spendMap;
}

// ------ Real Implementation ------

/**
 * Fast path: fetch product performance from server-side DB cache.
 * Returns null if not available (falls back to live).
 */
async function fetchProductPnLFromCache(storeId: string): Promise<ProductPnLData[] | null> {
  try {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
    const to = now.toISOString().split('T')[0];
    const params = new URLSearchParams({ storeId, from, to });
    const res = await fetch(`/api/pnl/product-performance?${params}`);
    if (!res.ok) return null;
    const json = await res.json() as { ok?: boolean; data?: ProductPnLData[] };
    if (!json.ok || !json.data || json.data.length === 0) return null;
    console.log(`[ProductPnL] Using DB cache: ${json.data.length} products`);
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Live fallback: fetch from Shopify/Meta APIs directly (slow path).
 */
async function realGetProductPnLLive(): Promise<ProductPnLData[]> {
  // Get storeId for library-based classification and spend attribution
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;

  const orderParams: Record<string, string> = { limit: '250' };
  const productParams: Record<string, string> = {};
  if (storeId) { orderParams.storeId = storeId; productParams.storeId = storeId; }
  const [ordersRes, productsRes, insightsRes, pnlSettings] = await Promise.all([
    apiClient<{ data: ShopifyOrder[] }>('/api/shopify/orders', {
      params: orderParams,
    }),
    apiClient<{ data: ShopifyProduct[] }>('/api/shopify/products', {
      params: productParams,
    }),
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

  // Use library-based product classification when storeId is available.
  const libraryClassifications: Map<string, ProductCategory> = storeId
    ? await buildClassificationMap(storeId, orders)
    : new Map();

  if (libraryClassifications.size > 0) {
    console.log(`[ProductPnL] Library classified ${libraryClassifications.size} products`);
  }

  // Build per-product spend attribution
  const uniqueProducts = new Map<string, string>();
  for (const order of orders) {
    for (const li of order.lineItems) {
      const pid = li.productId ? String(li.productId) : `unknown_${li.title}`;
      if (!uniqueProducts.has(pid)) {
        const shopifyProduct = li.productId ? productMap.get(li.productId) : null;
        uniqueProducts.set(pid, shopifyProduct?.title || li.title);
      }
    }
  }

  const productSpendMap: Map<string, number> = buildProductSpendMap(
    insights,
    Array.from(uniqueProducts.entries()).map(([id, title]) => ({
      productId: id,
      productTitle: title,
    })),
  );

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
      categoryCounts: Record<ProductCategory, number>;
      multiItemCategoryCounts: Record<ProductCategory, number>;
    }
  >();

  let totalRevenue = 0;
  let totalOrders = 0;

  for (const order of orders) {
    totalOrders += 1;
    const orderTotal = parseFloat(order.totalPrice);
    totalRevenue += orderTotal;

    const orderShipping = parseFloat(order.totalShippingPrice || '0');
    const orderSubtotal = parseFloat(order.subtotalPrice) || 1;

    const maxPriceInOrder = Math.max(
      ...order.lineItems.map((li) => parseFloat(li.price)),
      0,
    );
    const isSingleItemOrder = order.lineItems.length === 1;

    for (const lineItem of order.lineItems) {
      const productId = lineItem.productId
        ? String(lineItem.productId)
        : `unknown_${lineItem.title}`;

      const lineRevenue = parseFloat(lineItem.price) * lineItem.quantity;
      const revenueRatio = lineRevenue / orderSubtotal;
      const lineShipping = round2(orderShipping * revenueRatio);

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
          // No COGS configured — show $0 instead of guessing (never hardcode 30%)
          lineCogs = 0;
        }
      }

      // Use fee_structures if available, otherwise $0 (never hardcode 3%)
      const lineFees = 0;

      const shopifyProduct = lineItem.productId
        ? productMap.get(lineItem.productId)
        : null;

      const lineCategory = libraryClassifications.get(productId)
        ?? classifyLineItemFallback(parseFloat(lineItem.price), maxPriceInOrder, isSingleItemOrder);

      const existing = productAgg.get(productId);
      if (existing) {
        existing.unitsSold += lineItem.quantity;
        existing.revenue += lineRevenue;
        existing.cogs += lineCogs;
        existing.shipping += lineShipping;
        existing.fees += lineFees;
        existing.categoryCounts[lineCategory] = (existing.categoryCounts[lineCategory] || 0) + 1;
        if (!isSingleItemOrder) {
          existing.multiItemCategoryCounts[lineCategory] = (existing.multiItemCategoryCounts[lineCategory] || 0) + 1;
        }
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
          categoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0, bundle: 0, excluded: 0, pending: 0, unknown: 0, [lineCategory]: 1 },
          multiItemCategoryCounts: isSingleItemOrder
            ? { main: 0, upsell: 0, downsell: 0, addon: 0, bundle: 0, excluded: 0, pending: 0, unknown: 0 }
            : { main: 0, upsell: 0, downsell: 0, addon: 0, bundle: 0, excluded: 0, pending: 0, unknown: 0, [lineCategory]: 1 },
        });
      }
    }
  }

  const fbMetrics = aggregateFBMetrics(insights, totalRevenue, totalOrders);

  const result: ProductPnLData[] = [];
  for (const [productId, agg] of productAgg.entries()) {
    const attributedSpend = productSpendMap.get(productId) ?? 0;

    const netProfit = round2(agg.revenue - agg.cogs - agg.shipping - agg.fees - attributedSpend);
    const margin = agg.revenue > 0 ? round2((netProfit / agg.revenue) * 100) : 0;

    // Determine product category using all available signals
    const tc = agg.categoryCounts;
    const mic = agg.multiItemCategoryCounts;
    const totalAppearances = (tc.main || 0) + (tc.upsell || 0) + (tc.addon || 0) + (tc.downsell || 0);
    const multiItemTotal = (mic.main || 0) + (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
    const singleItemCount = totalAppearances - multiItemTotal;

    let mostCommonCategory: ProductCategory;
    if (totalAppearances === 0) {
      mostCommonCategory = 'main';
    } else if (multiItemTotal === 0) {
      // Only appears in single-item orders — main product
      mostCommonCategory = 'main';
    } else {
      // Use multi-item signals, but require strong evidence to classify as upsell
      // A product must be upsell in >60% of multi-item orders to be classified as upsell
      const upsellRate = ((mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0)) / multiItemTotal;
      const mainRate = (mic.main || 0) / multiItemTotal;
      // If mostly main in single-item orders AND not overwhelmingly upsell in multi-item → main
      if (singleItemCount > multiItemTotal && mainRate >= 0.3) {
        mostCommonCategory = 'main';
      } else if (upsellRate > 0.6) {
        // Strong upsell signal
        if ((mic.addon || 0) > (mic.upsell || 0)) mostCommonCategory = 'addon';
        else if ((mic.downsell || 0) > (mic.upsell || 0)) mostCommonCategory = 'downsell';
        else mostCommonCategory = 'upsell';
      } else {
        mostCommonCategory = 'main';
      }
    }

    const productFbMetrics: ProductFBMetrics = attributedSpend > 0
      ? {
          ...fbMetrics,
          spend: round2(attributedSpend),
          roas: attributedSpend > 0 ? round2(agg.revenue / attributedSpend) : 0,
          costPerPurchase: agg.unitsSold > 0 ? round2(attributedSpend / agg.unitsSold) : 0,
        }
      : fbMetrics;

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
      fbMetrics: productFbMetrics,
      isAdvertised: attributedSpend > 0,
      adLandingPageUrl: null,
      adName: null,
      adSetName: null,
      campaignName: null,
      category: mostCommonCategory,
    });
  }

  result.sort((a, b) => b.revenue - a.revenue);
  return result;
}

async function realGetProductPnLUncached(): Promise<ProductPnLData[]> {
  // Fast path: try DB cache first (populated by crons, avoids live API calls)
  const { useStoreStore } = await import('@/stores/storeStore');
  const storeId = useStoreStore.getState().activeStoreId;

  if (storeId) {
    const cached = await fetchProductPnLFromCache(storeId);
    if (cached) return cached;
    console.log('[ProductPnL] DB cache empty, falling back to live API calls');
  }

  // Slow fallback: live Shopify + Meta API calls
  return realGetProductPnLLive();
}

async function realGetProductPnL(): Promise<ProductPnLData[]> {
  return realGetProductPnLUncached();
}

// ------ Export ------

export const getProductPnL = createServiceFn<ProductPnLData[]>(
  'shopify',
  mockGetProductPnL,
  realGetProductPnL,
);
