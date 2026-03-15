/**
 * Cron: Compute Ad Attribution
 * Runs PRISM ad attribution engine for all stores, then signal scoring.
 * Designed to run weekly or after Meta sync.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isSupabasePersistenceEnabled, listPersistentStores } from '@/app/api/lib/supabase-persistence';
import { computeAdAttributions } from '@/lib/prism/adAttribution';
import { computeAllSignals } from '@/lib/prism/signalScorer';
import { getMetaToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  const requestedStoreId = new URL(request.url).searchParams.get('storeId');
  const stores = requestedStoreId
    ? [{ id: requestedStoreId, name: requestedStoreId }]
    : await listPersistentStores();

  const results: Array<{
    store: string;
    attribution: { attributed: number; unattributed: number; by_method: Record<string, number> };
    signals: { products_scored: number; signals_available: number };
    error?: string;
  }> = [];

  for (const store of stores) {
    try {
      // Get Meta token for creative URL detection
      let metaToken: string | undefined;
      try {
        const tokenResult = await getMetaToken(store.id);
        metaToken = tokenResult?.accessToken;
      } catch { /* no Meta connection */ }

      // Step 1: Compute ad attributions
      const attribution = await computeAdAttributions(store.id, metaToken);

      // Step 2: Compute signal scores
      const signals = await computeAllSignals(store.id);

      results.push({
        store: store.name,
        attribution: {
          attributed: attribution.attributed,
          unattributed: attribution.unattributed,
          by_method: attribution.by_method,
        },
        signals: {
          products_scored: signals.products_scored,
          signals_available: signals.signals_available,
        },
      });
    } catch (err) {
      results.push({
        store: store.name,
        attribution: { attributed: 0, unattributed: 0, by_method: {} },
        signals: { products_scored: 0, signals_available: 0 },
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return NextResponse.json({
    run_at: new Date().toISOString(),
    stores_processed: results.length,
    results,
  });
}
