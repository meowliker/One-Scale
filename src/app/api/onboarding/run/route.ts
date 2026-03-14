import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { onStoreConnected } from '@/lib/onboarding/orchestrator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/onboarding/run
 * Body: { storeId: string }
 *
 * Runs the full onboarding pipeline for a store.
 * Cursor-based and resumable — safe to call multiple times.
 */
export async function POST(request: NextRequest) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { storeId } = await request.json();
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    await onStoreConnected(storeId);
    return NextResponse.json({ ok: true, storeId, status: 'complete' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[PRISM:Onboarding] Failed for ${storeId}:`, msg);
    return NextResponse.json({ ok: false, storeId, status: 'partial', error: msg }, { status: 500 });
  }
}
