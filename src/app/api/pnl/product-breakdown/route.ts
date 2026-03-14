import { NextRequest, NextResponse } from 'next/server';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchShopifyOrders, fetchShopifyProducts } from '@/app/api/lib/shopify-client';
import { rest, getPersistentProductCosts } from '@/app/api/lib/supabase-persistence';

/**
 * Get the store's timezone from ad account settings (server-side).
 */
async function getStoreTz(storeId: string): Promise<string> {
  try {
    const accounts = await rest<Array<{ timezone: string | null }>>(
      `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.1&select=timezone&limit=1`
    );
    return accounts?.[0]?.timezone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/**
 * Convert a YYYY-MM-DD date string to UTC ISO bounds using store timezone.
 */
function toUtcBounds(dateStr: string, tz: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startLocal = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const utcDate = new Date(dateStr + 'T00:00:00Z');
  const inTzStr = utcDate.toLocaleString('en-US', { timeZone: tz });
  const inTzDate = new Date(inTzStr);
  const offsetMs = utcDate.getTime() - inTzDate.getTime();
  return new Date(startLocal.getTime() + offsetMs).toISOString();
}

export interface ProductBreakdownItem {
  product_id: string;
  title: string;
  image: string | null;
  vendor: string | null;
  product_type: string | null;
  requires_shipping: boolean;
  classification: 'MAIN' | 'UPSELL' | 'BUNDLE';
  units_sold: number;
  revenue: number;
  refunds: number;
  cogs: number;
  cost_per_unit: number;
  fees: number;
  ad_spend: number;
  net_profit: number;
  margin_pct: number;
  order_count: number;
}

// ── Server-side in-memory cache ────────────────────────────────────────────
interface CachedBreakdown {
  breakdown: ProductBreakdownItem[];
  timestamp: number;
}
const breakdownCache = new Map<string, CachedBreakdown>();
const CACHE_TTL_HISTORICAL = 15 * 60 * 1000; // 15 min
const CACHE_TTL_TODAY = 2 * 60 * 1000;        // 2 min

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}
// ── End cache ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  if (!storeId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'storeId, from, and to are required' }, { status: 400 });
  }

  // Check cache
  const cacheKey = `${storeId}:${dateFrom}:${dateTo}`;
  const cached = breakdownCache.get(cacheKey);
  const includestoday = dateTo >= todayStr();
  const ttl = includestoday ? CACHE_TTL_TODAY : CACHE_TTL_HISTORICAL;
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    return NextResponse.json({ ok: true, breakdown: cached.breakdown, dateFrom, dateTo, cached: true });
  }

  const token = await getShopifyToken(storeId);
  if (!token || !token.shopDomain) {
    return NextResponse.json({ error: 'Not authenticated with Shopify' }, { status: 401 });
  }

  try {
    // Get store timezone and compute proper UTC bounds
    const storeTz = await getStoreTz(storeId);
    const utcMin = toUtcBounds(dateFrom, storeTz);
    // For the end date, use end-of-day (add 1 day minus 1 second)
    const [ey, em, ed] = dateTo.split('-').map(Number);
    const endNextDay = new Date(Date.UTC(ey, em - 1, ed + 1, 0, 0, 0));
    const utcDateTest = new Date(dateTo + 'T00:00:00Z');
    const endInTzStr = utcDateTest.toLocaleString('en-US', { timeZone: storeTz });
    const endInTzDate = new Date(endInTzStr);
    const endOffsetMs = utcDateTest.getTime() - endInTzDate.getTime();
    const utcMax = new Date(endNextDay.getTime() + endOffsetMs - 1000).toISOString();

    // Fetch orders, products, COGS, and daily cache in parallel
    const [orders, products, storedCosts, dailyCache] = await Promise.all([
      fetchShopifyOrders(token.accessToken, token.shopDomain, {
        createdAtMin: utcMin,
        createdAtMax: utcMax,
        status: 'any',
        limit: 250,
      }),
      fetchShopifyProducts(token.accessToken, token.shopDomain, { limit: 250 }),
      getPersistentProductCosts(storeId).catch(() => []),
      rest<Array<{ revenue: number; ad_spend: number; fees: number }>>(
        `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=revenue,ad_spend:ad_spend,fees:transaction_fees`
      ).catch(() =>
        rest<Array<{ revenue: number; ad_spend: number; fees: number }>>(
          `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=revenue,ad_spend,fees`
        ).catch(() => [])
      ),
    ]);

    // Build product enrichment map (for image, vendor, requires_shipping, product_type)
    const productInfoMap = new Map<string, {
      image: string | null;
      vendor: string | null;
      productType: string | null;
      requiresShipping: boolean;
    }>();
    for (const p of products) {
      const reqShipping = Array.isArray(p.variants) && p.variants.length > 0
        ? p.variants.some((v) => v.requiresShipping !== false)
        : true;
      productInfoMap.set(String(p.id), {
        image: p.images?.[0]?.src ?? null,
        vendor: p.vendor ?? null,
        productType: p.productType ?? null,
        requiresShipping: reqShipping,
      });
    }

    // Build COGS lookup
    const cogsMap = new Map<string, number>();
    for (const c of storedCosts) {
      cogsMap.set(c.product_id, c.cost_per_unit);
    }

    // ── Store-level totals from daily cache (ad spend + fees) ──────────────
    let totalAdSpend = (dailyCache ?? []).reduce((s, r) => s + (r.ad_spend ?? 0), 0);
    let totalFees = (dailyCache ?? []).reduce((s, r) => s + (r.fees ?? 0), 0);

    // Fix: If ad_spend is $0 from snapshots, fetch Meta insights directly
    if (totalAdSpend === 0) {
      try {
        const origin = request.nextUrl.origin;
        const metaRes = await fetch(
          `${origin}/api/meta/insights?${new URLSearchParams({ storeId, since: dateFrom, until: dateTo })}`
        );
        if (metaRes.ok) {
          const metaJson = await metaRes.json() as {
            data?: Array<{ date: string; metrics?: { spend?: number } }>;
          };
          for (const row of metaJson.data ?? []) {
            totalAdSpend += row.metrics?.spend ?? 0;
          }
        }
      } catch { /* Meta unavailable — ad spend stays 0 */ }
    }
    // ── End store-level totals ───────────────────────────────────────────────

    // Aggregate per product from order line_items
    interface ProductAgg {
      title: string;
      unitsSold: number;
      revenue: number;
      orderIds: Set<number>;
    }
    const productMap = new Map<string, ProductAgg>();

    // ── Classification tracking ──────────────────────────────────────────────
    // Per product, count how many times it appeared as MAIN, UPSELL, or BUNDLE
    const classificationCounts = new Map<string, { main: number; upsell: number; bundle: number }>();

    for (const order of orders) {
      // Skip fully refunded / voided orders — their revenue shouldn't count
      if (order.financialStatus === 'refunded' || order.financialStatus === 'voided') continue;

      const lineItems = order.lineItems ?? [];
      if (lineItems.length === 0) continue;

      // Find the highest-price line item in this order → that's the MAIN product
      let maxPrice = -1;
      let maxPid = '';
      for (const item of lineItems) {
        const pid = String(item.productId ?? '');
        if (!pid || pid === 'null' || pid === '0') continue;
        const price = parseFloat(item.price ?? '0');
        if (price > maxPrice) {
          maxPrice = price;
          maxPid = pid;
        }
      }

      for (const item of lineItems) {
        const pid = String(item.productId ?? '');
        if (!pid || pid === 'null' || pid === '0') continue;

        const lineRevenue = parseFloat(item.price ?? '0') * (item.quantity ?? 1);
        const existing = productMap.get(pid);

        if (existing) {
          existing.unitsSold += item.quantity ?? 1;
          existing.revenue += lineRevenue;
          existing.orderIds.add(order.id);
        } else {
          productMap.set(pid, {
            title: item.title ?? 'Unknown',
            unitsSold: item.quantity ?? 1,
            revenue: lineRevenue,
            orderIds: new Set([order.id]),
          });
        }

        // Track classification for this product in this order
        if (!classificationCounts.has(pid)) {
          classificationCounts.set(pid, { main: 0, upsell: 0, bundle: 0 });
        }
        const counts = classificationCounts.get(pid)!;
        const price = parseFloat(item.price ?? '0');
        if (price === 0) {
          counts.bundle++;
        } else if (pid === maxPid) {
          counts.main++;
        } else {
          counts.upsell++;
        }
      }
    }

    // Assign classification based on majority across orders
    function getClassification(pid: string): 'MAIN' | 'UPSELL' | 'BUNDLE' {
      const counts = classificationCounts.get(pid);
      if (!counts) return 'MAIN';
      const { main, upsell, bundle } = counts;
      if (bundle >= main && bundle >= upsell && bundle > 0) return 'BUNDLE';
      if (upsell > main) return 'UPSELL';
      return 'MAIN';
    }
    // ── End classification ───────────────────────────────────────────────────

    // Build final breakdown
    const breakdown: ProductBreakdownItem[] = [];

    // Use actual sum of product line-item revenues as denominator.
    // daily_pnl_snapshots totalRevenue includes tax/shipping which inflates
    // the denominator and makes each product's share too small.
    const productRevenueTotal = Array.from(productMap.values())
      .reduce((s, agg) => s + agg.revenue, 0);

    // If daily snapshot fees are $0, try auto-detected fee_structures before showing $0
    if (totalFees === 0 && productRevenueTotal > 0) {
      try {
        const feeStructures = await rest<Array<{ effective_rate: number; fixed_fee: number }>>(
          `/fee_structures?store_id=eq.${encodeURIComponent(storeId)}&is_active=eq.true&select=effective_rate,fixed_fee`
        );
        if (feeStructures.length > 0) {
          const avgRate = feeStructures.reduce((s, f) => s + f.effective_rate, 0) / feeStructures.length;
          totalFees = productRevenueTotal * avgRate;
        }
        // If no fee_structures either, fees stay $0 — never hardcode 3%
      } catch { /* fee_structures table may not exist yet */ }
    }

    for (const [productId, agg] of productMap.entries()) {
      const info = productInfoMap.get(productId);
      const costPerUnit = cogsMap.get(productId) ?? 0;
      const requiresShipping = info?.requiresShipping ?? true;
      const cogs = requiresShipping ? costPerUnit * agg.unitsSold : 0;

      // Proportional share based on actual product revenue
      const revenueShare = productRevenueTotal > 0 ? agg.revenue / productRevenueTotal : 0;
      const fees = totalFees * revenueShare;
      const adSpend = totalAdSpend * revenueShare;

      const netProfit = agg.revenue - cogs - fees - adSpend;
      const marginPct = agg.revenue > 0 ? (netProfit / agg.revenue) * 100 : 0;

      breakdown.push({
        product_id: productId,
        title: agg.title,
        image: info?.image ?? null,
        vendor: info?.vendor ?? null,
        product_type: info?.productType ?? null,
        requires_shipping: requiresShipping,
        classification: getClassification(productId),
        units_sold: agg.unitsSold,
        revenue: Math.round(agg.revenue * 100) / 100,
        refunds: 0,
        cogs: Math.round(cogs * 100) / 100,
        cost_per_unit: costPerUnit,
        fees: Math.round(fees * 100) / 100,
        ad_spend: Math.round(adSpend * 100) / 100,
        net_profit: Math.round(netProfit * 100) / 100,
        margin_pct: Math.round(marginPct * 10) / 10,
        order_count: agg.orderIds.size,
      });
    }

    breakdown.sort((a, b) => b.revenue - a.revenue);

    // Store in cache
    breakdownCache.set(cacheKey, { breakdown, timestamp: Date.now() });

    return NextResponse.json({ ok: true, breakdown, dateFrom, dateTo });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
