import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { calculatePnL } from '@/lib/pnl/universalCalculator';

/**
 * GET /api/pnl/calculate?storeId=xxx&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Universal P&L calculation endpoint.
 * Single source of truth for all P&L data.
 * Uses the universal calculator — no separate calculation logic anywhere.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('storeId');
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');
  const includeProducts = searchParams.get('products') !== 'false';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  // Default to last 30 days if no dates provided
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const from = dateFrom || thirtyDaysAgo;
  const to = dateTo || today;

  try {
    const result = await calculatePnL(storeId, from, to, {
      includeProductBreakdown: includeProducts,
    });

    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
