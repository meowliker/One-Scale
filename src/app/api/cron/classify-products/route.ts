import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { classifyAllProducts } from '@/lib/intelligence/classificationRouter';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_NAME = 'classify-products';

async function logCron(
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number,
) {
  try {
    await rest('/cron_logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cron_name: CRON_NAME,
        store_id: storeId,
        status,
        rows_processed: rowsProcessed,
        error,
        duration_ms: durationMs,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* don't let logging failures break the cron */ }
}

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; status: string; classified?: number; needsReview?: number; error?: string }> = [];

  for (const store of stores) {
    const start = Date.now();
    try {
      // Check if re-classification is due
      const intel = await rest<Array<{ store_type_detected_at: string; created_at: string }>>(
        `/store_intelligence?store_id=eq.${encodeURIComponent(store.id)}&select=store_type_detected_at,created_at`
      ).catch(() => []);

      const row = intel[0];
      if (row?.store_type_detected_at) {
        const lastRun = new Date(row.store_type_detected_at).getTime();
        const storeAge = Date.now() - new Date(row.created_at).getTime();
        const isYoung = storeAge < 90 * 86400000; // < 90 days
        const interval = isYoung ? 7 * 86400000 : 30 * 86400000;
        if (Date.now() - lastRun < interval) {
          results.push({ storeId: store.id, status: 'skipped' });
          continue;
        }
      }

      const result = await classifyAllProducts(store.id);
      await logCron(store.id, 'completed', result.classified, null, Date.now() - start);
      results.push({
        storeId: store.id,
        status: 'completed',
        classified: result.classified,
        needsReview: result.needsReview,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      await logCron(store.id, 'failed', 0, msg, Date.now() - start);
      results.push({ storeId: store.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({ ok: true, results });
}
