import { NextRequest, NextResponse } from 'next/server';
import {
  isSupabasePersistenceEnabled,
  listPersistentStores,
  rest,
} from '@/app/api/lib/supabase-persistence';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const enc = (value: string) => encodeURIComponent(value);

type ClickUpTokenRow = {
  store_id: string;
};

type ClickUpProfileRow = {
  store_id: string;
  id: string;
  clickup_list_id: string | null;
};

type RefreshResult = {
  storeId: string;
  status: 'synced' | 'skipped' | 'failed';
  creativeCount?: number;
  syncedAt?: string | null;
  reason?: string;
};

export async function POST(request: NextRequest) {
  return GET(request);
}

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const startedAt = Date.now();
  const [stores, clickupTokens, clickupProfiles] = await Promise.all([
    listPersistentStores(),
    rest<ClickUpTokenRow[]>('/third_party_tokens?platform=eq.clickup&select=store_id'),
    rest<ClickUpProfileRow[]>('/product_profiles?clickup_list_id=not.is.null&select=store_id,id,clickup_list_id'),
  ]);

  const connectedStoreIds = new Set(clickupTokens.map((row) => row.store_id));
  const configuredStoreIds = new Set(clickupProfiles.map((row) => row.store_id));
  const targetStores = stores.filter(
    (store) => connectedStoreIds.has(store.id) && configuredStoreIds.has(store.id),
  );

  const baseUrl = new URL(request.url).origin;
  const results: RefreshResult[] = [];

  for (const store of stores) {
    if (!connectedStoreIds.has(store.id)) {
      results.push({ storeId: store.id, status: 'skipped', reason: 'ClickUp not connected' });
      continue;
    }
    if (!configuredStoreIds.has(store.id)) {
      results.push({ storeId: store.id, status: 'skipped', reason: 'No ClickUp list configured' });
      continue;
    }
  }

  for (const store of targetStores) {
    try {
      const response = await fetch(
        `${baseUrl}/api/creative-hub/inbox/sync?storeId=${enc(store.id)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ storeId: store.id, source: 'cron' }),
          cache: 'no-store',
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        creatives?: unknown[];
        syncedAt?: string;
        lastSyncedAt?: string;
        cacheMeta?: { lastSyncedAt?: string | null };
        error?: string;
        notConnected?: boolean;
        notConfigured?: boolean;
      };

      if (!response.ok || payload.error) {
        results.push({
          storeId: store.id,
          status: 'failed',
          reason: payload.error || `HTTP ${response.status}`,
        });
      } else if (payload.notConnected || payload.notConfigured) {
        results.push({
          storeId: store.id,
          status: 'skipped',
          reason: payload.notConnected ? 'ClickUp not connected' : 'No ClickUp list configured',
        });
      } else {
        results.push({
          storeId: store.id,
          status: 'synced',
          creativeCount: payload.creatives?.length ?? 0,
          syncedAt: payload.syncedAt || payload.lastSyncedAt || payload.cacheMeta?.lastSyncedAt || null,
        });
      }
    } catch (err) {
      results.push({
        storeId: store.id,
        status: 'failed',
        reason: err instanceof Error ? err.message : 'ClickUp refresh failed',
      });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'refresh-clickup',
    runAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    syncedStores: results.filter((result) => result.status === 'synced').length,
    skippedStores: results.filter((result) => result.status === 'skipped').length,
    failedStores: results.filter((result) => result.status === 'failed').length,
    results,
  });
}
