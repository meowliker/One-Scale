/**
 * Fast product performance read — serves pre-computed data from product_pnl_cache.
 * For today: live-syncs orders from Shopify, computes, caches, and responds.
 * For past: reads from cache instantly.
 *
 * GET /api/pnl/product-perf-cached?storeId=xxx&from=2026-03-01&to=2026-03-16
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { buildProductPerformance } from '@/lib/pnl/appsScriptPort';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const enc = (v: string) => encodeURIComponent(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

interface CacheRow {
  product_id: string;
  date: string;
  product_name: string;
  classification: string;
  revenue: number;
  orders: number;
  fees: number;
  ad_spend: number;
  cogs: number;
  net_profit: number;
  margin: number;
  impressions: number;
  clicks: number;
  purchases: number;
  product_image: string | null;
  attribution_method: string;
  computed_at: string;
}

function mapCacheToResponse(rows: CacheRow[]) {
  return rows.map(r => {
    const imp = +(r.impressions ?? 0);
    const clk = +(r.clicks ?? 0);
    const pur = +(r.purchases ?? 0);
    const rev = +r.revenue;
    const ords = +r.orders;
    const spend = +r.ad_spend;
    return {
      productId: r.product_id,
      productName: r.product_name,
      productImage: r.product_image,
      sku: '',
      unitsSold: ords,
      revenue: rev,
      cogs: +r.cogs,
      shipping: 0,
      fees: +r.fees,
      netProfit: +r.net_profit,
      margin: +r.margin,
      fbMetrics: {
        roas: spend > 0 ? round2(rev / spend) : 0,
        cpc: clk > 0 ? round2(spend / clk) : 0,
        cpm: imp > 0 ? round2((spend / imp) * 1000) : 0,
        ctr: imp > 0 ? round2((clk / imp) * 100) : 0,
        aov: ords > 0 ? round2(rev / ords) : 0,
        atcRate: 0,
        spend,
        impressions: imp,
        clicks: clk,
        purchases: pur,
        costPerPurchase: pur > 0 ? round2(spend / pur) : 0,
        frequency: 0,
        reach: 0,
      },
      isAdvertised: spend > 0,
      adLandingPageUrl: null,
      adName: null,
      adSetName: null,
      campaignName: null,
      category: r.classification || 'unknown',
      classificationConfidence: r.classification === 'main' ? 95 : 80,
      classificationMethod: 'product_config',
    };
  });
}

/**
 * Fetch real Meta metrics (impressions, clicks, purchases) per product
 * by joining meta_spend_cache with meta_ad_account_mappings.
 */
async function fetchMetaMetricsByProduct(
  storeId: string, from: string, to: string
): Promise<Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>> {
  const metricMap = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();

  try {
    // Get ad account → product mappings
    const mappings = await rest<Array<{ ad_account_id: string; product_id: string }>>(
      `/meta_ad_account_mappings?store_id=eq.${enc(storeId)}&select=ad_account_id,product_id`
    ).catch(() => []);
    if (mappings.length === 0) return metricMap;

    const accountToProduct = new Map(mappings.map(m => [m.ad_account_id, m.product_id]));
    const accountIds = mappings.map(m => enc(m.ad_account_id)).join(',');

    // Fetch aggregated meta metrics for the date range
    const spendRows = await rest<Array<{
      ad_account_id: string; spend: number; impressions: number; clicks: number; purchases: number;
    }>>(
      `/meta_spend_cache?store_id=eq.${enc(storeId)}&ad_account_id=in.(${accountIds})&date=gte.${enc(from)}&date=lte.${enc(to)}&select=ad_account_id,spend,impressions,clicks,purchases`
    ).catch(() => []);

    // Aggregate by product
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
  } catch { /* non-critical */ }

  return metricMap;
}

