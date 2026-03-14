import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { onStoreConnected, getOnboardingProgress } from '@/lib/onboarding/orchestrator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/backfill-all-stores
 * Body: { force?: boolean }
 *
 * Admin endpoint to trigger onboarding for all existing stores.
 * By default skips stores that already completed onboarding.
 * Pass force=true to re-onboard all stores.
 */
export async function POST(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const { force = false } = await request.json().catch(() => ({}));
  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; error?: string }> = [];

  for (const store of stores) {
    // Skip already-completed stores unless force=true
    if (!force) {
      const progress = await getOnboardingProgress(store.id);
      if (progress?.overall_status === 'complete') {
        results.push({ storeId: store.id, status: 'already_complete' });
        continue;
      }
    }

    try {
      console.log(`[admin/backfill] Starting onboarding for ${store.id}`);
      await onStoreConnected(store.id);
      results.push({ storeId: store.id, status: 'completed' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[admin/backfill] Failed for ${store.id}:`, msg);
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    totalStores: stores.length,
    results,
  });
}
