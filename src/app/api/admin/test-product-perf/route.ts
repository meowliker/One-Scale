/**
 * Admin test endpoint for product performance.
 * Calls the Apps Script port directly with CRON_SECRET auth.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { buildProductPerformance } from '@/lib/pnl/appsScriptPort';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  try {
    const results = await buildProductPerformance(storeId, from, to);

    const totalRevenue = results.reduce((s, r) => s + r.revenue, 0);
    const totalAdSpend = results.reduce((s, r) => s + r.ad_spend, 0);
    const totalFees = results.reduce((s, r) => s + r.fees, 0);
    const totalProfit = results.reduce((s, r) => s + r.net_profit, 0);

    return NextResponse.json({
      ok: true,
      storeId,
      dateRange: { from, to },
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        adSpend: Math.round(totalAdSpend * 100) / 100,
        fees: Math.round(totalFees * 100) / 100,
        netProfit: Math.round(totalProfit * 100) / 100,
      },
      products: results,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
