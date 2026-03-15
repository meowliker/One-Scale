/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
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
import { extractAllProductBehaviors } from '@/lib/intelligence/behaviorExtractor';
import { buildStoreProfile } from '@/lib/intelligence/storeProfiler';
import { classifyAllProducts } from '@/lib/intelligence/relativeClassifier';
import { PRISM } from '@/lib/prism';

export const dynamic = 'force-dynamic';

/**
 * GET /api/pnl/product-performance?storeId=xxx&from=2026-03-01&to=2026-03-13
 *
 * Uses visitor-level attribution (pixel → session → order) when coverage is
 * sufficient. Falls back to campaign-name matching when pixel data is sparse.
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
  currency?: string;
}

interface CampaignProductMapping {
  campaign_id: string;
  product_id: string;
}

interface OrderAttribution {
  order_id: string;
  utm_campaign: string | null;
  utm_source: string | null;
  fbclid: string | null;
  attribution_method: string;
}

interface ProductAgg {
  productName: string;
  sku: string;
  unitsSold: number;
  revenue: number;
  orderCount: number;
  shipping: number;
  orderIds: Set<string>;
  categoryCounts: Record<string, number>;
  multiItemCategoryCounts: Record<string, number>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

/** Normalize campaign name for fuzzy matching between UTM and Meta Ads */
function normalizeCampaign(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from') ?? searchParams.get('startDate');
  const dateTo = searchParams.get('to') ?? searchParams.get('endDate');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required', products: [] }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured', products: [] }, { status: 503 });
  }

  // Fetch store timezone FIRST — needed for correct default date computation
  let storeTz = 'America/New_York';
  try {
    const tzRows = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
    );
    storeTz = tzRows?.[0]?.timezone || 'America/New_York';
  } catch { /* use default */ }

  // Default dates using store timezone (avoids off-by-one near midnight)
  const { getStoreDateRangeForPeriod } = await import('@/lib/pnl/dateUtils');
  let from: string;
  let to: string;
  if (dateFrom && dateTo) {
    from = dateFrom;
    to = dateTo;
  } else {
    // Compute today/30-days-ago in store timezone using Intl
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: storeTz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const todayStr = `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const pastParts = new Intl.DateTimeFormat('en-CA', { timeZone: storeTz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(thirtyDaysAgo);
    const pastStr = `${pastParts.find(p => p.type === 'year')!.value}-${pastParts.find(p => p.type === 'month')!.value}-${pastParts.find(p => p.type === 'day')!.value}`;
    from = dateFrom || pastStr;
    to = dateTo || todayStr;
  }

  // Compute timezone-aware date boundaries
  const { start: tzStart, end: tzEnd } = getStoreDateRangeForPeriod(from, to, storeTz);

  try {
    // Fetch orders + spend + COGS + payment fees + campaign mappings + balance txn fees + order attributions from DB in parallel
    const [orders, spendRows, storedCosts, paymentFees, campaignMappings, storedClassifications, attributedOrders, balanceTxnFees, refundTxns, chargebackRows] = await Promise.all([
      rest<OrderCacheRow[]>(
        `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(tzStart)}&created_at=lte.${enc(tzEnd)}&order_status=neq.cancelled&select=shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items,refund_total,created_at,total_shipping_price`
      ).catch(() => [] as OrderCacheRow[]),
      rest<SpendCacheRow[]>(
        `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${from}&date=lte.${to}&select=date,spend,impressions,clicks,purchases,purchase_value,campaign_id,campaign_name,currency`
      ).catch(() => [] as SpendCacheRow[]),
      getPersistentProductCosts(storeId).catch(() => []),
      getPersistentPaymentFees(storeId).catch(() => []),
      rest<CampaignProductMapping[]>(
        `/campaign_product_mappings?store_id=eq.${enc(storeId)}&select=campaign_id,product_id`
      ).catch(() => [] as CampaignProductMapping[]),
      rest<Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string }>>(
        `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,classification,manual_override,confidence,classification_method,signals_used,needs_review,last_analyzed`
      ).catch(() => [] as Array<{ product_id: string; classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; needs_review: boolean; last_analyzed: string }>),
      // Fetch visitor-level order attributions for the date range
      rest<OrderAttribution[]>(
        `/order_attributions?store_id=eq.${enc(storeId)}&attributed_at=gte.${enc(tzStart)}&attributed_at=lte.${enc(tzEnd)}&select=order_id,utm_campaign,utm_source,fbclid,attribution_method`
      ).catch(() => [] as OrderAttribution[]),
      // Fetch actual balance transaction fees for the date range (more accurate than estimated rates)
      // MUST use and=() for range queries — duplicate URL params override each other in PostgREST
      rest<Array<{ fee: number; amount: number; source_order_id: string | null }>>(
        `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=eq.charge&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=fee,amount,source_order_id`
      ).catch(() => [] as Array<{ fee: number; amount: number; source_order_id: string | null }>),
      // Query 9: Refund balance transactions
      rest<Array<{ amount: number; source_order_id: string | null }>>(
        `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=eq.refund&and=(processed_at.gte.${enc(tzStart)},processed_at.lte.${enc(tzEnd)})&select=amount,source_order_id`
      ).catch(() => [] as Array<{ amount: number; source_order_id: string | null }>),
      // Query 10: Chargebacks
      rest<Array<{ amount: number; status: string; order_id: string | null }>>(
        `/shopify_chargebacks?store_id=eq.${enc(storeId)}&or=(and(finalized_at.gte.${enc(tzStart)},finalized_at.lte.${enc(tzEnd)}),and(finalized_at.is.null,created_at.gte.${enc(tzStart)},created_at.lte.${enc(tzEnd)}))&select=amount,status,order_id`
      ).catch(() => [] as Array<{ amount: number; status: string; order_id: string | null }>),
    ]);

    // Build stored classification lookup (from adaptive intelligence system)
    type StoredClassEntry = { classification: string; manual_override: boolean; confidence: number; classification_method: string; signals_used: Record<string, number> | null; behavioral_signals?: string[]; parent_product?: string | null; downsell_of?: string | null; needs_review: boolean; last_analyzed: string };
    const classificationMap = new Map<string, StoredClassEntry>();
    for (const sc of storedClassifications) {
      classificationMap.set(sc.product_id, sc);
    }

    // If no stored behavioral classifications exist, run inline behavioral classification
    const hasBehavioral = storedClassifications.some(sc => sc.classification_method?.startsWith('behavioral') || sc.classification_method === 'shopify_tag' || sc.classification_method === 'manual_override');
    if (!hasBehavioral && (orders ?? []).length > 0) {
      try {
        const behaviors = await extractAllProductBehaviors(storeId!);
        if (behaviors.length > 0) {
          const storeProfile = await buildStoreProfile(storeId!, behaviors);
          const manualOverrides = new Map<string, string>();
          for (const sc of storedClassifications) {
            if (sc.manual_override) manualOverrides.set(sc.product_id, sc.classification);
          }
          const behavioralResults = classifyAllProducts(behaviors, storeProfile, manualOverrides, new Map());
          for (const r of behavioralResults) {
            if (r.method === 'manual_override') continue;
            classificationMap.set(r.product_id, {
              classification: r.classification,
              manual_override: false,
              confidence: r.confidence,
              classification_method: r.method,
              signals_used: null,
              behavioral_signals: r.signals,
              parent_product: r.parent_product,
              downsell_of: r.downsell_of,
              needs_review: r.needs_review,
              last_analyzed: new Date().toISOString(),
            });
          }
        }
      } catch (e) {
        console.warn('[PRISM:ProductPerf] Behavioral classification failed, using fallback:', e instanceof Error ? e.message : e);
      }
    }

    // Build COGS lookup
    const cogsMap = new Map<string, { costPerUnit: number; costType: string }>();
    for (const c of storedCosts) {
      cogsMap.set(c.product_id, {
        costPerUnit: c.cost_per_unit,
        costType: c.cost_type,
      });
    }

    // Compute payment fees: prefer actual balance transaction fees, then fee_structures, then configured gateways
    // Balance transaction fees are the most accurate — they're what Shopify actually charged
    const btFeeTotal = (balanceTxnFees ?? []).reduce((sum, t) => sum + (Number(t.fee) || 0), 0);
    const btRevenueTotal = (balanceTxnFees ?? []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const useActualBtFees = btFeeTotal > 0 && btRevenueTotal > 0;

    let feeStructures: Array<{ effective_rate: number; fixed_fee: number }> = [];
    try {
      feeStructures = await rest<typeof feeStructures>(
        `/fee_structures?store_id=eq.${enc(storeId)}&is_active=eq.true&select=effective_rate,fixed_fee`
      );
    } catch { /* table might not exist yet */ }

    const activeGateways = (paymentFees ?? []).filter((f) => f.is_active);
    let feePercentage = 0;
    let feeFixed = 0;

    if (useActualBtFees) {
      // Derive effective fee rate from actual balance transactions
      feePercentage = (btFeeTotal / btRevenueTotal) * 100;
      feeFixed = 0;
    } else if (feeStructures.length > 0) {
      feePercentage = (feeStructures.reduce((s, f) => s + f.effective_rate, 0) / feeStructures.length) * 100;
      feeFixed = feeStructures.reduce((s, f) => s + f.fixed_fee, 0) / feeStructures.length;
    } else if (activeGateways.length > 0) {
      feePercentage = activeGateways.reduce((s, f) => s + f.fee_percentage, 0) / activeGateways.length;
      feeFixed = activeGateways.reduce((s, f) => s + f.fee_fixed, 0) / activeGateways.length;
    }

    // Aggregate Meta spend totals — normalize currency if needed
    // storeTz is already available from the timezone lookup above
    const { normalize: normalizeCurrency } = await import('@/lib/prism/currencyNormalizer');

    // Detect store base currency from orders or config
    const storeCurrencyRows = await rest<Array<{ currency: string }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=currency&limit=1`
    ).catch(() => []);
    const storeCurrency = storeCurrencyRows[0]?.currency || 'USD';

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    const campaignAgg = new Map<string, { campaignId: string; campaignName: string; spend: number }>();

    for (const row of spendRows ?? []) {
      // Normalize ad spend from ads currency to store currency
      const spendCurrency = row.currency || storeCurrency;
      let normalizedSpend = row.spend || 0;
      if (spendCurrency !== storeCurrency && normalizedSpend > 0) {
        const normalized = await normalizeCurrency(normalizedSpend, spendCurrency, storeCurrency, row.date || from);
        normalizedSpend = normalized.value;
      }
      totalSpend += normalizedSpend;
      totalImpressions += row.impressions || 0;
      totalClicks += row.clicks || 0;
      totalPurchases += row.purchases || 0;

      if (row.campaign_id) {
        const existing = campaignAgg.get(row.campaign_id);
        if (existing) {
          existing.spend += normalizedSpend;
        } else {
          campaignAgg.set(row.campaign_id, {
            campaignId: row.campaign_id,
            campaignName: row.campaign_name || row.campaign_id,
            spend: normalizedSpend,
          });
        }
      }
    }

    // ── SETTLEMENT-BASED PRODUCT BREAKDOWN ─────────────────────────────
    // Primary: use balance transactions (settlement date = P&L date).
    // For each charge transaction, look up the order's line items.
    // If order isn't in cache, try to find it from Shopify.
    // Falls back to order-created-at aggregation if no balance txns exist.

    const productAgg = new Map<string, ProductAgg>();
    let totalRevenue = 0;
    let totalOrders = 0;

    // Build a map of order IDs from balance transactions → { amount, fee }
    const btOrderMap = new Map<string, { amount: number; fee: number }>();
    for (const bt of balanceTxnFees ?? []) {
      if (bt.source_order_id) {
        const existing = btOrderMap.get(bt.source_order_id);
        if (existing) {
          existing.amount += Number(bt.amount) || 0;
          existing.fee += Number(bt.fee) || 0;
        } else {
          btOrderMap.set(bt.source_order_id, {
            amount: Number(bt.amount) || 0,
            fee: Number(bt.fee) || 0,
          });
        }
      }
    }

    // If balance txns exist but no orders in cache for this date range,
    // fetch line items for the settlement orders from the cache by order ID
    let effectiveOrders = orders ?? [];
    if (effectiveOrders.length === 0 && btOrderMap.size > 0) {
      // Look up orders by source_order_id from balance transactions
      const orderIds = [...btOrderMap.keys()];
      const batchSize = 50;
      const fetchedOrders: OrderCacheRow[] = [];
      for (let i = 0; i < orderIds.length; i += batchSize) {
        const batch = orderIds.slice(i, i + batchSize);
        const idFilter = batch.map(id => `"${id}"`).join(',');
        const batchOrders = await rest<OrderCacheRow[]>(
          `/shopify_orders_cache?store_id=eq.${enc(storeId)}&shopify_order_id=in.(${idFilter})&select=shopify_order_id,total_price,subtotal_price,financial_status,order_status,line_items,refund_total,created_at,total_shipping_price`
        ).catch(() => [] as OrderCacheRow[]);
        fetchedOrders.push(...batchOrders);
      }
      effectiveOrders = fetchedOrders;
      console.log(`[PRISM:ProductPerf] Settlement mode: ${btOrderMap.size} txns, ${fetchedOrders.length} orders found in cache`);
    }

    for (const order of effectiveOrders) {
      if (order.financial_status === 'refunded') continue;

      totalOrders++;

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

      // Per-order shipping distributed proportionally by revenue share
      const orderShipping = order.total_shipping_price || 0;
      let orderLineItemRevenueSum = 0;
      for (const item of lineItems) {
        orderLineItemRevenueSum += parseFloat(item.price || '0') * (item.quantity || 1);
      }

      for (const item of lineItems) {
        const productId = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
        const price = parseFloat(item.price || '0');
        const quantity = item.quantity || 1;
        const lineRevenue = price * quantity;
        totalRevenue += lineRevenue;

        // Distribute shipping proportionally across line items
        const lineRevenueShare = orderLineItemRevenueSum > 0 ? lineRevenue / orderLineItemRevenueSum : 0;
        const lineShipping = round2(orderShipping * lineRevenueShare);

        const existing = productAgg.get(productId);
        if (existing) {
          existing.unitsSold += quantity;
          existing.revenue += lineRevenue;
          existing.shipping += lineShipping;
          existing.orderCount++;
          existing.orderIds.add(order.shopify_order_id);
        } else {
          productAgg.set(productId, {
            productName: item.title || 'Unknown',
            sku: item.sku || '',
            unitsSold: quantity,
            revenue: lineRevenue,
            shipping: lineShipping,
            orderCount: 1,
            orderIds: new Set([order.shopify_order_id]),
            categoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0 },
            multiItemCategoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0 },
          });
        }
      }
    }

    // ── SETTLEMENT RATIO: scale order revenue to match balance txn settled amounts ──
    const totalSettled = (balanceTxnFees ?? []).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const settlementRatio = totalSettled > 0 && totalRevenue > 0 ? totalSettled / totalRevenue : 1;
    if (totalSettled > 0) {
      for (const agg of productAgg.values()) {
        agg.revenue = round2(agg.revenue * settlementRatio);
      }
      totalRevenue = round2(totalRevenue * settlementRatio);
    }

    // ── REFUND & CHARGEBACK MAPS (by order ID) ──
    const refundByOrder = new Map<string, number>();
    for (const r of refundTxns ?? []) {
      if (r.source_order_id) {
        refundByOrder.set(r.source_order_id, (refundByOrder.get(r.source_order_id) || 0) + Math.abs(Number(r.amount) || 0));
      }
    }
    const cbLossByOrder = new Map<string, number>();
    const cbWonByOrder = new Map<string, number>();
    for (const c of chargebackRows ?? []) {
      if (c.order_id) {
        if (c.status === 'lost') {
          cbLossByOrder.set(c.order_id, (cbLossByOrder.get(c.order_id) || 0) + (Number(c.amount) || 0));
        } else if (c.status === 'won') {
          cbWonByOrder.set(c.order_id, (cbWonByOrder.get(c.order_id) || 0) + (Number(c.amount) || 0));
        }
      }
    }

    // ── AD SPEND ATTRIBUTION ─────────────────────────────────────────────────
    // Try visitor-level attribution first, fall back to campaign-name matching

    // Build order → attribution lookup
    const orderAttrMap = new Map<string, OrderAttribution>();
    for (const attr of attributedOrders ?? []) {
      if (attr.order_id) orderAttrMap.set(attr.order_id, attr);
    }

    const attributedCount = orderAttrMap.size;
    const coverageRate = totalOrders > 0 ? attributedCount / totalOrders : 0;
    const useVisitorAttribution = coverageRate >= PRISM.attribution.pixelCoverageThreshold && attributedCount >= PRISM.attribution.minAttributedOrders;

    // Build campaign spend lookup for matching utm_campaign → spend
    const campaignNameToId = new Map<string, string>();
    const campaignIdToSpend = new Map<string, number>();
    for (const [campaignId, agg] of campaignAgg) {
      campaignNameToId.set(normalizeCampaign(agg.campaignName), campaignId);
      campaignIdToSpend.set(campaignId, agg.spend);
    }

    function findCampaignSpend(utmCampaign: string): number {
      // Try exact match on campaign ID
      const directSpend = campaignIdToSpend.get(utmCampaign);
      if (directSpend != null) return directSpend;
      // Try normalized name match
      const normalized = normalizeCampaign(utmCampaign);
      const matchedId = campaignNameToId.get(normalized);
      if (matchedId) return campaignIdToSpend.get(matchedId) || 0;
      // Try substring match (utm_campaign may be a subset of campaign_name)
      for (const [normName, cId] of campaignNameToId) {
        if (normName.includes(normalized) || normalized.includes(normName)) {
          return campaignIdToSpend.get(cId) || 0;
        }
      }
      return 0;
    }

    const productSpendMap = new Map<string, number>();
    let unattributedSpend = 0;
    let attributionMethod = 'campaign_name_match'; // for API metadata

    if (useVisitorAttribution) {
      // ── VISITOR-LEVEL ATTRIBUTION ──────────────────────────────────────
      // Group attributed orders by campaign, track which products were purchased
      attributionMethod = 'pixel_revenue_share';

      const campaignOrderProducts = new Map<string, { totalRevenue: number; products: Map<string, number> }>();
      const matchedCampaignIds = new Set<string>();

      for (const order of orders ?? []) {
        if (order.financial_status === 'refunded') continue;
        const attr = orderAttrMap.get(order.shopify_order_id);
        if (!attr?.utm_campaign) continue;

        const campaign = attr.utm_campaign;
        if (!campaignOrderProducts.has(campaign)) {
          campaignOrderProducts.set(campaign, { products: new Map(), totalRevenue: 0 });
        }

        let lineItems;
        try {
          lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
        } catch { continue; }

        for (const item of lineItems) {
          const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
          const rev = parseFloat(item.price || '0') * (item.quantity || 1);
          const entry = campaignOrderProducts.get(campaign)!;
          entry.products.set(pid, (entry.products.get(pid) || 0) + rev);
          entry.totalRevenue += rev;
        }
      }

      // Distribute campaign spend to products based on purchase revenue share
      for (const [campaignName, { products: campaignProducts, totalRevenue: campaignRevenue }] of campaignOrderProducts) {
        const campaignSpend = findCampaignSpend(campaignName);
        if (campaignSpend <= 0 || campaignRevenue <= 0) continue;

        // Track which campaigns were matched
        const matchedId = campaignNameToId.get(normalizeCampaign(campaignName))
          || (campaignIdToSpend.has(campaignName) ? campaignName : null);
        if (matchedId) matchedCampaignIds.add(matchedId);

        for (const [productId, productRev] of campaignProducts) {
          const share = productRev / campaignRevenue;
          const spend = round2(campaignSpend * share);
          productSpendMap.set(productId, (productSpendMap.get(productId) || 0) + spend);
        }
      }

      // Any campaign spend not matched via attribution goes to unattributed
      let attributedTotalSpend = 0;
      for (const [, spend] of productSpendMap) attributedTotalSpend += spend;
      unattributedSpend = Math.max(0, round2(totalSpend - attributedTotalSpend));

    } else {
      // ── FALLBACK: Campaign name matching ──────────────────────────────
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

      for (const attr of attributions) {
        if (attr.productId) {
          productSpendMap.set(attr.productId, (productSpendMap.get(attr.productId) || 0) + attr.spend);
        } else {
          unattributedSpend += attr.spend;
        }
      }
    }

    // ── REFINE MAIN-PRODUCT SPEND via pixel-attributed order counts ─────
    // When pixel data is available, count how many attributed orders each
    // MAIN product drove. Redistribute total MAIN spend proportionally by
    // attributed order count instead of revenue share.
    if (useVisitorAttribution) {
      const mainProductIds = new Set<string>();
      for (const [pid] of productAgg) {
        const sc = classificationMap.get(pid)?.classification;
        if (!sc || sc === 'main' || sc === 'pending' || sc === 'unknown') {
          mainProductIds.add(pid);
        }
      }

      if (mainProductIds.size > 1) {
        // Count pixel-attributed orders per MAIN product
        const mainAttrCounts = new Map<string, number>();
        for (const order of orders ?? []) {
          if (order.financial_status === 'refunded') continue;
          const attr = orderAttrMap.get(order.shopify_order_id);
          if (!attr?.utm_campaign) continue;

          let lineItems;
          try {
            lineItems = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
          } catch { continue; }

          for (const item of lineItems) {
            const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
            if (mainProductIds.has(pid)) {
              mainAttrCounts.set(pid, (mainAttrCounts.get(pid) || 0) + 1);
            }
          }
        }

        const totalMainAttr = [...mainAttrCounts.values()].reduce((s, c) => s + c, 0);
        if (totalMainAttr > 0) {
          // Sum total MAIN spend then redistribute by attributed order count
          let totalMainSpend = 0;
          for (const pid of mainProductIds) {
            totalMainSpend += productSpendMap.get(pid) || 0;
          }
          for (const pid of mainProductIds) {
            const attrCount = mainAttrCounts.get(pid) || 0;
            productSpendMap.set(pid, round2(totalMainSpend * (attrCount / totalMainAttr)));
          }
        }
      }
    }

    // Build response
    const products = [];
    for (const [productId, agg] of productAgg.entries()) {
      // COGS — never use silent fallback. $0 if not configured.
      const costData = cogsMap.get(productId);
      let cogs = 0;
      if (costData) {
        cogs = costData.costType === 'fixed'
          ? costData.costPerUnit * agg.unitsSold
          : round2(agg.revenue * (costData.costPerUnit / 100));
      }

      const revenueShare = totalRevenue > 0 ? agg.revenue / totalRevenue : 0;

      // Fees: proportional by revenue share (universal, works for every store)
      const fees = round2((agg.revenue * feePercentage / 100) + (feeFixed * agg.orderCount));
      const shipping = round2(agg.shipping);

      // Use stored classification from adaptive intelligence if available
      const storedClassObj = classificationMap.get(productId);
      const storedClass = storedClassObj?.classification;
      let mostCommonCategory: string;
      if (storedClass && storedClass !== 'pending' && storedClass !== 'unknown') {
        mostCommonCategory = storedClass;
      } else {
        const tc = agg.categoryCounts;
        const mic = agg.multiItemCategoryCounts;
        const totalAppearances = (tc.main || 0) + (tc.upsell || 0) + (tc.addon || 0) + (tc.downsell || 0);
        const multiItemTotal = (mic.main || 0) + (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
        const singleItemCount = totalAppearances - multiItemTotal;

        if (totalAppearances === 0 || multiItemTotal === 0) {
          mostCommonCategory = 'pending';
        } else {
          const productRevenueShare = totalRevenue > 0 ? agg.revenue / totalRevenue : 0;
          const upsellSignals = (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
          const upsellRate = upsellSignals / multiItemTotal;

          if (upsellRate > 0.6 && singleItemCount <= multiItemTotal && productRevenueShare < 0.25) {
            if ((mic.addon || 0) > (mic.upsell || 0)) mostCommonCategory = 'addon';
            else if ((mic.downsell || 0) > (mic.upsell || 0)) mostCommonCategory = 'downsell';
            else mostCommonCategory = 'upsell';
          } else {
            mostCommonCategory = 'main';
          }
        }
      }

      // Ad spend: only MAIN products get attribution (V4.4 approach)
      const isMain = mostCommonCategory === 'main';
      const adSpend = isMain ? round2(productSpendMap.get(productId) || 0) : 0;

      // Distribute refunds & chargebacks to this product based on its order membership
      let productRefunds = 0;
      let productCbLoss = 0;
      let productCbWon = 0;
      for (const oid of agg.orderIds) {
        productRefunds += refundByOrder.get(oid) || 0;
        productCbLoss += cbLossByOrder.get(oid) || 0;
        productCbWon += cbWonByOrder.get(oid) || 0;
      }

      // Bug fix: free products ($0 revenue) get $0 for everything — never negative
      const effectiveFees = agg.revenue > 0 ? fees : 0;
      const effectiveCogs = agg.revenue > 0 ? cogs : 0;
      const effectiveAdSpend = agg.revenue > 0 ? adSpend : 0;
      const effectiveShipping = agg.revenue > 0 ? shipping : 0;

      const netProfit = round2(agg.revenue - effectiveCogs - effectiveAdSpend - effectiveFees - effectiveShipping - productRefunds - productCbLoss + productCbWon);
      const margin = agg.revenue > 0 ? round2((netProfit / agg.revenue) * 100) : 0;

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
        behavioralSignals: (storedClassObj as StoredClassEntry)?.behavioral_signals ?? [],
        parentProduct: (storedClassObj as StoredClassEntry)?.parent_product ?? null,
        downsellOf: (storedClassObj as StoredClassEntry)?.downsell_of ?? null,
        needsReview: storedClassObj?.needs_review ?? false,
        manualOverride: storedClassObj?.manual_override ?? false,
        lastAnalyzed: storedClassObj?.last_analyzed ?? '',
        // Internal attribution metadata — for debugging only, not rendered in UI
        _internal: {
          attributionMethod,
          coverageRate: round2(coverageRate * 100),
          attributedOrders: attributedCount,
          totalOrders,
        },
      });
    }

    products.sort((a, b) => b.revenue - a.revenue);

    // If no products found, find the latest date range that has orders
    // so the frontend can suggest a valid range
    let lastOrderRange: { from: string; to: string } | null = null;
    if (products.length === 0) {
      const latestOrder = await rest<Array<{ created_at: string }>>(
        `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=created_at&order=created_at.desc&limit=1`
      ).catch(() => []);
      if (latestOrder.length > 0) {
        const latestDate = latestOrder[0].created_at.split('T')[0];
        const rangeStart = new Date(new Date(latestDate).getTime() - 30 * 86400000).toISOString().split('T')[0];
        lastOrderRange = { from: rangeStart, to: latestDate };
      }
    }

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
        feeSource: useActualBtFees ? 'balance_transactions' : (feeStructures.length > 0 ? 'fee_structures' : (activeGateways.length > 0 ? 'configured' : 'none')),
        attributionMethod,
        pixelCoverage: round2(coverageRate * 100),
        ...(lastOrderRange ? { lastOrderRange } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[PRISM:ProductPerf] Error:', message);
    return NextResponse.json({ ok: false, error: message, details: message, data: [], products: [] }, { status: 500 });
  }
}
