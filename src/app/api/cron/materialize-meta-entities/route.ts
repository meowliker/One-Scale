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

const CRON_NAME = 'materialize_meta_entities';

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

async function runMaterializerForStores(storeIds?: Set<string>) {
  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const selectedStores = storeIds
    ? stores.filter((s) => storeIds.has(s.id))
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
      const message = err instanceof Error ? err.message : 'materialization failed';
      results.push({ storeId: store.id, status: 'failed', error: message });
      await logCron(store.id, 'failed', 0, message, Date.now() - start);
    }
  }

  const success = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;

  return NextResponse.json({
    ok: failed === 0,
    cron: CRON_NAME,
    storesTotal: selectedStores.length,
    success,
    failed,
    skipped,
    results,
  });
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return request.headers.get('authorization') === `Bearer ${expected}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runMaterializerForStores();
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let storeIds: Set<string> | undefined;
  try {
    const body = await request.json() as { storeIds?: string[]; storeId?: string };
    const ids = [
      ...(Array.isArray(body.storeIds) ? body.storeIds : []),
      ...(typeof body.storeId === 'string' ? [body.storeId] : []),
    ].map((id) => id.trim()).filter(Boolean);
    if (ids.length > 0) {
      storeIds = new Set(ids);
    }
  } catch {
    // Ignore parse errors and run all stores
  }

  return runMaterializerForStores(storeIds);
}
