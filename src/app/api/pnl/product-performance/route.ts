import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  getPersistentProductCosts,
  getPersistentPaymentFees,
} from '@/app/api/lib/supabase-persistence';
import {
  attributeSpend,
  type CampaignSpendData,
  type ProductData,
  type ManualMapping,
} from '@/lib/attribution/metaSpendAttributor';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pnl/product-performance?storeId=xxx&from=2026-03-01&to=2026-03-13
 *
 * Reads from shopify_orders_cache + meta_spend_cache (populated by crons)
 * instead of making live Shopify/Meta API calls. Much faster.
 */

interface OrderCacheRow {
  shopify_order_id: string;
  total_price: number;
  subtotal_price: number;
  financial_status: string;
  order_status: string;
  line_items: string; // JSON string
  refund_total: number;
  created_at: string;
  total_shipping_price: number;
}

interface SpendCacheRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchase_value: number;
  campaign_id: string;
  campaign_name: string;
}

interface CampaignProductMapping {
  campaign_id: string;
  product_id: string;
}

interface ProductAgg {
  productName: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  shipping: number;
  categoryCounts: Record<string, number>;
  multiItemCategoryCounts: Record<string, number>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Default: last 30 days
  const now = new Date();
  const from = dateFrom || new Date(now.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const to = dateTo || now.toISOString().split('T')[0];

  try {
    // Fetch orders + spend + COGS + payment fees + campaign mappings from DB in parallel
    const [orders, spendRows, storedCosts, paymentFees, campaignMappings, storedClassifications] = await Promise.all([
      rest<OrderCacheRow[]>(
        `/shopify_orders_cache?store_id=eq.${encodeURIComponent(storeId)}&created_at=gte.${from}T00:00:00&created_at=lte.${to}T23:59:59&order_status=neq.cancelled&select=shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items,refund_total,created_at,total_shipping_price`
      ),
      rest<SpendCacheRow[]>(
        `/meta_spend_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${from}&date=lte.${to}&select=date,spend,impressions,clicks,purchases,purchase_value,campaign_id,campaign_name`
      ),
      getPersistentProductCosts(storeId).catch(() => []),
      getPersistentPaymentFees(storeId).catch(() => []),
      rest<CampaignProductMapping[]>(
        `/campaign_product_mappings?store_id=eq.${encodeURIComponent(storeId)}&select=campaign_id,product_id`
      ).catch(() => [] as CampaignProductMapping[]),
      rest<Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string }>>(
        `/product_classifications?store_id=eq.${encodeURIComponent(storeId)}&select=product_id,classification,manual_override,confidence,classification_method,signals_used,needs_review,last_analyzed`
      ).catch(() => [] as Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string }>),
    ]);

    // Build stored classification lookup (from adaptive intelligence system)
    const classificationMap = new Map<string, { classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string }>();
    for (const sc of storedClassifications) {
      classificationMap.set(sc.product_id, sc);
    }

    // Build COGS lookup
    const cogsMap = new Map<string, { costPerUnit: number; costType: string }>();
    for (const c of storedCosts) {
      cogsMap.set(c.product_id, {
        costPerUnit: c.cost_per_unit,
        costType: c.cost_type,
      });
    }

    // Compute payment fee rate: auto-detected fee_structures → configured gateways → $0 (never hardcode 3%)
    let feeStructures: Array<{ effective_rate: number; fixed_fee: number }> = [];
    try {
      feeStructures = await rest<typeof feeStructures>(
        `/fee_structures?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.true&select=effective_rate,fixed_fee`
      );
    } catch { /* table might not exist yet */ }

    const activeGateways = (paymentFees ?? []).filter((f) => f.is_active);
    let feePercentage = 0;
    let feeFixed = 0;

    if (feeStructures.length > 0) {
      // Use auto-detected rates (most accurate)
      feePercentage = (feeStructures.reduce((s, f) => s + f.effective_rate, 0) / feeStructures.length) * 100;
      feeFixed = feeStructures.reduce((s, f) => s + f.fixed_fee, 0) / feeStructures.length;
    } else if (activeGateways.length > 0) {
      // Fall back to user-configured rates
      feePercentage = activeGateways.reduce((s, f) => s + f.fee_percentage, 0) / activeGateways.length;
      feeFixed = activeGateways.reduce((s, f) => s + f.fee_fixed, 0) / activeGateways.length;
    }

    // Aggregate Meta spend totals and build per-campaign spend data
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    const campaignAgg = new Map<string, { campaignName: string; spend: number }>();

