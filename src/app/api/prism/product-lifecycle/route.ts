/**
 * GET /api/prism/product-lifecycle?storeId=X
 *
 * GAP 6 — Product lifecycle tracking.
 * Detects: Launch → Growth → Peak → Decline → Dead
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

type Lifecycle = 'launch' | 'growth' | 'peak' | 'decline' | 'dead';

export async function GET(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  // Get classifications
  const products = await rest<Array<{
    product_id: string; product_title: string; classification: string;
    first_seen_at: string | null; confidence: number;
  }>>(
    `/product_classifications?store_id=eq.${enc(storeId)}&classification=neq.excluded&select=product_id,product_title,classification,first_seen_at,confidence`
  ).catch(() => []);

  // Get last 30 days of orders for revenue trends
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const orders = await rest<Array<{ line_items: string; created_at: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${enc(thirtyDaysAgo)}` +
    `&order_status=neq.cancelled&financial_status=neq.refunded` +
    `&select=line_items,created_at&limit=2000`
  ).catch(() => []);

  // Build per-product weekly revenue
  const productWeekly = new Map<string, { week1: number; week2: number; week3: number; week4: number; lastOrderDate: string }>();

  const now = Date.now();
  for (const order of orders) {
    let items: Array<{ product_id?: string | number; price?: string; quantity?: number }>;
    try { items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || []; } catch { continue; }

    const orderAge = (now - new Date(order.created_at).getTime()) / 86400000;
    const weekBucket = orderAge < 7 ? 'week1' : orderAge < 14 ? 'week2' : orderAge < 21 ? 'week3' : 'week4';

    for (const item of items) {
      if (!item.product_id) continue;
      const pid = String(item.product_id);
      const rev = parseFloat(item.price || '0') * (item.quantity || 1);

      if (!productWeekly.has(pid)) {
        productWeekly.set(pid, { week1: 0, week2: 0, week3: 0, week4: 0, lastOrderDate: order.created_at });
      }
      const entry = productWeekly.get(pid)!;
      entry[weekBucket] += rev;
      if (order.created_at > entry.lastOrderDate) entry.lastOrderDate = order.created_at;
    }
  }

  // Determine lifecycle for each product
  const results: Array<{
    product_id: string; product_title: string; classification: string;
    lifecycle: Lifecycle; advice: string;
    week1_revenue: number; week2_revenue: number; trend_pct: number;
    days_since_last_order: number;
  }> = [];

  for (const product of products) {
    const weekly = productWeekly.get(product.product_id);
    if (!weekly) {
      // No orders in 30 days
      const firstSeen = product.first_seen_at ? new Date(product.first_seen_at).getTime() : 0;
      const age = firstSeen > 0 ? (now - firstSeen) / 86400000 : 999;

      results.push({
        product_id: product.product_id, product_title: product.product_title,
        classification: product.classification,
        lifecycle: age < 7 ? 'launch' : 'dead',
        advice: age < 7 ? 'New — waiting for first orders' : 'No sales in 30 days — consider archiving or refreshing',
        week1_revenue: 0, week2_revenue: 0, trend_pct: 0,
        days_since_last_order: 30,
      });
      continue;
    }

    const daysSinceLast = (now - new Date(weekly.lastOrderDate).getTime()) / 86400000;
    const recentRev = weekly.week1 + weekly.week2;
    const olderRev = weekly.week3 + weekly.week4;
    const trendPct = olderRev > 0 ? Math.round((recentRev - olderRev) / olderRev * 100) : (recentRev > 0 ? 100 : 0);

    let lifecycle: Lifecycle;
    let advice: string;

    if (daysSinceLast > 14) {
      lifecycle = 'dead';
      advice = 'No recent sales — consider archiving or refreshing offer';
    } else if (product.first_seen_at && (now - new Date(product.first_seen_at).getTime()) / 86400000 < 30) {
      lifecycle = trendPct > 0 ? 'growth' : 'launch';
      advice = lifecycle === 'growth' ? 'Growing — consider scaling ad spend' : 'New — tracking initial performance';
    } else if (trendPct > 15) {
      lifecycle = 'growth';
      advice = `Revenue up ${trendPct}% — scale ad spend`;
    } else if (trendPct >= -10 && trendPct <= 15) {
      lifecycle = 'peak';
      advice = 'Stable performer — maintain current spend';
    } else {
      lifecycle = 'decline';
      advice = `Revenue down ${Math.abs(trendPct)}% — review creative/offer`;
    }

    results.push({
      product_id: product.product_id, product_title: product.product_title,
      classification: product.classification, lifecycle, advice,
      week1_revenue: Math.round(weekly.week1 * 100) / 100,
      week2_revenue: Math.round(weekly.week2 * 100) / 100,
      trend_pct: trendPct,
      days_since_last_order: Math.round(daysSinceLast),
    });
  }

  // Sort: growth > peak > launch > decline > dead
  const order: Record<Lifecycle, number> = { growth: 0, peak: 1, launch: 2, decline: 3, dead: 4 };
  results.sort((a, b) => order[a.lifecycle] - order[b.lifecycle]);

  const dist: Record<string, number> = {};
  for (const r of results) dist[r.lifecycle] = (dist[r.lifecycle] || 0) + 1;

  return NextResponse.json({
    store_id: storeId,
    products: results,
    distribution: dist,
    total: results.length,
  });
}
