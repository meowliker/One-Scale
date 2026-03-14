/**
 * PRISM — debug endpoint to check latest Shopify orders vs cached.
 */
import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const storeId = new URL(request.url).searchParams.get('storeId') || 'store-b8eea935d87e';
  const enc = (v: string) => encodeURIComponent(v);

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return NextResponse.json({ error: 'No Shopify connection' }, { status: 404 });
  }

  // Fetch 5 most recent orders from Shopify
  const { fetchFromShopify } = await import('@/app/api/lib/shopify-client');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shopifyData = await fetchFromShopify<{ orders: any[] }>(
    token.accessToken, token.shopDomain, '/orders.json',
    { limit: '5', status: 'any' },
  );

  const shopifyLatest = (shopifyData.orders || []).map((o: { id: number; created_at: string; name: string; total_price: string; financial_status: string }) => ({
    id: o.id,
    created_at: o.created_at,
    name: o.name,
    total_price: o.total_price,
    financial_status: o.financial_status,
  }));

  // Get 5 most recent orders from cache
  const cachedLatest = await rest<Array<{ shopify_order_id: string; created_at: string; total_price: number }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=shopify_order_id,created_at,total_price&order=created_at.desc&limit=5`
  ).catch(() => []);

  // Get total counts
  const totalCachedRows = await rest<Array<{ shopify_order_id: string }>>(
    `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=shopify_order_id`
  ).catch(() => []);

  return NextResponse.json({
    storeId,
    shopDomain: token.shopDomain,
    shopify: {
      latest5: shopifyLatest,
      newestDate: shopifyLatest[0]?.created_at ?? null,
    },
    cache: {
      totalOrders: totalCachedRows.length,
      latest5: cachedLatest,
      newestDate: cachedLatest[0]?.created_at ?? null,
    },
    gap: shopifyLatest[0]?.created_at && cachedLatest[0]?.created_at
      ? `Shopify newest: ${shopifyLatest[0].created_at.split('T')[0]}, Cache newest: ${cachedLatest[0].created_at.split('T')[0]}`
      : 'Cannot compare',
  });
}
