import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
  prunePersistentStoreMetaDataToActiveAccounts,
  rest,
} from '@/app/api/lib/supabase-persistence';
import {
  buildWarehouseDateRange,
  buildWarehouseVariantKey,
  materializeStoreMetaEntitiesFromSnapshots,
  syncWarehouseSnapshotsForStore,
} from '@/app/api/lib/meta-entity-warehouse';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const CRON_NAME = 'backfill_meta_entities';

async function logCron(
  storeId: string,
  status: 'success' | 'failed' | 'skipped',
  rowsProcessed: number,
  error: string | null,
  durationMs: number
) {
  try {
    await rest('/cron_logs', {
      method: 'POST',
      body: JSON.stringify({
        cron_name: CRON_NAME,
        store_id: storeId,
        status,
        rows_processed: rowsProcessed,
        error,
        duration_ms: durationMs,
      }),
    });
  } catch {
    // Best effort logging only
  }
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

function parseStoreIds(request: NextRequest, body: unknown): Set<string> | undefined {
  const searchIds = (request.nextUrl.searchParams.get('storeIds') || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const searchStore = request.nextUrl.searchParams.get('storeId')?.trim();

  const bodyObj = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const bodyIds = Array.isArray(bodyObj.storeIds)
    ? bodyObj.storeIds.map((id) => (typeof id === 'string' ? id.trim() : '')).filter(Boolean)
    : [];
  const bodyStore = typeof bodyObj.storeId === 'string' ? bodyObj.storeId.trim() : '';

  const ids = [
    ...searchIds,
    ...(searchStore ? [searchStore] : []),
    ...bodyIds,
    ...(bodyStore ? [bodyStore] : []),
  ];
  return ids.length > 0 ? new Set(ids) : undefined;
}

async function runBackfill(request: NextRequest, body?: unknown) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const targetStoreIds = parseStoreIds(request, body);
  const stores = await listPersistentStores();
  const selectedStores = targetStoreIds
    ? stores.filter((s) => targetStoreIds.has(s.id))
    : stores;

  const results: Array<{
    storeId: string;
    status: 'success' | 'failed' | 'skipped';
    campaigns?: number;
    adsets?: number;
    ads?: number;
    error?: string;
  }> = [];

  for (const store of selectedStores) {
    const start = Date.now();
    const activeAccounts = (store.adAccounts || []).filter(
      (a) => a.platform === 'meta' && Number(a.is_active) === 1
    );
    await prunePersistentStoreMetaDataToActiveAccounts(
      store.id,
      activeAccounts.map((a) => a.ad_account_id)
    );
    if (activeAccounts.length === 0) {
      results.push({ storeId: store.id, status: 'skipped', error: 'no_active_meta_accounts' });
      await logCron(store.id, 'skipped', 0, 'No active Meta ad accounts', Date.now() - start);
      continue;
    }

    try {
      const accountTz = activeAccounts.find((a) => a.timezone)?.timezone || 'America/New_York';
      const { since, until } = buildWarehouseDateRange(accountTz);
      const variantKey = buildWarehouseVariantKey(since, until);

      await syncWarehouseSnapshotsForStore({
        storeId: store.id,
        activeAccounts: activeAccounts.map((a) => ({
          ad_account_id: a.ad_account_id,
          ad_account_name: a.ad_account_name,
          timezone: a.timezone,
        })),
        since,
        until,
        variantKey,
      });

      const materialized = await materializeStoreMetaEntitiesFromSnapshots({
        storeId: store.id,
        activeAccounts: activeAccounts.map((a) => ({
          ad_account_id: a.ad_account_id,
          ad_account_name: a.ad_account_name,
          timezone: a.timezone,
        })),
        since,
        until,
        variantKey,
      });

      results.push({
        storeId: store.id,
        status: 'success',
        campaigns: materialized.campaigns,
        adsets: materialized.adsets,
        ads: materialized.ads,
      });

      await logCron(
        store.id,
        'success',
        materialized.campaigns + materialized.adsets + materialized.ads,
        null,
        Date.now() - start
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'backfill failed';
      results.push({ storeId: store.id, status: 'failed', error: message });
      await logCron(store.id, 'failed', 0, message, Date.now() - start);
    }
  }

  const success = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  return NextResponse.json({
    ok: failed === 0,
    operation: CRON_NAME,
    storesTotal: selectedStores.length,
    success,
    failed,
    skipped,
    results,
  });
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runBackfill(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: unknown = undefined;
  try {
    body = await request.json();
  } catch {
    body = undefined;
  }
  return runBackfill(request, body);
}