    for (const row of spendRows ?? []) {
      totalSpend += row.spend || 0;
      totalImpressions += row.impressions || 0;
      totalClicks += row.clicks || 0;
      totalPurchases += row.purchases || 0;

      if (row.campaign_id) {
        const existing = campaignAgg.get(row.campaign_id);
        if (existing) {
          existing.spend += row.spend || 0;
        } else {
          campaignAgg.set(row.campaign_id, {
            campaignName: row.campaign_name || row.campaign_id,
            spend: row.spend || 0,
          });
        }
      }
    }

    // Aggregate orders per product
    const productAgg = new Map<string, ProductAgg>();
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of orders ?? []) {
      if (order.financial_status === 'refunded') continue;

      totalOrders++;
      // NOTE: Do NOT accumulate totalRevenue from total_price here.
      // Use line-item revenue sum (≈ subtotal_price) as denominator for proportional
      // calculations, not total_price which includes tax and shipping.

      let lineItems: Array<{
        product_id?: number | string;
        title?: string;
        sku?: string;
        price?: string;
        quantity?: number;
      }>;
      try {
        lineItems = typeof order.line_items === 'string'
          ? JSON.parse(order.line_items)
          : order.line_items || [];
      } catch {
        continue;
      }

      // Find the single highest-priced product ID in this order for classification
      let maxPrice = 0;
      let maxPriceProductId = '';
      let orderLineItemRevenueSum = 0;
      for (const item of lineItems) {
        const price = parseFloat(item.price || '0');
        const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
        if (price > maxPrice) { maxPrice = price; maxPriceProductId = pid; }
        orderLineItemRevenueSum += price * (item.quantity || 1);
      }
      const isSingleItemOrder = lineItems.length === 1;

      // Per-order shipping distributed proportionally by revenue share
      const orderShipping = order.total_shipping_price || 0;

      for (const item of lineItems) {
        const productId = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
        const price = parseFloat(item.price || '0');
        const quantity = item.quantity || 1;
        const lineRevenue = price * quantity;
        totalRevenue += lineRevenue;

        // Distribute shipping proportionally across line items
        const lineRevenueShare = orderLineItemRevenueSum > 0 ? lineRevenue / orderLineItemRevenueSum : 0;
        const lineShipping = round2(orderShipping * lineRevenueShare);

        // Classify: only the highest-priced product is 'main', rest are upsell/addon
        let category = 'main';
        if (isSingleItemOrder) {
          category = 'main'; // single-item orders are always main
        } else if (price === 0) {
          category = 'addon';
        } else if (productId === maxPriceProductId) {
          category = 'main'; // highest-priced item in multi-item order
        } else {
          category = 'upsell'; // everything else in multi-item order
        }

        const existing = productAgg.get(productId);
        if (existing) {
          existing.unitsSold += quantity;
          existing.revenue += lineRevenue;
          existing.shipping += lineShipping;
          existing.orderCount++;
          existing.categoryCounts[category] = (existing.categoryCounts[category] || 0) + 1;
          if (!isSingleItemOrder) {
            existing.multiItemCategoryCounts[category] = (existing.multiItemCategoryCounts[category] || 0) + 1;
          }
        } else {
          productAgg.set(productId, {
            productName: item.title || 'Unknown',
            sku: item.sku || '',
            unitsSold: quantity,
            revenue: lineRevenue,
            shipping: lineShipping,
            orderCount: 1,
            categoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0, [category]: 1 },
            multiItemCategoryCounts: isSingleItemOrder
              ? { main: 0, upsell: 0, downsell: 0, addon: 0 }
              : { main: 0, upsell: 0, downsell: 0, addon: 0, [category]: 1 },
          });
        }
      }
    }

    // --- GAP 3: Use attributeSpend for per-product ad spend ---
    const campaignSpendData: CampaignSpendData[] = [];
    for (const [campaignId, agg2] of campaignAgg.entries()) {
      campaignSpendData.push({
        campaignId,
        campaignName: agg2.campaignName,
        spend: agg2.spend,
        adAccountId: '',
      });
    }
    const productDataForAttribution: ProductData[] = [];
    for (const [pid, agg2] of productAgg.entries()) {
      productDataForAttribution.push({ productId: pid, productTitle: agg2.productName });
    }
    const manualMappings: ManualMapping[] = (campaignMappings ?? []).map((m) => ({
      campaignId: m.campaign_id,
      productId: m.product_id,
    }));

    const attributions = attributeSpend(campaignSpendData, productDataForAttribution, manualMappings);

    // Build productId -> attributed spend map
    const productSpendMap = new Map<string, number>();
    let unattributedSpend = 0;
    for (const attr of attributions) {
      if (attr.productId) {
        productSpendMap.set(attr.productId, (productSpendMap.get(attr.productId) || 0) + attr.spend);
      } else {
        unattributedSpend += attr.spend;
      }
    }

    // Build response
    const products = [];
    for (const [productId, agg] of productAgg.entries()) {
      // COGS — never use silent fallback. $0 if not configured + warning via universal calculator.
      const costData = cogsMap.get(productId);
      let cogs = 0;
      if (costData) {
        cogs = costData.costType === 'fixed'
          ? costData.costPerUnit * agg.unitsSold
          : round2(agg.revenue * (costData.costPerUnit / 100));
      }

      // GAP 3: Use attributed spend instead of proportional distribution
      const adSpend = round2(productSpendMap.get(productId) || 0);
      const revenueShare = totalRevenue > 0 ? agg.revenue / totalRevenue : 0;

      // GAP 1: Use configured payment fee rate instead of hardcoded 3%
      const fees = round2((agg.revenue * feePercentage / 100) + (feeFixed * agg.orderCount));

      // GAP 4: Use actual shipping from orders
      const shipping = round2(agg.shipping);

      const netProfit = round2(agg.revenue - cogs - adSpend - fees - shipping);
      const margin = agg.revenue > 0 ? round2((netProfit / agg.revenue) * 100) : 0;

      // Use stored classification from adaptive intelligence if available
      const storedClassObj = classificationMap.get(productId);
      const storedClass = storedClassObj?.classification;
      let mostCommonCategory: string;
      if (storedClass && storedClass !== 'pending' && storedClass !== 'unknown') {
        mostCommonCategory = storedClass;
      } else {
        // Fallback: use multi-item order signals (single-item orders always say 'main', which is noise)
        const mic = agg.multiItemCategoryCounts;
        const multiItemTotal = (mic.main || 0) + (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
        if (multiItemTotal > 0) {
          if ((mic.upsell || 0) > (mic.main || 0)) {
            mostCommonCategory = 'upsell';
          } else if ((mic.addon || 0) > (mic.main || 0)) {
            mostCommonCategory = 'addon';
          } else if ((mic.downsell || 0) > (mic.main || 0)) {
            mostCommonCategory = 'downsell';
          } else {
            mostCommonCategory = 'main';
          }
        } else {
          mostCommonCategory = 'main';
        }
      }

      // Per-product FB metrics
      const roas = adSpend > 0 ? round2(agg.revenue / adSpend) : 0;
      const cpc = totalClicks > 0 ? round2(totalSpend / totalClicks) : 0;
      const cpm = totalImpressions > 0 ? round2((totalSpend / totalImpressions) * 1000) : 0;
      const ctr = totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : 0;
      const aov = totalOrders > 0 ? round2(totalRevenue / totalOrders) : 0;

      products.push({
        productId,
        productName: agg.productName,
        productImage: null,
        shopifyUrl: productId.startsWith('unknown_') ? null : `/admin/products/${productId}`,
        sku: agg.sku,
        unitsSold: agg.unitsSold,
        revenue: round2(agg.revenue),
        cogs,
        shipping,
        fees,
        netProfit,
        margin,
        fbMetrics: {
          roas,
          cpc,
          cpm,
          ctr,
          aov,
          atcRate: 0,
          spend: adSpend,
          impressions: Math.round(totalImpressions * revenueShare),
          clicks: Math.round(totalClicks * revenueShare),
          purchases: Math.round(totalPurchases * revenueShare),
          costPerPurchase: totalPurchases > 0 ? round2(totalSpend / totalPurchases) : 0,
          frequency: 0,
          reach: 0,
        },
        isAdvertised: adSpend > 0,
        adLandingPageUrl: null,
        adName: null,
        adSetName: null,
        campaignName: null,
        category: mostCommonCategory,
        classificationConfidence: storedClassObj?.confidence ?? 0,
        classificationMethod: storedClassObj?.classification_method ?? '',
        classificationSignals: storedClassObj?.signals_used ?? null,
        needsReview: storedClassObj?.needs_review ?? false,
        manualOverride: storedClassObj?.manual_override ?? false,
        lastAnalyzed: storedClassObj?.last_analyzed ?? '',
      });
    }

    products.sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      ok: true,
      data: products,
      meta: {
        totalOrders,
        totalRevenue: round2(totalRevenue),
        totalSpend: round2(totalSpend),
        unattributedSpend: round2(unattributedSpend),
        dateFrom: from,
        dateTo: to,
        source: 'db_cache',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
