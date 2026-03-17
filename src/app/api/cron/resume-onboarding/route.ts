import { NextRequest, NextResponse } from 'next/server';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { onStoreConnected } from '@/lib/onboarding/orchestrator';
import type { OnboardingProgress } from '@/lib/onboarding/orchestrator';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/resume-onboarding
 *
 * Runs every 10 minutes. Finds stores with stalled onboarding
 * (status = 'in_progress' or 'partial', last activity > 5 min ago)
 * and resumes them. Cursor-based stages pick up where they left off.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  // Find stores with incomplete onboarding that haven't had activity in 5+ minutes
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const stalled = await rest<OnboardingProgress[]>(
    `/onboarding_progress?overall_status=in.(in_progress,partial)` +
    `&last_activity_at=lt.${fiveMinAgo}` +
    `&select=store_id,overall_status,last_activity_at`,
  ).catch(() => []);

  const results: Array<{ storeId: string; status: string; error?: string }> = [];

  for (const row of stalled) {
    try {
      console.log(`[resume-onboarding] Resuming stalled onboarding for ${row.store_id}`);
      await onStoreConnected(row.store_id);
      results.push({ storeId: row.store_id, status: 'resumed' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[resume-onboarding] Failed for ${row.store_id}:`, msg);
      results.push({ storeId: row.store_id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'resume-onboarding',
    runAt: new Date().toISOString(),
    stalledCount: stalled.length,
    results,
  });
}
