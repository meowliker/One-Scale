import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getStoreIntelligence, refreshHealthScore } from '@/lib/intelligence/storeIntelligence';
import { getCogsCoverage } from '@/lib/intelligence/cogsIntelligence';

/**
 * GET /api/intelligence/health?storeId=xxx
 *
 * Get store health score and breakdown.
 */
export async function GET(request: NextRequest) {
  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const intel = await getStoreIntelligence(storeId);
    const cogsCoverage = await getCogsCoverage(storeId);

    return NextResponse.json({
      healthScore: intel?.health_score || 0,
      healthBreakdown: intel?.health_breakdown || {},
      initStatus: intel?.init_status || 'pending',
      cogsCoverage,
      productCount: intel?.product_count || 0,
      isInitialized: intel?.init_status === 'complete',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/intelligence/health
 *
 * Recalculate health score without full re-init.
 * Body: { storeId: string }
 */
export async function POST(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const body = await request.json() as { storeId?: string };
  if (!body.storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const score = await refreshHealthScore(body.storeId);
    return NextResponse.json({ healthScore: score });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
