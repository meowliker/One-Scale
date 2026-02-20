import { NextRequest, NextResponse } from 'next/server';
import { getTrackingAttributionCoverage } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { getPersistentTrackingAttributionCoverage } from '@/app/api/lib/supabase-tracking';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function clampDays(raw: string | null): number {
  const parsed = Number(raw ?? '7');
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(30, Math.floor(parsed)));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const days = clampDays(searchParams.get('days'));
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const sb = isSupabasePersistenceEnabled();
    const coverage = sb
      ? await getPersistentTrackingAttributionCoverage(storeId, sinceIso, untilIso)
      : getTrackingAttributionCoverage(storeId, sinceIso, untilIso);
    const percent =
      coverage.total_purchases > 0
        ? Math.round((coverage.mapped_purchases / coverage.total_purchases) * 10000) / 100
        : 0;

    return NextResponse.json(
      {
        data: {
          windowDays: days,
          sinceIso,
          untilIso,
          percent,
          ...coverage,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load attribution coverage';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