function mapResultsToResponse(
  results: Awaited<ReturnType<typeof buildProductPerformance>>,
  metaByProduct?: Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>
) {
  return results.map(r => {
    const meta = metaByProduct?.get(r.product_id) || { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
    const spend = meta.spend || r.ad_spend;
    const impressions = meta.impressions;
    const clicks = meta.clicks;
    const purchases = meta.purchases;

    return {
      productId: r.product_id,
      productName: r.product_name,
      productImage: null as string | null,
      sku: '',
      unitsSold: r.orders,
      revenue: r.revenue,
      cogs: r.cogs,
      shipping: 0,
      fees: r.fees,
      netProfit: r.net_profit,
      margin: r.margin,
      fbMetrics: {
        roas: spend > 0 ? round2(r.revenue / spend) : 0,
        cpc: clicks > 0 ? round2(spend / clicks) : 0,
        cpm: impressions > 0 ? round2((spend / impressions) * 1000) : 0,
        ctr: impressions > 0 ? round2((clicks / impressions) * 100) : 0,
        aov: r.orders > 0 ? round2(r.revenue / r.orders) : 0,
        atcRate: 0,
        spend,
        impressions,
        clicks,
        purchases,
        costPerPurchase: purchases > 0 ? round2(spend / purchases) : 0,
        frequency: 0,
        reach: 0,
      },
      isAdvertised: spend > 0,
      adLandingPageUrl: null,
      adName: null,
      adSetName: null,
      campaignName: null,
      category: r.classification,
      classificationConfidence: r.classification === 'main' ? 95 : 80,
      classificationMethod: 'product_config',
    };
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  if (!storeId) {
    return NextResponse.json({ ok: false, error: 'storeId required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Supabase not configured' }, { status: 503 });
  }

  const from = dateFrom || '';
  const to = dateTo || '';

  // Determine if range includes today — use store timezone so "today" matches frontend
  let storeTz = 'America/New_York';
  try {
    const tzRows = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone&limit=1`
    );
    storeTz = tzRows?.[0]?.timezone || 'America/New_York';
  } catch { /* use default */ }

  const nowParts = new Intl.DateTimeFormat('en-CA', { timeZone: storeTz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const todayStr = `${nowParts.find(p => p.type === 'year')!.value}-${nowParts.find(p => p.type === 'month')!.value}-${nowParts.find(p => p.type === 'day')!.value}`;
  const includesToday = to >= todayStr;

  if (!from || !to) {
    return NextResponse.json({ ok: true, data: [], source: 'empty' });
  }

  // ── PAST DATES: read from cache if complete, else compute live ──
  if (!includesToday) {
    let cached: CacheRow[] = [];
    let cacheComplete = false;

    if (from !== to) {
      // Multi-day: aggregate individual day caches
      const dayCaches = await rest<CacheRow[]>(
        `/product_pnl_cache?store_id=eq.${enc(storeId)}&date=gte.${from}&date=lte.${to}&date=not.like.*%2E%2E*&select=*`
      ).catch(() => []);

      if (dayCaches.length > 0) {
        // Check how many unique days we have cached
        const cachedDays = new Set(dayCaches.map(r => r.date));
        // Count expected days in range
        const expectedDays = Math.round((new Date(to + 'T12:00:00Z').getTime() - new Date(from + 'T12:00:00Z').getTime()) / 86400000) + 1;
        cacheComplete = cachedDays.size >= expectedDays;

        if (cacheComplete) {
          // Aggregate by product_id
          const byProduct = new Map<string, CacheRow>();
          for (const row of dayCaches) {
            const existing = byProduct.get(row.product_id);
            if (!existing) {
              byProduct.set(row.product_id, { ...row });
            } else {
              existing.revenue = round2(+existing.revenue + +row.revenue);
              existing.orders += +row.orders;
              existing.fees = round2(+existing.fees + +row.fees);
              existing.ad_spend = round2(+existing.ad_spend + +row.ad_spend);
              existing.cogs = round2(+existing.cogs + +row.cogs);
              existing.net_profit = round2(+existing.net_profit + +row.net_profit);
              existing.impressions += +row.impressions;
              existing.clicks += +row.clicks;
              existing.purchases += +row.purchases;
            }
          }
          for (const p of byProduct.values()) {
            p.margin = +p.revenue > 0 ? round2((+p.net_profit / +p.revenue) * 100) : 0;
          }
          cached = [...byProduct.values()];
        }
      }
    } else {
      // Single past day
      cached = await rest<CacheRow[]>(
        `/product_pnl_cache?store_id=eq.${enc(storeId)}&date=eq.${enc(from)}&select=*`
      ).catch(() => []);
      cacheComplete = cached.length > 0;
    }

    if (cacheComplete && cached.length > 0) {
      // Always enrich cache data with real Meta metrics (cache may have 0s for impressions/clicks)
      const metaMetrics = await fetchMetaMetricsByProduct(storeId, from, to);
      const cacheData = mapCacheToResponse(cached);
      // Merge Meta metrics into cache response
      const enriched = cacheData.map(p => {
        const meta = metaMetrics.get(p.productId);
        if (!meta || (meta.impressions === 0 && meta.clicks === 0 && meta.spend === 0)) return p;
        const spend = meta.spend || p.fbMetrics.spend;
        const imp = meta.impressions;
        const clk = meta.clicks;
        const pur = meta.purchases;
        return {
          ...p,
          fbMetrics: {
            ...p.fbMetrics,
            spend,
            impressions: imp,
            clicks: clk,
            purchases: pur,
            cpc: clk > 0 ? round2(spend / clk) : 0,
            cpm: imp > 0 ? round2((spend / imp) * 1000) : 0,
            ctr: imp > 0 ? round2((clk / imp) * 100) : 0,
            roas: spend > 0 ? round2(p.revenue / spend) : p.fbMetrics.roas,
            costPerPurchase: pur > 0 ? round2(spend / pur) : 0,
          },
          isAdvertised: spend > 0 || imp > 0 || clk > 0,
        };
      });
      return NextResponse.json({ ok: true, data: enriched, source: 'cache', cachedAt: cached[0]?.computed_at });
    }

    // Cache incomplete or miss — compute full range live and persist
    try {
      const [results, metaMetrics] = await Promise.all([
        buildProductPerformance(storeId, from, to),
        fetchMetaMetricsByProduct(storeId, from, to),
      ]);
      return NextResponse.json({ ok: true, data: mapResultsToResponse(results, metaMetrics), source: 'computed' });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error', data: [] }, { status: 500 });
    }
  }

  // ── TODAY: live sync from Shopify → compute → respond ──
  try {
    const [results, metaMetrics] = await Promise.all([
      buildProductPerformance(storeId, from, to),
      fetchMetaMetricsByProduct(storeId, from, to),
    ]);

    // Merge product images from existing cache (don't fetch from Shopify API — too slow)
    const imgRows = await rest<Array<{ product_id: string; product_image: string | null }>>(
      `/product_pnl_cache?store_id=eq.${enc(storeId)}&product_image=not.is.null&select=product_id,product_image`
    ).catch(() => []);
    const imgMap = new Map(imgRows.map(r => [r.product_id, r.product_image]));

    const data = mapResultsToResponse(results, metaMetrics).map(p => ({
      ...p,
      productImage: imgMap.get(p.productId) || p.productImage,
    }));

    return NextResponse.json({ ok: true, data, source: 'live' });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error', data: [] }, { status: 500 });
  }
}
