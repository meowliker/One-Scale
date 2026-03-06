import { NextRequest, NextResponse } from 'next/server';
import { syncPnlCacheAllStores } from '@/app/api/lib/pnl-cache-sync';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET || '';
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization') || '';
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const daysRaw = searchParams.get('days');
  const days = Math.max(7, Math.min(60, Number(daysRaw || 30) || 30));

  try {
    const result = await syncPnlCacheAllStores(days);
    return NextResponse.json({
      ok: true,
      days,
      runAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to sync pnl cache';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
