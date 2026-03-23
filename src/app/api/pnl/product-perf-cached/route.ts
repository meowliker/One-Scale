/**
 * Product performance endpoint — ALWAYS works by fetching from Shopify API.
 *
 * Strategy: Shopify API first, DB cache as enrichment only.
 * This eliminates all cache-miss / product_config / timezone bugs.
 *
 * GET /api/pnl/product-perf-cached?storeId=xxx&from=2026-03-01&to=2026-03-23
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyOrders } from '@/app/api/lib/shopify-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const enc = (v: string) => encodeURIComponent(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Meta metrics fetcher ────────────────────────────────────────────────────

async function fetchMetaMetrics(
  storeId: string, from: string, to: string,
  productRevenues: Map<string, number>,
): Promise<Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>> {
  const metricMap = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();
  if (!isSupabasePersistenceEnabled()) return metricMap;

  try {
    // Try product-level mappings first
    const mappings = await rest<Array<{ ad_account_id: string; product_id: string }>>(
      `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id`
    ).catch(() => []);

    const spendRows = await rest<Array<{
      ad_account_id: string; spend: number; impressions: number; clicks: number; purchases: number;
    }>>(
      `/meta_spend_cache?store_id=eq.${enc(storeId)}&date=gte.${enc(from)}&date=lte.${enc(to)}&select=ad_account_id,spend,impressions,clicks,purchases`
    ).catch(() => []);

    if (spendRows.length === 0) return metricMap;

    if (mappings.length > 0) {
      const accountToProduct = new Map(mappings.map(m => [m.ad_account_id, m.product_id]));
      for (const row of spendRows) {
        const productId = accountToProduct.get(row.ad_account_id);
        if (!productId) continue;
        const existing = metricMap.get(productId) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
        existing.spend += Number(row.spend) || 0;
        existing.impressions += Number(row.impressions) || 0;
        existing.clicks += Number(row.clicks) || 0;
        existing.purchases += Number(row.purchases) || 0;
        metricMap.set(productId, existing);
      }
    } else if (productRevenues.size > 0) {
      // No product mappings → distribute total Meta metrics by revenue share
      const totals = { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
      for (const row of spendRows) {
        totals.spend += Number(row.spend) || 0;
        totals.impressions += Number(row.impressions) || 0;
        totals.clicks += Number(row.clicks) || 0;
        totals.purchases += Number(row.purchases) || 0;
      }
      if (totals.spend > 0 || totals.impressions > 0) {
        const totalRev = [...productRevenues.values()].reduce((s, v) => s + v, 0);
        if (totalRev > 0) {
          for (const [pid, rev] of productRevenues) {
            const share = rev / totalRev;
            metricMap.set(pid, {
              spend: round2(totals.spend * share),
              impressions: Math.round(totals.impressions * share),
              clicks: Math.round(totals.clicks * share),
              purchases: Math.round(totals.purchases * share),
            });
          }
        } else if (productRevenues.size === 1) {
          metricMap.set([...productRevenues.keys()][0], totals);
        }
      }
    }
  } catch { /* non-critical */ }

  return metricMap;
}

// ── Build product response from a product map + meta metrics ────────────────

