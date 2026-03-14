import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled, logStoreError } from '@/app/api/lib/supabase-persistence';

/**
 * GET /api/pnl/consistency-check?storeId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Compares product-level P&L (product-performance) with snapshot P&L (sync)
 * and flags divergence > 1%.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!storeId || !from || !to) {
    return NextResponse.json({ error: 'storeId, from, to required' }, { status: 400 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    // Fetch product-level data
    const productParams = new URLSearchParams({ storeId, from, to });
    const productRows = await rest<Array<{
      product_id: string;
      revenue: number;
      net_profit: number;
    }>>(
      `/pnl_product_performance?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${encodeURIComponent(from)}&date=lte.${encodeURIComponent(to)}&select=product_id,revenue,net_profit`
    ).catch(() => [] as Array<{ product_id: string; revenue: number; net_profit: number }>);

    let productRevenue = 0;
    let productProfit = 0;
    for (const row of productRows) {
      productRevenue += Number(row.revenue) || 0;
      productProfit += Number(row.net_profit) || 0;
    }

    // Fetch snapshot data
    const snapshotRows = await rest<Array<{
      date: string;
      revenue: number;
      net_profit: number;
    }>>(
      `/daily_pnl_snapshots?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${encodeURIComponent(from)}&date=lte.${encodeURIComponent(to)}&select=date,revenue,net_profit`
    ).catch(() => [] as Array<{ date: string; revenue: number; net_profit: number }>);

    let snapshotRevenue = 0;
    let snapshotProfit = 0;
    for (const row of snapshotRows) {
      snapshotRevenue += Number(row.revenue) || 0;
      snapshotProfit += Number(row.net_profit) || 0;
    }

    // Calculate divergence
    const baseRevenue = Math.max(snapshotRevenue, productRevenue, 1);
    const revenueDivergence = Math.abs(snapshotRevenue - productRevenue) / baseRevenue * 100;

    const baseProfit = Math.max(Math.abs(snapshotProfit), Math.abs(productProfit), 1);
    const profitDivergence = Math.abs(snapshotProfit - productProfit) / baseProfit * 100;

    const hasIssue = revenueDivergence > 1 || profitDivergence > 1;

    if (hasIssue) {
      const message = `P&L consistency divergence (${from} to ${to}): ` +
        `Revenue: product=$${productRevenue.toFixed(2)} vs snapshot=$${snapshotRevenue.toFixed(2)} (${revenueDivergence.toFixed(1)}% diff), ` +
        `Profit: product=$${productProfit.toFixed(2)} vs snapshot=$${snapshotProfit.toFixed(2)} (${profitDivergence.toFixed(1)}% diff)`;
      await logStoreError(storeId, 'pnl_consistency', message, 'Review P&L data sources');
    }

    return NextResponse.json({
      ok: true,
      storeId,
      range: { from, to },
      product: {
        revenue: productRevenue,
        netProfit: productProfit,
        rowCount: productRows.length,
      },
      snapshot: {
        revenue: snapshotRevenue,
        netProfit: snapshotProfit,
        rowCount: snapshotRows.length,
      },
      divergence: {
        revenuePercent: Math.round(revenueDivergence * 10) / 10,
        profitPercent: Math.round(profitDivergence * 10) / 10,
        hasIssue,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
