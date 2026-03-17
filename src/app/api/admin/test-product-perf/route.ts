import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { buildProductPerformance } from '@/lib/pnl/appsScriptPort';

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

  const debug: Record<string, unknown> = {};

  // Check what columns exist by getting one row with select=*
  try {
    const sample = await rest<Array<Record<string, unknown>>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=*&limit=1`
    );
    if (sample.length > 0) {
      debug.columnNames = Object.keys(sample[0]);
      debug.sampleRow = Object.fromEntries(
        Object.entries(sample[0]).filter(([k]) => k !== 'line_items' && k !== 'note_attributes').map(([k, v]) => [k, v])
      );
    } else {
      debug.columnNames = 'NO ROWS FOUND';
    }
  } catch (err) {
    debug.columnError = err instanceof Error ? err.message : String(err);
  }

  // Count total orders
  try {
    const countResult = await rest<Array<Record<string, unknown>>>(
      `/shopify_orders_cache?store_id=eq.${enc(storeId)}&select=created_at&limit=3&order=created_at.desc`
    );
    debug.recentOrders = countResult;
  } catch (err) {
    debug.countError = err instanceof Error ? err.message : String(err);
  }

  // Run the actual build
  try {
    const results = await buildProductPerformance(storeId, from, to);
    return NextResponse.json({
      ok: true,
      debug,
      totals: {
        revenue: Math.round(results.reduce((s, r) => s + r.revenue, 0) * 100) / 100,
        adSpend: Math.round(results.reduce((s, r) => s + r.ad_spend, 0) * 100) / 100,
        fees: Math.round(results.reduce((s, r) => s + r.fees, 0) * 100) / 100,
      },
      products: results.map(r => ({ name: r.product_name, revenue: r.revenue, orders: r.orders, adSpend: r.ad_spend, fees: r.fees, margin: r.margin })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, debug, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