function buildResponse(
  products: Map<string, { name: string; image: string | null; revenue: number; units: number; fees?: number; cogs?: number; orderIds?: Set<string>; category?: string }>,
  metaMetrics: Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>,
  totalOrderCount?: number,
  totalOrderRevenue?: number,
) {
  // AOV = total order revenue / total order count (order-level, not line-item level)
  const aov = (totalOrderCount && totalOrderCount > 0 && totalOrderRevenue)
    ? round2(totalOrderRevenue / totalOrderCount) : 0;

  return [...products.entries()].map(([pid, p]) => {
    const meta = metaMetrics.get(pid) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
    const spend = meta.spend;
    const imp = meta.impressions;
    const clk = meta.clicks;
    const pur = meta.purchases;
    const fees = p.fees || 0;
    const cogs = p.cogs || 0;
    const netProfit = round2(p.revenue - fees - cogs - spend);
    const orderCount = p.orderIds?.size || p.units;
    return {
      productId: pid,
      productName: p.name,
      productImage: p.image,
      sku: '',
      unitsSold: p.units,
      revenue: p.revenue,
      cogs,
      shipping: 0,
      fees,
      netProfit,
      margin: p.revenue > 0 ? round2((netProfit / p.revenue) * 100) : 0,
      fbMetrics: {
        roas: spend > 0 ? round2(p.revenue / spend) : 0,
        cpc: clk > 0 ? round2(spend / clk) : 0,
        cpm: imp > 0 ? round2((spend / imp) * 1000) : 0,
        ctr: imp > 0 ? round2((clk / imp) * 100) : 0,
        aov: aov || (orderCount > 0 ? round2(p.revenue / orderCount) : 0),
        atcRate: 0,
        spend,
        impressions: imp,
        clicks: clk,
        purchases: pur,
        costPerPurchase: pur > 0 ? round2(spend / pur) : 0,
        frequency: 0,
        reach: 0,
      },
      isAdvertised: spend > 0 || imp > 0 || clk > 0,
      adLandingPageUrl: null,
      adName: null,
      adSetName: null,
      campaignName: null,
      category: p.category || 'main',
      classificationConfidence: 80,
      classificationMethod: 'shopify_live',
    };
  });
}

