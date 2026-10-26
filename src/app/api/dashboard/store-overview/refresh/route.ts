import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { listStoreIdsForWorkspace } from '@/app/api/lib/auth-users';
import { getPersistentStore, isSupabasePersistenceEnabled, listPersistentStoreAdAccounts } from '@/app/api/lib/supabase-persistence';
import { GET as syncOrders } from '@/app/api/cron/sync-shopify-orders/route';
import { GET as syncMeta } from '@/app/api/cron/sync-meta-spend/route';
import { GET as rebuildReport } from '@/app/api/cron/backfill-pnl/route';
import { assertRefreshResult, isTransientRefreshError, refreshError, refreshRanges } from '@/lib/store-overview-refresh';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let context: Record<string, string> = {};
  try {
    const session = await readSessionFromRequest(request);
    if (!session.authenticated) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || typeof body.storeId !== 'string' || typeof body.from !== 'string' || typeof body.to !== 'string'
      || !['orders', 'meta', 'report'].includes(body.step)) {
      return NextResponse.json({ error: 'Store, dates and sync step are required.' }, { status: 400 });
    }
    const { storeId, from, to, step } = body;
    context = { storeId, from, to, step };
    try {
      if (refreshRanges(from, to).length !== 1) throw new Error('Each sync batch must be at most 7 days.');
    } catch (error) {
      return NextResponse.json({ error: refreshError(error) }, { status: 400 });
    }
    if (!session.legacy) {
      const allowed = session.workspaceId ? await listStoreIdsForWorkspace(session.workspaceId) : [];
      if (!allowed.includes(storeId)) return NextResponse.json({ error: 'Store access denied.' }, { status: 403 });
    }
    if (!isSupabasePersistenceEnabled() || !process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Store sync is not configured on this server.', retryable: false }, { status: 503 });
    }
    if (!await getPersistentStore(storeId)) return NextResponse.json({ error: 'Store not found.' }, { status: 404 });
    if (step === 'meta') {
      const accounts = await listPersistentStoreAdAccounts(storeId);
      if (!accounts.some(account => (account.platform || 'meta') === 'meta' && Number(account.is_active) === 1)) {
        return NextResponse.json({ ok: true, warning: 'No active Meta ad accounts linked; ad spend was not synced.' });
      }
    }
    const path = step === 'orders' ? 'sync-shopify-orders' : step === 'meta' ? 'sync-meta-spend' : 'backfill-pnl';
    // Call the shared handlers in-process: no fire-and-forget or nested HTTP timeout.
    const url = new URL(`/api/cron/${path}`, request.url);
    url.search = new URLSearchParams({ store_id: storeId, storeId, from, to, feeMode: 'estimate' }).toString();
    if (step === 'report') url.searchParams.set('metaStatus', body.metaSynced === true ? 'synced' : 'unavailable');
    const internal = new NextRequest(url, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const handler = step === 'orders' ? syncOrders : step === 'meta' ? syncMeta : rebuildReport;
    const response = await handler(internal);
    const result = await response.json().catch(() => ({ error: `Sync failed (HTTP ${response.status}).` }));
    assertRefreshResult(result, response.ok);
    console.info('store-overview-refresh', { ...context, status: 'success', durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, step, storeId, from, to });
  } catch (error) {
    const message = refreshError(error);
    const retryable = isTransientRefreshError(error);
    console.error('store-overview-refresh', { ...context, status: 'error', durationMs: Date.now() - startedAt, error: message, retryable });
    return NextResponse.json({ ok: false, error: message, retryable }, { status: 502 });
  }
}
