/**
 * PRISM — Pattern Recognition & Intelligence for Store Metrics
 * OneScale's behavioral intelligence and data infrastructure engine
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { fastTrackOnboarding } from '@/lib/onboarding/orchestrator';
import { getShopifyToken } from '@/app/api/lib/tokens';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/fast-track
 * Authorization: Bearer {CRON_SECRET}
 * Body: { storeId: string }
 *
 * Runs the PRISM fast-track for a single store:
 * fetches 30 days of orders + balance txns, classifies, builds P&L.
 * Returns timing and counts.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { storeId } = await request.json().catch(() => ({ storeId: null }));
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return NextResponse.json({ error: 'No Shopify connection for this store' }, { status: 404 });
  }

  const start = Date.now();
  try {
    const result = await fastTrackOnboarding(storeId, token.accessToken, token.shopDomain);
    return NextResponse.json({
      ok: true,
      storeId,
      ...result,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      storeId,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    }, { status: 500 });
  }
}
