/**
 * PRISM — temporary debug endpoint for product performance testing.
 * DELETE after confirming product perf works.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId parameter required' }, { status: 400 });
  }
  const from = searchParams.get('from') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const to = searchParams.get('to') || new Date().toISOString().split('T')[0];
  const enc = (v: string) => encodeURIComponent(v);

  // Replicate what product-performance route does
  const orders = await rest<Array<{
    shopify_order_id: string; total_price: number; financial_status: string;
    line_items: string; created_at: string;
  }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&created_at=gte.${from}T00:00:00&created_at=lte.${to}T23:59:59&order_status=neq.cancelled&select=shopify_order_id,total_price,financial_status,line_items,created_at`
  ).catch(() => []);

  // Parse products from line items
  const productMap = new Map<string, { title: string; revenue: number; units: number; orders: number }>();
  let parsedOrders = 0;

  for (const order of orders) {
    if (order.financial_status === 'refunded') continue;
    let items: Array<{ product_id?: string | number; title?: string; price?: string; quantity?: number }>;
    try {
      items = typeof order.line_items === 'string' ? JSON.parse(order.line_items) : order.line_items || [];
    } catch { continue; }

    parsedOrders++;
    for (const item of items) {
      const pid = item.product_id ? String(item.product_id) : `unknown_${item.title}`;
      const existing = productMap.get(pid) ?? { title: item.title || 'Unknown', revenue: 0, units: 0, orders: 0 };
      existing.revenue += parseFloat(item.price || '0') * (item.quantity || 1);
      existing.units += item.quantity || 1;
      existing.orders++;
      productMap.set(pid, existing);
    }
  }

  const products = [...productMap.entries()]
    .map(([pid, p]) => ({ productId: pid, ...p }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return NextResponse.json({
    storeId, from, to,
    totalOrders: orders.length,
    parsedOrders,
    totalProducts: productMap.size,
    topProducts: products,
  });
}
