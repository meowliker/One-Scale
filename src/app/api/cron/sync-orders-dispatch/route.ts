/**
 * Order Sync Dispatcher — auto-discovers all stores and triggers per-store order sync.
 * No hardcoded store IDs. New stores get picked up automatically.
 *
 * Called by pg_cron every 30 min. Dispatches one HTTP call per store.
 * For new stores with no orders, triggers a 30-day backfill.
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
  const results: Array<{ storeId: string; action: string }> = [];

  for (const store of stores) {
    try {
      // Check if store has recent orders
      const latest = await rest<Array<{ synced_at: string }>>(
        `/shopify_orders_cache?store_id=eq.${enc(store.id)}&select=synced_at&order=synced_at.desc&limit=1`
      ).catch(() => []);

      let params = `store_id=${enc(store.id)}`;
      if (latest.length === 0) {
        // New store — backfill 30 days
        params += '&days=30';
        results.push({ storeId: store.id, action: 'backfill-30d' });
      } else {
        results.push({ storeId: store.id, action: 'incremental' });
      }

      // Fire-and-forget per store
      fetch(`${baseUrl}/api/cron/sync-shopify-orders?${params}`, {
        headers: { Authorization: `Bearer ${secret}` },
      }).catch(() => null);

      // Stagger by 1s
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch {
      results.push({ storeId: store.id, action: 'error' });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'sync-orders-dispatch',
    runAt: new Date().toISOString(),
    results,
  });
}
