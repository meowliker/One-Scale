import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// ---- Cron Log ----

async function logCron(
  cronName: string,
  storeId: string,
  status: string,
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  await rest('/cron_logs', {
    method: 'POST',
    body: JSON.stringify({
      cron_name: cronName,
      store_id: storeId,
      status,
      rows_processed: rowsProcessed,
      error,
      duration_ms: durationMs,
    }),
  });
}

// ---- Types ----

interface CleanupResult {
  table: string;
  deleted: number;
  cutoff: string;
}

// ---- Batch Delete Helper ----
// Supabase REST doesn't return count by default on DELETE.
// We use the Prefer: return=representation header to get deleted rows,
// and limit batches to avoid timeout.

async function batchDelete(
  table: string,
  filter: string,
  batchSize: number = 1000
): Promise<number> {
  let totalDeleted = 0;
  let hasMore = true;

  while (hasMore) {
    // First, count how many rows match
    const rows = await rest<Array<{ id: string }>>(
      `/${table}?${filter}&select=id&limit=${batchSize}`
    );

    if (!rows || rows.length === 0) {
      hasMore = false;
      break;
    }

    // Delete the batch by IDs
    const ids = rows.map((r) => r.id);
    const idFilter = `id=in.(${ids.map((id) => encodeURIComponent(id)).join(',')})`;

    await rest(`/${table}?${idFilter}`, {
      method: 'DELETE',
    });

    totalDeleted += ids.length;

    // If we got fewer than batchSize, we're done
    if (rows.length < batchSize) {
      hasMore = false;
    }

    // Safety: avoid infinite loop if something goes wrong
    if (totalDeleted > 100000) {
      console.warn(`[cleanup] Safety limit reached for ${table}, stopping at ${totalDeleted}`);
      break;
    }
  }

  return totalDeleted;
}

// ---- Main Handler ----

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const start = Date.now();
  const cleanupResults: CleanupResult[] = [];

  try {
    // 1. DELETE tracking_events older than 30 days
    const ninetyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const trackingDeleted = await batchDelete(
        'tracking_events',
        `occurred_at=lt.${encodeURIComponent(ninetyDaysAgo)}`
      );
      cleanupResults.push({
        table: 'tracking_events',
        deleted: trackingDeleted,
        cutoff: ninetyDaysAgo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      cleanupResults.push({
        table: 'tracking_events',
        deleted: 0,
        cutoff: `ERROR: ${message}`,
      });
    }

    // 2. DELETE capi_logs older than 30 days (where sent_at is set)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const capiDeleted = await batchDelete(
        'capi_logs',
        `sent_at=lt.${encodeURIComponent(thirtyDaysAgo)}&status=eq.sent`
      );
      cleanupResults.push({
        table: 'capi_logs',
        deleted: capiDeleted,
        cutoff: thirtyDaysAgo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      cleanupResults.push({
        table: 'capi_logs',
        deleted: 0,
        cutoff: `ERROR: ${message}`,
      });
    }

    // 3. DELETE attribution_cache older than 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    try {
      const cacheDeleted = await batchDelete(
        'attribution_cache',
        `cached_at=lt.${encodeURIComponent(twentyFourHoursAgo)}`
      );
      cleanupResults.push({
        table: 'attribution_cache',
        deleted: cacheDeleted,
        cutoff: twentyFourHoursAgo,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      cleanupResults.push({
        table: 'attribution_cache',
        deleted: 0,
        cutoff: `ERROR: ${message}`,
      });
    }

    // Log total cleanup stats
    const totalDeleted = cleanupResults.reduce((sum, r) => sum + r.deleted, 0);
    const elapsed = Date.now() - start;
    await logCron('cleanup-old-events', 'global', 'success', totalDeleted, null, elapsed);

    return NextResponse.json({
      ok: true,
      cron: 'cleanup-old-events',
      runAt: new Date().toISOString(),
      durationMs: elapsed,
      cleanup: cleanupResults,
      totalDeleted,
    });
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logCron('cleanup-old-events', 'global', 'error', 0, message, elapsed).catch(() => {});
    return NextResponse.json({
      ok: false,
      cron: 'cleanup-old-events',
      error: message,
    }, { status: 500 });
  }
}
