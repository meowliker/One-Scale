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

function mapResultsToResponse(results: Awaited<ReturnType<typeof buildProductPerformance>>) {
  return results.map(r => ({
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
      roas: r.ad_spend > 0 ? round2(r.revenue / r.ad_spend) : 0,
      cpc: r.meta_clicks > 0 ? round2(r.ad_spend / r.meta_clicks) : 0,
      cpm: r.meta_impressions > 0 ? round2((r.ad_spend / r.meta_impressions) * 1000) : 0,
      ctr: r.meta_impressions > 0 ? round2((r.meta_clicks / r.meta_impressions) * 100) : 0,
      aov: r.orders > 0 ? round2(r.revenue / r.orders) : 0,
      atcRate: 0,
      spend: r.ad_spend,
      impressions: r.meta_impressions,
      clicks: r.meta_clicks,
      purchases: r.meta_purchases,
      costPerPurchase: r.meta_purchases > 0 ? round2(r.ad_spend / r.meta_purchases) : 0,
      frequency: 0,
      reach: 0,
    },
    isAdvertised: r.ad_spend > 0,
    adLandingPageUrl: null,
    adName: null,
    adSetName: null,
    campaignName: null,
    category: r.classification,
    classificationConfidence: r.classification === 'main' ? 95 : 80,
    classificationMethod: 'product_config',
  }));
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

  // Determine if range includes today
  const nowParts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
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
      return NextResponse.json({ ok: true, data: mapCacheToResponse(cached), source: 'cache', cachedAt: cached[0]?.computed_at });
    }

    // Cache incomplete or miss — compute full range live and persist
    try {
      const results = await buildProductPerformance(storeId, from, to);
      return NextResponse.json({ ok: true, data: mapResultsToResponse(results), source: 'computed' });
    } catch (err) {
      return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error', data: [] }, { status: 500 });
    }
  }

  // ── TODAY: live sync from Shopify → compute → respond ──
  try {
    const results = await buildProductPerformance(storeId, from, to, { liveSync: true });

    // Merge product images from existing cache (don't fetch from Shopify API — too slow)
    const imgRows = await rest<Array<{ product_id: string; product_image: string | null }>>(
      `/product_pnl_cache?store_id=eq.${enc(storeId)}&product_image=not.is.null&select=product_id,product_image`
    ).catch(() => []);
    const imgMap = new Map(imgRows.map(r => [r.product_id, r.product_image]));

    const data = mapResultsToResponse(results).map(p => ({
      ...p,
      productImage: imgMap.get(p.productId) || p.productImage,
    }));

    return NextResponse.json({ ok: true, data, source: 'live' });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'Error', data: [] }, { status: 500 });
  }
}
