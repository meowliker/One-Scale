import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { onStoreConnected, getOnboardingProgress } from '@/lib/onboarding/orchestrator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/onboard-store
 * Authorization: Bearer {CRON_SECRET}
 * Body: { storeId: string }
 *
 * Runs the full onboarding pipeline for a SINGLE store.
 * Cursor-based and resumable — safe to call multiple times.
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

  try {
    await onStoreConnected(storeId);
    const progress = await getOnboardingProgress(storeId);
    return NextResponse.json({
      ok: true,
      storeId,
      status: progress?.overall_status ?? 'complete',
      stages: progress?.stages,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const progress = await getOnboardingProgress(storeId);
    return NextResponse.json({
      ok: false,
      storeId,
      status: progress?.overall_status ?? 'partial',
      stages: progress?.stages,
      error: msg,
    }, { status: 500 });
  }
}