// ── GET handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });
  }
  if (!from || !to) {
    return NextResponse.json({ ok: true, data: [], source: 'empty' });
  }

  // Get store timezone for correct date → UTC conversion
  let storeTz = 'America/New_York';
  if (isSupabasePersistenceEnabled()) {
    try {
      const tzRows = await rest<Array<{ timezone: string | null }>>(
        `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
      );
      storeTz = tzRows?.[0]?.timezone || 'America/New_York';
    } catch { /* use default */ }
  }

  // ── PRIMARY PATH: Fetch orders directly from Shopify API ──────────────────
  // This is the same approach that getPnLSummary uses (which works).
  // No cache dependency. No product_config dependency. Just Shopify → aggregate.
  try {
    const shopToken = await getShopifyToken(storeId);
    if (shopToken?.accessToken && shopToken?.shopDomain) {
      // Convert store-local dates to UTC (same as services/pnl.ts fetchOrdersForDateRange)
      const { fromZonedTime } = await import('date-fns-tz');
      const startUtc = fromZonedTime(`${from}T00:00:00`, storeTz);
      const endUtc = fromZonedTime(`${to}T23:59:59`, storeTz);

      const orders = await fetchShopifyOrders(shopToken.accessToken, shopToken.shopDomain, {
        createdAtMin: startUtc.toISOString(),
        createdAtMax: endUtc.toISOString(),
        status: 'any',
        limit: 250,
      });

      console.log(`[ProductPerf] Shopify API: ${orders.length} orders for ${from}→${to} (${storeTz})`);

      if (orders.length > 0) {
        // Load stored classifications from DB (if available)
        const classMap = new Map<string, string>();
        if (isSupabasePersistenceEnabled()) {
          try {
            const cls = await rest<Array<{ product_id: string; classification: string }>>(
              `/product_classifications?store_id=eq.${enc(storeId)}&select=product_id,classification`
            );
            for (const c of cls || []) classMap.set(c.product_id, c.classification);
          } catch { /* non-critical */ }
        }

        // Aggregate by product from line items + track order→product for fee distribution
        const byProduct = new Map<string, { name: string; image: string | null; revenue: number; units: number; fees: number; cogs: number; orderIds: Set<string>; category: string }>();
        const orderToProduct = new Map<string, string>(); // orderId → main productId
        let totalOrderCount = 0;
        let totalOrderRevenue = 0;

        for (const order of orders) {
          if (['voided', 'refunded'].includes(order.financialStatus)) continue;
          totalOrderCount++;
          const orderTotal = parseFloat(order.totalPrice || '0');
          totalOrderRevenue += orderTotal;

          const lineItems = order.lineItems || [];
          if (lineItems.length === 0) continue;

          // Calculate line item revenue sum to detect free_plus_shipping ($0 items)
          let lineItemRevSum = 0;
          const orderItems: Array<{ pid: string; title: string; itemRev: number; qty: number }> = [];
          for (const item of lineItems) {
            const pid = String(item.productId || 'unknown');
            const itemRev = parseFloat(item.price || '0') * (item.quantity || 1);
            lineItemRevSum += itemRev;
            orderItems.push({ pid, title: item.title || 'Unknown', itemRev, qty: item.quantity || 1 });
          }

          // Revenue attribution strategy:
          // If line items have real prices → use line item prices (standard model)
          // If line items are $0 (free_plus_shipping) → attribute order.totalPrice to main product
          const usesOrderTotal = lineItemRevSum < 0.01 && orderTotal > 0;

          // Find main product: highest line-item price, or first item if all $0
          let bestPid = orderItems[0].pid;
          let bestRev = orderItems[0].itemRev;
          for (const oi of orderItems) {
            if (oi.itemRev > bestRev) { bestRev = oi.itemRev; bestPid = oi.pid; }
          }

          for (const oi of orderItems) {
            const existing = byProduct.get(oi.pid) || { name: oi.title, image: null, revenue: 0, units: 0, fees: 0, cogs: 0, orderIds: new Set<string>(), category: classMap.get(oi.pid) || 'pending' };
            existing.units += oi.qty;
            existing.orderIds.add(String(order.id));

            if (usesOrderTotal) {
              // Free+shipping: main product gets full order total, others get $0
              existing.revenue += (oi.pid === bestPid) ? orderTotal : 0;
            } else {
              existing.revenue += oi.itemRev;
            }

            byProduct.set(oi.pid, existing);
          }
          orderToProduct.set(String(order.id), bestPid);

          // Auto-classify if no stored classification
          if (orderItems.length > 1) {
            for (const oi of orderItems) {
              const p = byProduct.get(oi.pid);
              if (p && p.category === 'pending') {
                p.category = oi.pid === bestPid ? 'main' : 'upsell';
              }
            }
          } else {
            const p = byProduct.get(orderItems[0].pid);
            if (p && p.category === 'pending') p.category = 'main';
          }
        }

        // Any still-pending products default to main
        for (const p of byProduct.values()) {
          if (p.category === 'pending' || p.category === 'unknown') p.category = 'main';
        }

        // Fetch fees from balance transactions (same source as P&L)
        if (isSupabasePersistenceEnabled()) {
          try {
            const btFees = await rest<Array<{ fee: number; source_order_id: string | null }>>(
              `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&type=eq.charge&and=(processed_at.gte.${enc(startUtc.toISOString())},processed_at.lte.${enc(endUtc.toISOString())})&select=fee,source_order_id`
            );
            for (const bt of btFees || []) {
              const fee = Math.abs(Number(bt.fee) || 0);
              if (fee <= 0) continue;
              const pid = bt.source_order_id ? orderToProduct.get(bt.source_order_id) : undefined;
              if (pid && byProduct.has(pid)) {
                byProduct.get(pid)!.fees += fee;
              } else {
                // Distribute unmatched fees proportionally by revenue
                const totalRev = [...byProduct.values()].reduce((s, p) => s + p.revenue, 0);
                if (totalRev > 0) {
                  for (const p of byProduct.values()) {
                    p.fees += round2(fee * (p.revenue / totalRev));
                  }
                }
              }
            }
          } catch { /* fees non-critical */ }

          // Fetch COGS from product costs table
          try {
            const costRows = await rest<Array<{ product_id: string; cost_per_unit: number; cost_type: string }>>(
              `/pnl_product_costs?store_id=eq.${enc(storeId)}&select=product_id,cost_per_unit,cost_type`
            );
            for (const cost of costRows || []) {
              const p = byProduct.get(cost.product_id);
              if (!p) continue;
              p.cogs = cost.cost_type === 'fixed'
                ? round2(cost.cost_per_unit * p.units)
                : round2(p.revenue * (cost.cost_per_unit / 100));
            }
          } catch { /* cogs non-critical */ }
        }

        // Round revenues and fees
        for (const p of byProduct.values()) {
          p.revenue = round2(p.revenue);
          p.fees = round2(p.fees);
        }

        // Enrich with Meta metrics
        const revMap = new Map<string, number>();
        for (const [pid, p] of byProduct) revMap.set(pid, p.revenue);

        const metaMetrics = await fetchMetaMetrics(storeId, from, to, revMap);
        const data = buildResponse(byProduct, metaMetrics, totalOrderCount, totalOrderRevenue);

        // Try to get product images from Supabase cache (non-blocking)
        if (isSupabasePersistenceEnabled()) {
          try {
            const imgRows = await rest<Array<{ product_id: string; product_image: string | null }>>(
              `/product_pnl_cache?store_id=eq.${enc(storeId)}&product_image=not.is.null&select=product_id,product_image`
            );
            const imgMap = new Map((imgRows || []).map(r => [r.product_id, r.product_image]));
            for (const p of data) {
              if (!p.productImage && imgMap.has(p.productId)) {
                p.productImage = imgMap.get(p.productId) || null;
              }
            }
          } catch { /* images non-critical */ }
        }

        return NextResponse.json({ ok: true, data, source: 'shopify_live' });
      }
    }
  } catch (err) {
    console.warn('[ProductPerf] Shopify API failed, trying DB fallback:', err instanceof Error ? err.message : err);
  }

  // ── FALLBACK: Read from DB cache (for when Shopify API is unavailable) ────
  if (isSupabasePersistenceEnabled()) {
    try {
      const { buildProductPerformance } = await import('@/lib/pnl/appsScriptPort');
      const results = await buildProductPerformance(storeId, from, to);
      if (results.length > 0) {
        const revMap = new Map<string, number>();
        for (const r of results) revMap.set(r.product_id, r.revenue);
        const metaMetrics = await fetchMetaMetrics(storeId, from, to, revMap);

        const data = results.map(r => {
          const meta = metaMetrics.get(r.product_id) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
          const spend = meta.spend || r.ad_spend;
          return {
            productId: r.product_id, productName: r.product_name, productImage: null as string | null,
            sku: '', unitsSold: r.orders, revenue: r.revenue, cogs: r.cogs, shipping: 0, fees: r.fees,
            netProfit: r.net_profit, margin: r.margin,
            fbMetrics: {
              roas: spend > 0 ? round2(r.revenue / spend) : 0,
              cpc: meta.clicks > 0 ? round2(spend / meta.clicks) : 0,
              cpm: meta.impressions > 0 ? round2((spend / meta.impressions) * 1000) : 0,
              ctr: meta.impressions > 0 ? round2((meta.clicks / meta.impressions) * 100) : 0,
              aov: r.orders > 0 ? round2(r.revenue / r.orders) : 0,
              atcRate: 0, spend, impressions: meta.impressions, clicks: meta.clicks,
              purchases: meta.purchases, costPerPurchase: meta.purchases > 0 ? round2(spend / meta.purchases) : 0,
              frequency: 0, reach: 0,
            },
            isAdvertised: spend > 0 || meta.impressions > 0,
            adLandingPageUrl: null, adName: null, adSetName: null, campaignName: null,
            category: r.classification, classificationConfidence: 80, classificationMethod: 'product_config',
          };
        });
        return NextResponse.json({ ok: true, data, source: 'db_cache' });
      }
    } catch { /* DB fallback failed */ }
  }

  return NextResponse.json({ ok: true, data: [], source: 'empty' });
}
