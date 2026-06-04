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
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyProducts } from '@/app/api/lib/shopify-client';
import {
  attributeSpend,
  type CampaignSpendData,
  type ProductData,
  type ManualMapping,
} from '@/lib/attribution/metaSpendAttributor';
import { extractAllProductBehaviors } from '@/lib/intelligence/behaviorExtractor';
import { buildStoreProfile } from '@/lib/intelligence/storeProfiler';
import { classifyAllProducts } from '@/lib/intelligence/relativeClassifier';
import { buildProductPerformance } from '@/lib/pnl/appsScriptPort';
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
  fees: number;
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

  // ── P&L GROUND TRUTH — fetch from daily_pnl_snapshots so product totals match period view ──
  let pnlRevenue = 0;
  let pnlFees = 0;
  let pnlAdSpend = 0;
  let pnlRefunds = 0;
  let pnlChargebackLoss = 0;
  let pnlChargebackWon = 0;
  let pnlOrderCount = 0;
  // Load snapshots with product_breakdown — this is the source of truth for Period View
  const snapshotProductBreakdowns: Array<{ productId: string; productTitle: string; classification: string; revenue: number; unitsSold: number; fees: number; orders: number }> = [];
  try {
    const snapshots = await rest<Array<{
      revenue: number; transaction_fees: number; ad_spend: number;
      refunds: number; chargeback_loss: number; chargeback_won: number; order_count: number;
      product_breakdown: string;
    }>>(
      `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&date=gte.${from}&date=lte.${to}&select=revenue,transaction_fees,ad_spend,refunds,chargeback_loss,chargeback_won,order_count,product_breakdown`
    );
    for (const s of snapshots ?? []) {
      pnlRevenue += Number(s.revenue) || 0;
      pnlFees += Number(s.transaction_fees) || 0;
      pnlAdSpend += Number(s.ad_spend) || 0;
      pnlRefunds += Number(s.refunds) || 0;
      pnlChargebackLoss += Number(s.chargeback_loss) || 0;
      pnlChargebackWon += Number(s.chargeback_won) || 0;
      pnlOrderCount += Number(s.order_count) || 0;
      // Collect product breakdowns from snapshots
      try {
        const pb = JSON.parse(s.product_breakdown || '[]');
        snapshotProductBreakdowns.push(...pb);
      } catch { /* malformed JSON */ }
    }
  } catch { /* table may not exist */ }
  const hasPnlData = pnlRevenue > 0 || pnlFees > 0;

  // ══════════════════════════════════════════════════════════════════════════
  // CLASSIFICATION: Always load/run classifier BEFORE any data path.
  // This ensures both PRIMARY and FALLBACK paths use the same classifications.
  // ══════════════════════════════════════════════════════════════════════════
  const masterClassMap = new Map<string, string>(); // product_id → classification
  try {
    // 1. Load stored classifications from DB
    const storedCls = await rest<Array<{ product_id: string; classification: string; manual_override: boolean; classification_method: string }>>(
      `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,classification,manual_override,classification_method`
    ).catch(() => []);
    for (const sc of storedCls) masterClassMap.set(sc.product_id, sc.classification);

    // 2. If no behavioral classifications, run the classifier
    const hasBehavioral = storedCls.some(sc => sc.classification_method?.startsWith('behavioral') || sc.classification_method === 'shopify_tag' || sc.classification_method === 'manual_override');
    if (!hasBehavioral) {
      const behaviors = await extractAllProductBehaviors(storeId!);
      if (behaviors.length > 0) {
        const storeProfile = await buildStoreProfile(storeId!, behaviors);
        const overrides = new Map<string, string>();
        for (const sc of storedCls) {
          if (sc.manual_override) overrides.set(sc.product_id, sc.classification);
        }
        const results = classifyAllProducts(behaviors, storeProfile, overrides, new Map());
        for (const r of results) {
          if (!masterClassMap.has(r.product_id) || !overrides.has(r.product_id)) {
            masterClassMap.set(r.product_id, r.classification);
          }
        }
        console.log(`[PRISM:ProductPerf] Classifier: ${results.length} products classified (${results.filter(r => r.classification === 'main').length} main)`);
      }
    }
  } catch (err) {
    console.warn('[PRISM:ProductPerf] Classification failed (non-fatal):', err instanceof Error ? err.message : err);
  }

  try {
    // ══════════════════════════════════════════════════════════════════════
    // PRIMARY PATH: Read from snapshot product_breakdown (same source as Period View)
    // Classifications from masterClassMap OVERRIDE snapshot classifications.
    // ══════════════════════════════════════════════════════════════════════
    try {
      // Aggregate multi-day snapshot breakdowns by product_id
      let appsScriptResults: Awaited<ReturnType<typeof buildProductPerformance>>;

      if (snapshotProductBreakdowns.length > 0) {
        // Use snapshot data — guaranteed to match Period View
        const byProduct = new Map<string, { revenue: number; orders: number; fees: number; classification: string; title: string }>();
        for (const p of snapshotProductBreakdowns) {
          const existing = byProduct.get(p.productId);
          if (existing) {
            existing.revenue += p.revenue;
            existing.orders += p.orders;
            existing.fees += p.fees;
          } else {
            byProduct.set(p.productId, {
              revenue: p.revenue,
              orders: p.orders,
              fees: p.fees,
              classification: p.classification,
              title: p.productTitle,
            });
          }
        }

        // Distribute ad spend proportionally to main products by revenue
        // Use masterClassMap for accurate classification
        const mainProducts = [...byProduct.entries()].filter(([pid, v]) => (masterClassMap.get(pid) || v.classification) === 'main' && v.revenue > 0);
        const totalMainRev = mainProducts.reduce((s, [, v]) => s + v.revenue, 0);

        appsScriptResults = [...byProduct.entries()].map(([pid, v]) => {
          // Use masterClassMap classification (from DB/classifier) over snapshot classification
          const cls = masterClassMap.get(pid) || v.classification;
          const adSpendShare = (cls === 'main' && totalMainRev > 0)
            ? round2(pnlAdSpend * (v.revenue / totalMainRev))
            : 0;
          const netProfit = round2(v.revenue - v.fees - adSpendShare);
          const margin = v.revenue > 0 ? round2((netProfit / v.revenue) * 100) : 0;
          return {
            product_id: pid,
            product_name: v.title,
            classification: cls as 'main' | 'upsell' | 'downsell' | 'bundle' | 'excluded' | 'pending',
            revenue: round2(v.revenue),
            orders: v.orders,
            fees: round2(v.fees),
            fees_estimated: false,
            ad_spend: adSpendShare,
            cogs: 0,
            net_profit: netProfit,
            margin,
            attribution_method: 'snapshot',
            parent_product_id: null,
            parent_product_name: null,
          };
        });
      } else {
        // Fallback: compute live (no snapshot data available)
        appsScriptResults = await buildProductPerformance(storeId, from, to);
      }

      if (appsScriptResults.length > 0) {
        // Fetch product images
        const imgMap = new Map<string, string>();
        const handleMap = new Map<string, string>();
        try {
          const shopToken = await getShopifyToken(storeId);
          if (shopToken?.accessToken && shopToken?.shopDomain) {
            const shopProducts = await fetchShopifyProducts(shopToken.accessToken, shopToken.shopDomain, { limit: 250 });
            for (const p of shopProducts) {
              const img = p.images?.[0]?.src;
              if (img) imgMap.set(String(p.id), img);
              if (p.handle) handleMap.set(String(p.id), p.handle);
            }
          }
        } catch { /* images non-critical */ }

        // Pass through Apps Script results directly — revenue is already order.total_price
        const totalOrders = appsScriptResults.reduce((s, r) => s + r.orders, 0);
        const totalRevenue = round2(appsScriptResults.reduce((s, r) => s + r.revenue, 0));
        const totalAdSpend = round2(appsScriptResults.reduce((s, r) => s + r.ad_spend, 0));

        // Fetch real Meta metrics (CPC/CTR/CPM) from meta_spend_cache
        const metaByProduct = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();
        try {
          const adMappings = await rest<Array<{ ad_account_id: string; product_id: string }>>(
            `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id`
          ).catch(() => []);
          const metaRows = await rest<Array<{ ad_account_id: string; spend: number; impressions: number; clicks: number; purchases: number }>>(
            `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${from}&date=lte.${to}&select=ad_account_id,spend,impressions,clicks,purchases`
          ).catch(() => []);

          if (metaRows.length > 0) {
            // Total Meta metrics for the date range
            const metaTotals = { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
            for (const row of metaRows) {
              metaTotals.spend += Number(row.spend) || 0;
              metaTotals.impressions += Number(row.impressions) || 0;
              metaTotals.clicks += Number(row.clicks) || 0;
              metaTotals.purchases += Number(row.purchases) || 0;
            }

            if (adMappings.length > 0) {
              // Product-level mapping
              const acctToProduct = new Map(adMappings.map(m => [m.ad_account_id, m.product_id]));
              for (const row of metaRows) {
                const pid = acctToProduct.get(row.ad_account_id);
                if (!pid) continue;
                const ex = metaByProduct.get(pid) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
                ex.spend += Number(row.spend) || 0;
                ex.impressions += Number(row.impressions) || 0;
                ex.clicks += Number(row.clicks) || 0;
                ex.purchases += Number(row.purchases) || 0;
                metaByProduct.set(pid, ex);
              }
            } else {
              // No mappings — distribute by revenue share
              const totalRev = appsScriptResults.reduce((s, r) => s + r.revenue, 0);
              if (totalRev > 0) {
                for (const r of appsScriptResults) {
                  const share = r.revenue / totalRev;
                  metaByProduct.set(r.product_id, {
                    spend: round2(metaTotals.spend * share),
                    impressions: Math.round(metaTotals.impressions * share),
                    clicks: Math.round(metaTotals.clicks * share),
                    purchases: Math.round(metaTotals.purchases * share),
                  });
                }
              }
            }
          }
        } catch { /* Meta metrics non-critical */ }

        const data = appsScriptResults.map(r => {
          const meta = metaByProduct.get(r.product_id) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
          const metaSpend = meta.spend || r.ad_spend;
          const imp = meta.impressions;
          const clk = meta.clicks;
          const pur = meta.purchases;
          return {
          productId: r.product_id,
          productName: r.product_name,
          productImage: imgMap.get(r.product_id) ?? null,
          productPath: handleMap.get(r.product_id) ? `/${handleMap.get(r.product_id)}` : null,
          shopifyUrl: r.product_id.startsWith('unknown_') ? null : `/admin/products/${r.product_id}`,
          sku: '',
          unitsSold: r.orders,
          orderCount: r.orders,
          revenue: r.revenue,
          cogs: r.cogs,
          shipping: 0,
          fees: r.fees,
          feesEstimated: r.fees_estimated,
          netProfit: r.net_profit,
          margin: r.margin,
          fbMetrics: {
            roas: metaSpend > 0 ? round2(r.revenue / metaSpend) : 0,
            cpc: clk > 0 ? round2(metaSpend / clk) : 0,
            cpm: imp > 0 ? round2((metaSpend / imp) * 1000) : 0,
            ctr: imp > 0 ? round2((clk / imp) * 100) : 0,
            aov: r.orders > 0 ? round2(r.revenue / r.orders) : 0,
            atcRate: 0,
            spend: metaSpend,
            impressions: imp, clicks: clk, purchases: pur,
            costPerPurchase: pur > 0 ? round2(metaSpend / pur) : 0,
            frequency: 0, reach: 0,
          },
          isAdvertised: metaSpend > 0 || imp > 0 || clk > 0,
          adLandingPageUrl: null, adName: null, adSetName: null, campaignName: null,
          category: r.classification as 'main' | 'upsell' | 'downsell' | 'addon',
          classificationConfidence: r.classification === 'main' ? 95 : 80,
          classificationMethod: 'product_config',
          classificationSignals: null,
          behavioralSignals: [],
          parentProduct: r.parent_product_name,
          downsellOf: null,
          needsReview: false,
          manualOverride: false,
          lastAnalyzed: new Date().toISOString(),
          _internal: {
            attributionMethod: r.attribution_method,
            totalSpend: totalAdSpend,
            totalOrders,
          },
        };
        });

        console.log(`[PRISM:ProductPerf] Apps Script direct: ${data.length} products, ${totalOrders} orders, rev=$${totalRevenue}, ads=$${totalAdSpend}`);

        return NextResponse.json({
          ok: true,
          data,
          meta: {
            totalOrders,
            totalRevenue,
            totalSpend: totalAdSpend,
            unattributedSpend: 0,
            dateFrom: from,
            dateTo: to,
            source: 'apps_script_port',
            attributionMethod: appsScriptResults[0]?.attribution_method ?? 'none',
          },
        });
      }
    } catch (err) {
      console.warn('[PRISM:ProductPerf] Apps Script path failed, falling back:', err instanceof Error ? err.message : 'Unknown');
    }

    // ══════════════════════════════════════════════════════════════════════
    // FALLBACK PATH: Original line-item-level aggregation
    // Used when product_config doesn't exist for this store.
    // ══════════════════════════════════════════════════════════════════════

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

    // Fetch product images from Shopify (for card display)
    const productImageMap = new Map<string, string>();
    const productHandleMap = new Map<string, string>();
    try {
      const shopToken = await getShopifyToken(storeId);
      if (shopToken?.accessToken && shopToken?.shopDomain) {
        const shopProducts = await fetchShopifyProducts(shopToken.accessToken, shopToken.shopDomain, { limit: 250 });
        for (const p of shopProducts) {
          const img = p.images?.[0]?.src;
          if (img) productImageMap.set(String(p.id), img);
          if (p.handle) productHandleMap.set(String(p.id), p.handle);
        }
      }
    } catch {
      // Images are non-critical — continue without them
    }

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

    // When BT data exists, ALWAYS use BT-sourced orders (settlement-based)
    // so product breakdown matches P&L numbers (both use BT processed_at).
    // Only fall back to created_at orders when no BT data exists.
    let effectiveOrders = orders ?? [];
    if (btOrderMap.size > 0) {
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
      console.log(`[PRISM:ProductPerf] Settlement mode: ${btOrderMap.size} BT txns → ${fetchedOrders.length} orders from cache (matches P&L)`);
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

      // Use full order total_price as revenue (Apps Script way)
      // For free_plus_shipping: line items are $0 but order has real revenue
      const orderTotal = Number(order.total_price) || 0;

      // Per-order shipping distributed proportionally by revenue share
      const orderShipping = order.total_shipping_price || 0;
      let orderLineItemRevenueSum = 0;
      for (const item of lineItems) {
        orderLineItemRevenueSum += parseFloat(item.price || '0') * (item.quantity || 1);
      }

      // Get actual BT fee for this order (if available)
      const btOrder = btOrderMap.get(order.shopify_order_id);
      const orderActualFee = btOrder ? Math.abs(btOrder.fee) : 0;
      const hasActualFee = orderActualFee > 0;

      // Determine which line item is the "main" product (highest price, or first if all $0)
      let mainItemIdx = 0;
      let mainItemPrice = 0;
      for (let idx = 0; idx < lineItems.length; idx++) {
        const p = parseFloat(lineItems[idx].price || '0');
        if (p > mainItemPrice) { mainItemPrice = p; mainItemIdx = idx; }
      }

      for (let idx = 0; idx < lineItems.length; idx++) {
        const item = lineItems[idx];
        const productId = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
        const price = parseFloat(item.price || '0');
        const quantity = item.quantity || 1;
        const lineRevenue = price * quantity;

        // Revenue attribution: if line items have real prices, distribute by line item share.
        // If all line items are $0 (free_plus_shipping), give full order total to first/main item.
        let attributedRevenue: number;
        if (orderLineItemRevenueSum > 0) {
          // Normal store: distribute order total proportionally by line item price
          attributedRevenue = round2(orderTotal * (lineRevenue / orderLineItemRevenueSum));
        } else {
          // Free_plus_shipping: all items are $0, attribute full order total to main item
          attributedRevenue = idx === mainItemIdx ? orderTotal : 0;
        }
        totalRevenue += attributedRevenue;

        // Distribute shipping and fees proportionally
        const itemCount = lineItems.length;
        const lineRevenueShare = orderLineItemRevenueSum > 0 ? lineRevenue / orderLineItemRevenueSum : (idx === mainItemIdx ? 1 : 0);
        const lineShipping = round2(orderShipping * lineRevenueShare);
        const lineFee = hasActualFee
          ? round2(orderActualFee * lineRevenueShare)
          : round2((attributedRevenue * feePercentage / 100) + (feeFixed > 0 ? feeFixed / Math.max(1, itemCount) : 0));

        const existing = productAgg.get(productId);
        if (existing) {
          existing.unitsSold += quantity;
          existing.revenue += attributedRevenue;
          existing.fees += lineFee;
          existing.shipping += lineShipping;
          existing.orderCount++;
          existing.orderIds.add(order.shopify_order_id);
        } else {
          productAgg.set(productId, {
            productName: item.title || 'Unknown',
            sku: item.sku || '',
            unitsSold: quantity,
            revenue: attributedRevenue,
            fees: lineFee,
            shipping: lineShipping,
            orderCount: 1,
            orderIds: new Set([order.shopify_order_id]),
            categoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0 },
            multiItemCategoryCounts: { main: 0, upsell: 0, downsell: 0, addon: 0 },
          });
        }
      }
    }

    // Product revenue uses line item prices directly (price × quantity).
    // Do NOT scale by settlement ratio — BT data may be incomplete and
    // scaling corrupts per-product revenue when only partial BT exists.
    // BT data is used ONLY for fee rate calculation (feePercentage above).

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

    // ══════════════════════════════════════════════════════════════════════════
    // AD SPEND DISTRIBUTION — 3 methods in priority order
    // Ground truth: daily_pnl_snapshots.ad_spend (same as P&L page)
    // Guarantee: SUM(product ad_spend) = P&L total ad_spend
    // ══════════════════════════════════════════════════════════════════════════

    const productSpendMap = new Map<string, number>();
    let unattributedSpend = 0;
    let attributionMethod = 'none';

    // ── GROUND TRUTH: Get total ad spend from daily_pnl_snapshots ─────────
    // This is the SAME number shown on the P&L page. Use it as the source of truth.
    // meta_spend_cache may be empty or have schema gaps — don't rely on it alone.
    let groundTruthAdSpend = 0;
    try {
      const pnlSnapshots = await rest<Array<{ ad_spend: number }>>(
        `/daily_pnl_snapshots?store_id=eq.${enc(storeId)}&date=gte.${from}&date=lte.${to}&select=ad_spend`
      );
      groundTruthAdSpend = (pnlSnapshots ?? []).reduce((s, r) => s + (Number(r.ad_spend) || 0), 0);
    } catch { /* table may not exist yet */ }

    // If daily_pnl_snapshots is empty, fall back to meta_spend_cache total
    if (groundTruthAdSpend === 0 && totalSpend > 0) {
      groundTruthAdSpend = totalSpend;
    }
    // Update totalSpend to ground truth for metrics calculations
    if (groundTruthAdSpend > 0) {
      totalSpend = groundTruthAdSpend;
    }

    // Build campaign spend lookup from meta_spend_cache (used by Methods 1 & 2)
    const campaignIdToSpend = new Map<string, number>();
    const campaignNameToId = new Map<string, string>();
    for (const [campaignId, agg] of campaignAgg) {
      campaignIdToSpend.set(campaignId, agg.spend);
      if (agg.campaignName) {
        campaignNameToId.set(normalizeCampaign(agg.campaignName), campaignId);
      }
    }

    // Identify MAIN products (only main products get ad spend)
    const mainProductList: Array<{ pid: string; orders: number }> = [];
    for (const [pid, agg] of productAgg.entries()) {
      const cls = classificationMap.get(pid)?.classification;
      const isMain = !cls || cls === 'main' || cls === 'pending' || cls === 'unknown';
      if (isMain) mainProductList.push({ pid, orders: agg.orderIds.size });
    }

    // Helper: distribute spend proportionally by order count
    function distributeProportionally(amount: number, products: Array<{ pid: string; orders: number }>, map: Map<string, number>) {
      const totalOrd = products.reduce((s, p) => s + p.orders, 0);
      if (totalOrd === 0) return;
      for (const p of products) {
        const share = p.orders / totalOrd;
        const current = map.get(p.pid) ?? 0;
        map.set(p.pid, round2(current + amount * share));
      }
    }

    if (groundTruthAdSpend > 0 && mainProductList.length > 0) {
      let mappedSpend = 0;

      // ── METHOD 1: Direct campaign → product mapping ───────────────────
      // Check campaign_product_mappings and campaign_product_attributions
      if (campaignMappings && campaignMappings.length > 0 && campaignIdToSpend.size > 0) {
        for (const mapping of campaignMappings) {
          const spend = campaignIdToSpend.get(mapping.campaign_id) ?? 0;
          if (spend > 0 && mapping.product_id) {
            const current = productSpendMap.get(mapping.product_id) ?? 0;
            productSpendMap.set(mapping.product_id, round2(current + spend));
            mappedSpend += spend;
          }
        }
        if (mappedSpend > 0) {
          attributionMethod = 'campaign_product_mapping';
          console.log(`[PRISM:ProductPerf] Method 1: mapped $${round2(mappedSpend)} via campaign→product mappings`);
        }
      }

      // Also check campaign_product_attributions (from PRISM ad attribution engine)
      if (mappedSpend === 0) {
        try {
          const attrRows = await rest<Array<{ campaign_id: string; product_id: string; creative_url: string | null; confidence: number }>>(
            `/campaign_product_attributions?store_id=eq.${enc(storeId)}&select=campaign_id,product_id,creative_url,confidence`
          );
          for (const attr of attrRows ?? []) {
            const spend = campaignIdToSpend.get(attr.campaign_id) ?? 0;
            if (spend > 0 && attr.product_id) {
              const current = productSpendMap.get(attr.product_id) ?? 0;
              productSpendMap.set(attr.product_id, round2(current + spend));
              mappedSpend += spend;
            }
          }
          if (mappedSpend > 0) {
            attributionMethod = 'campaign_product_attribution';
            console.log(`[PRISM:ProductPerf] Method 1b: mapped $${round2(mappedSpend)} via campaign_product_attributions`);
          }
        } catch { /* table may not exist */ }
      }

      // ── METHOD 2: Creative URL → product handle matching ──────────────
      if (mappedSpend === 0 && campaignIdToSpend.size > 0) {
        try {
          // Check campaign_product_attributions for creative_url
          const creativeRows = await rest<Array<{ campaign_id: string; creative_url: string | null }>>(
            `/campaign_product_attributions?store_id=eq.${enc(storeId)}&creative_url=not.is.null&select=campaign_id,creative_url`
          );
          if (creativeRows && creativeRows.length > 0) {
            // Build product handle lookup
            const handleToProductId = new Map<string, string>();
            for (const [pid, agg] of productAgg.entries()) {
              const handle = agg.productName.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
              handleToProductId.set(handle, pid);
            }

            for (const row of creativeRows) {
              if (!row.creative_url) continue;
              const handleMatch = row.creative_url.match(/\/products\/([^/?#]+)/);
              if (!handleMatch) continue;
              const handle = handleMatch[1].toLowerCase();
              const matchedPid = handleToProductId.get(handle);
              if (!matchedPid) continue;

              const spend = campaignIdToSpend.get(row.campaign_id) ?? 0;
              if (spend > 0) {
                const current = productSpendMap.get(matchedPid) ?? 0;
                productSpendMap.set(matchedPid, round2(current + spend));
                mappedSpend += spend;
              }
            }
            if (mappedSpend > 0) {
              attributionMethod = 'creative_url_match';
              console.log(`[PRISM:ProductPerf] Method 2: mapped $${round2(mappedSpend)} via creative URL matching`);
            }
          }
        } catch { /* table may not exist */ }
      }

      // ── REMAINDER: Distribute any unmapped spend proportionally ────────
      const unmappedSpend = round2(groundTruthAdSpend - mappedSpend);
      if (unmappedSpend > 0) {
        if (mappedSpend === 0) {
          attributionMethod = 'proportional_order_count';
        }
        distributeProportionally(unmappedSpend, mainProductList, productSpendMap);
        console.log(`[PRISM:ProductPerf] Method 3: distributed $${unmappedSpend} proportionally to ${mainProductList.length} MAIN products`);
      }

      unattributedSpend = 0; // all spend is now attributed
    }

    // ── Normalize to P&L ground truth ───────────────────────────────────
    // Scale product revenue/fees so totals match daily_pnl_snapshots (period view)
    const fbRevScale = hasPnlData && totalRevenue > 0 ? pnlRevenue / totalRevenue : 1;
    const rawTotalFees = [...productAgg.values()].reduce((s, a) => s + a.fees, 0);
    const fbFeeScale = hasPnlData && rawTotalFees > 0 ? pnlFees / rawTotalFees : 1;
    // Ad spend: use P&L ground truth if available
    if (hasPnlData && pnlAdSpend > 0) {
      const rawProductSpendTotal = [...productSpendMap.values()].reduce((s, v) => s + v, 0);
      if (rawProductSpendTotal > 0) {
        const adScale = pnlAdSpend / rawProductSpendTotal;
        for (const [pid, val] of productSpendMap) {
          productSpendMap.set(pid, round2(val * adScale));
        }
      }
      totalSpend = pnlAdSpend;
    }

    if (hasPnlData) {
      console.log(`[PRISM:ProductPerf] Fallback normalizing: rev ${totalRevenue.toFixed(2)}→${pnlRevenue.toFixed(2)} (${fbRevScale.toFixed(3)}x), fees ${rawTotalFees.toFixed(2)}→${pnlFees.toFixed(2)}, ads→${pnlAdSpend.toFixed(2)}`);
    }

    // Build response
    const products = [];
    for (const [productId, agg] of productAgg.entries()) {
      // Apply revenue normalization
      const normalizedRevenue = round2(agg.revenue * fbRevScale);

      // COGS — never use silent fallback. $0 if not configured.
      const costData = cogsMap.get(productId);
      let cogs = 0;
      if (costData) {
        cogs = costData.costType === 'fixed'
          ? costData.costPerUnit * agg.unitsSold
          : round2(normalizedRevenue * (costData.costPerUnit / 100));
      }

      const normalizedTotalRevenue = totalRevenue * fbRevScale;
      const revenueShare = normalizedTotalRevenue > 0 ? normalizedRevenue / normalizedTotalRevenue : 0;

      // Fees: normalize to match P&L
      const fees = round2(agg.fees * fbFeeScale);
      const shipping = round2(agg.shipping);

      // Use masterClassMap first (populated at top from DB + classifier), then local classificationMap
      const masterClass = masterClassMap.get(productId);
      const storedClassObj = classificationMap.get(productId);
      const storedClass = masterClass || storedClassObj?.classification;
      let mostCommonCategory: string;
      if (storedClass && storedClass !== 'pending' && storedClass !== 'unknown') {
        mostCommonCategory = storedClass;
      } else {
        const tc = agg.categoryCounts;
        const mic = agg.multiItemCategoryCounts;
        const totalAppearances = (tc.main || 0) + (tc.upsell || 0) + (tc.addon || 0) + (tc.downsell || 0);
        const multiItemTotal = (mic.main || 0) + (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
        const singleItemCount = totalAppearances - multiItemTotal;

        if (totalAppearances === 0 && multiItemTotal === 0) {
          // No order pattern data — use revenue share heuristic
          const productRevenueShare = totalRevenue > 0 ? agg.revenue / totalRevenue : 0;
          // Products with >10% revenue share are likely main, others are upsells
          mostCommonCategory = productRevenueShare >= 0.10 ? 'main' : 'upsell';
        } else if (multiItemTotal === 0) {
          // Only single-item orders — this product IS the main product
          mostCommonCategory = 'main';
        } else {
          const productRevenueShare = totalRevenue > 0 ? agg.revenue / totalRevenue : 0;
          const upsellSignals = (mic.upsell || 0) + (mic.addon || 0) + (mic.downsell || 0);
          const mainSignals = (mic.main || 0);
          const upsellRate = (upsellSignals + mainSignals) > 0 ? upsellSignals / (upsellSignals + mainSignals) : 0;

          // Classify as upsell if: mostly appears as non-main in multi-item orders
          // OR has very low revenue share (< 10%)
          if (upsellRate > 0.5 || productRevenueShare < 0.05) {
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
      const effectiveFees = normalizedRevenue > 0 ? fees : 0;
      const effectiveCogs = normalizedRevenue > 0 ? cogs : 0;
      const effectiveAdSpend = normalizedRevenue > 0 ? adSpend : 0;
      const effectiveShipping = normalizedRevenue > 0 ? shipping : 0;

      const netProfit = round2(normalizedRevenue - effectiveCogs - effectiveAdSpend - effectiveFees - effectiveShipping - productRefunds - productCbLoss + productCbWon);
      const margin = normalizedRevenue > 0 ? round2((netProfit / normalizedRevenue) * 100) : 0;

      // Per-product FB metrics
      const roas = adSpend > 0 ? round2(normalizedRevenue / adSpend) : 0;
      const cpc = totalClicks > 0 ? round2(totalSpend / totalClicks) : 0;
      const cpm = totalImpressions > 0 ? round2((totalSpend / totalImpressions) * 1000) : 0;
      const ctr = totalImpressions > 0 ? round2((totalClicks / totalImpressions) * 100) : 0;
      const aov = totalOrders > 0 ? round2(normalizedTotalRevenue / totalOrders) : 0;

      products.push({
        productId,
        productName: agg.productName,
        productImage: productImageMap.get(productId) ?? null,
        productPath: productHandleMap.get(productId) ? `/${productHandleMap.get(productId)}` : null,
        shopifyUrl: productId.startsWith('unknown_') ? null : `/admin/products/${productId}`,
        sku: agg.sku,
        unitsSold: agg.unitsSold,
        orderCount: agg.orderIds.size || agg.orderCount,
        revenue: normalizedRevenue,
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
          totalSpend: round2(totalSpend),
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

    const finalTotalRevenue = round2(products.reduce((s, p) => s + p.revenue, 0));
    const finalTotalSpend = round2(products.reduce((s, p) => s + p.fbMetrics.spend, 0));

    return NextResponse.json({
      ok: true,
      data: products,
      meta: {
        totalOrders,
        totalRevenue: finalTotalRevenue,
        totalSpend: finalTotalSpend,
        unattributedSpend: round2(unattributedSpend),
        dateFrom: from,
        dateTo: to,
        source: 'db_cache',
        feeSource: useActualBtFees ? 'balance_transactions' : (feeStructures.length > 0 ? 'fee_structures' : (activeGateways.length > 0 ? 'configured' : 'none')),
        attributionMethod,
        normalized: hasPnlData,
        ...(lastOrderRange ? { lastOrderRange } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[PRISM:ProductPerf] Error:', message);
    return NextResponse.json({ ok: false, error: message, details: message, data: [], products: [] }, { status: 500 });
  }
}
