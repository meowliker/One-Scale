import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { buildProductPerformance, matchOrderToProduct, type ProductConfig } from '@/lib/pnl/appsScriptPort';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const enc = (v: string) => encodeURIComponent(v);

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || 'store-b8eea935d87e';
  const from = searchParams.get('from') || '2026-03-14';
  const to = searchParams.get('to') || '2026-03-14';

  // Debug: check raw data availability
  const debug: Record<string, unknown> = {};

  // 1. Check order count for various date filters
  const orderCountAll = await rest<Array<{ order_id: string }>>(`/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=order_id&limit=5`).catch(() => []);
  debug.totalOrdersInCache = orderCountAll.length >= 5 ? '5+ (limited)' : orderCountAll.length;

  // 2. Check orders for the date with broader filter
  const ordersRaw = await rest<Array<{ order_id: string; created_at: string; total_price: number; financial_status: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${from}&created_at=lt.${to}T99&select=order_id,created_at,total_price,financial_status&limit=5&order=created_at.desc`
  ).catch(() => []);
  debug.ordersForDate = ordersRaw.map(o => ({ id: o.order_id, created_at: o.created_at, total_price: o.total_price, status: o.financial_status }));

  // 3. Check what the latest order date is
  const latestOrder = await rest<Array<{ created_at: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=created_at&order=created_at.desc&limit=1`
  ).catch(() => []);
  debug.latestOrderDate = latestOrder[0]?.created_at ?? 'none';

  // 4. Check store timezone
  const tzRows = await rest<Array<{ timezone: string | null; ad_account_id: string }>>(
    `/store_ad_accounts?store_id=eq.${enc(storeId)}&is_active=eq.true&select=timezone,ad_account_id&limit=3`
  ).catch(() => []);
  debug.storeTimezone = tzRows.map(t => ({ tz: t.timezone, account: t.ad_account_id }));

  // 5. Check BT count for date
  const btCount = await rest<Array<{ type: string }>>(
    `/shopify_balance_transactions?store_id=eq.${enc(storeId)}&and=(processed_at.gte.${from}T00:00:00Z,processed_at.lte.${to}T23:59:59Z)&select=type&limit=5`
  ).catch(() => []);
  debug.btForDate = btCount.length;

  // 6. Check product_config
  const configs = await rest<Array<{ product_id: string; product_name: string }>>(
    `/product_config?store_id=eq.${enc(storeId)}&select=product_id,product_name`
  ).catch(() => []);
  debug.productConfigs = configs;

  // 7. Sample order line items — test matching
  if (ordersRaw.length > 0) {
    const sampleOrder = await rest<Array<{ order_id: string; line_items: string; total_price: number }>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&order_id=eq.${enc(ordersRaw[0].order_id)}&select=order_id,line_items,total_price`
    ).catch(() => []);
    if (sampleOrder.length > 0) {
      try {
        const items = typeof sampleOrder[0].line_items === 'string' ? JSON.parse(sampleOrder[0].line_items) : sampleOrder[0].line_items;
        const titles = (items || []).map((i: { title?: string; product_id?: string }) => ({ title: i.title, pid: i.product_id }));
        debug.sampleOrderItems = titles;

        // Test matching
        const productConfigs: ProductConfig[] = configs.map(c => ({
          product_id: c.product_id, product_name: c.product_name,
          main_keywords: [], upsell_keywords: [],
        }));
        // Load full configs for matching
        const fullConfigs = await rest<Array<{ product_id: string; product_name: string; main_keywords: string[][] | null; upsell_keywords: string[] | null }>>(
          `/product_config?store_id=eq.${enc(storeId)}&is_active=eq.true&select=product_id,product_name,main_keywords,upsell_keywords`
        ).catch(() => []);
        const pcs: ProductConfig[] = fullConfigs.map(p => ({
          product_id: p.product_id, product_name: p.product_name,
          main_keywords: (p.main_keywords ?? []) as string[][], upsell_keywords: (p.upsell_keywords ?? []) as string[],
        }));
        const matched = matchOrderToProduct(items || [], pcs);
        debug.sampleMatchResult = matched;
      } catch (e) {
        debug.sampleOrderError = e instanceof Error ? e.message : String(e);
      }
    }
  }

  // Now run actual build
  try {
    const results = await buildProductPerformance(storeId, from, to);
    return NextResponse.json({
      ok: true,
      debug,
      totals: {
        revenue: Math.round(results.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
        adSpend: Math.round(results.reduce((s, r) => s + r.ad_spend, 0) * 100) / 100,
        fees: Math.round(results.reduce((s, r) => s + r.fees, 0) * 100) / 100,
        netProfit: Math.round(results.reduce((s, r) => s + r.net_profit, 0) * 100) / 100,
      },
      products: results,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, debug, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
