/**
 * Daily P&L Dispatcher — auto-discovers all stores and triggers per-store P&L snapshots.
 * No hardcoded store IDs. New stores get picked up automatically.
 *
 * Called by pg_cron once daily. Dispatches one HTTP call per store to the
 * daily-pnl-snapshot route with ?store_id= to stay within Vercel's 60s limit.
 *
 * Also handles first-time backfill: if a store has < 7 days of snapshots,
 * triggers a 30-day backfill for that store.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const enc = (v: string) => encodeURIComponent(v);

// pg_cron uses net.http_post — accept both GET and POST
export async function POST(req: NextRequest) { return GET(req); }

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const baseUrl = new URL(req.url).origin;
  const secret = process.env.CRON_SECRET!;
  const results: Array<{ storeId: string; action: string; status: string }> = [];

  for (const store of stores) {
    try {
      // Check how many snapshot days this store has
      const snapshots = await rest<Array<{ date: string }>>(
        `/daily_pnl_snapshots?store_id=eq.${enc(store.id)}&select=date&order=date.desc&limit=30`
      ).catch(() => []);

      // New store or incomplete data → 30-day backfill
      const days = snapshots.length < 7 ? 30 : 7;
      const action = days === 30 ? 'backfill-30d' : 'daily-7d';

      // Fire-and-forget: dispatch to per-store P&L endpoint
      // Don't await — let each store process independently
      fetch(`${baseUrl}/api/cron/daily-pnl-snapshot?store_id=${enc(store.id)}&days=${days}`, {
        headers: { Authorization: `Bearer ${secret}` },
      }).catch(() => null);

      results.push({ storeId: store.id, action, status: 'dispatched' });

      // Stagger dispatches by 2s to avoid overwhelming Vercel
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (err) {
      results.push({ storeId: store.id, action: 'error', status: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'daily-pnl-dispatch',
    runAt: new Date().toISOString(),
    storesDispatched: results.length,
    results,
  });
}
