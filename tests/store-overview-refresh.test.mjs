import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { assertRefreshResult, refreshError, refreshRanges, refreshStoreRange } from '../src/lib/store-overview-refresh.ts';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const helper = { assertRefreshResult, refreshError, refreshRanges };
function loadRoute(file, modules) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: name => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === '@/lib/store-overview-refresh') return helper;
    if (name in modules) return modules[name];
    throw new Error(`Unexpected dependency: ${name}`);
  }, process: { env: { CRON_SECRET: 'test-secret' } }, URL, URLSearchParams, Response, console });
  return exports;
}
function refreshRoute({ authenticated = true, allowed = ['store-1'], result = { ok: true, results: [{ status: 'success' }] } } = {}) {
  const calls = [];
  const handler = async req => { calls.push(req); return NextResponse.json(result); };
  const route = loadRoute('src/app/api/dashboard/store-overview/refresh/route.ts', {
    '@/lib/auth/request-session': { readSessionFromRequest: async () => ({ authenticated, legacy: false, workspaceId: 'workspace-1' }) },
    '@/app/api/lib/auth-users': { listStoreIdsForWorkspace: async () => allowed },
    '@/app/api/lib/supabase-persistence': {
      isSupabasePersistenceEnabled: () => true,
      getPersistentStore: async () => ({ id: 'store-1' }),
      listPersistentStoreAdAccounts: async () => [{ is_active: 1, platform: 'meta' }],
    },
    '@/app/api/cron/sync-shopify-orders/route': { GET: handler },
    '@/app/api/cron/sync-meta-spend/route': { GET: handler },
    '@/app/api/cron/backfill-pnl/route': { GET: handler },
  });
  return { calls, post: (body = {}) => route.POST(new NextRequest('https://example.test/api/dashboard/store-overview/refresh', {
    method: 'POST', body: JSON.stringify({ storeId: 'store-1', from: '2026-10-01', to: '2026-10-07', step: 'orders', ...body }),
  })) };
}

test('date batches cover a full month with no gaps or overlap', () => {
  assert.deepEqual(refreshRanges('2026-09-01', '2026-09-30'), [
    { from: '2026-09-01', to: '2026-09-07' }, { from: '2026-09-08', to: '2026-09-14' },
    { from: '2026-09-15', to: '2026-09-21' }, { from: '2026-09-22', to: '2026-09-28' },
    { from: '2026-09-29', to: '2026-09-30' },
  ]);
  for (const range of [['2026-02-30', '2026-03-01'], ['2026-10-02', '2026-10-01'], ['2026-01-01', '2026-10-01']]) {
    assert.throws(() => refreshRanges(...range));
  }
});

test('successful zero-row sync counts as complete; skipped, empty and partial failure do not', () => {
  assert.doesNotThrow(() => assertRefreshResult({ ok: true, results: [{ status: 'success', rows: 0 }] }, true));
  for (const body of [
    { ok: true, results: [] }, { ok: true, results: [{ status: 'skipped', error: 'No Shopify connection' }] },
    { ok: true, results: [{ status: 'ok' }, { status: 'error: Supabase timeout' }] }, { ok: false },
  ]) assert.throws(() => assertRefreshResult(body, true));
});

test('report rebuild follows successful source syncs for each date batch', async () => {
  const calls = [];
  await refreshStoreRange(refreshRanges('2026-10-01', '2026-10-08'), async (step, range) => calls.push([step, range.from]), () => {});
  assert.deepEqual(calls, [['orders', '2026-10-01'], ['meta', '2026-10-01'], ['report', '2026-10-01'], ['orders', '2026-10-08'], ['meta', '2026-10-08'], ['report', '2026-10-08']]);
});

test('failed source prevents a fresh report while still checking the other source', async () => {
  const calls = [];
  await assert.rejects(refreshStoreRange(refreshRanges('2026-10-26', '2026-10-26'), async step => {
    calls.push(step);
    if (step === 'orders') throw new Error('No Shopify connection');
  }, () => {}), /Reconnect Shopify/);
  assert.deepEqual(calls, ['orders', 'meta']);
});

test('errors are actionable and raw HTML/token values are not exposed', () => {
  assert.match(refreshError('Meta API: Error validating access token: Session has expired'), /Reconnect Meta/);
  assert.match(refreshError('Supabase request failed (520): <!DOCTYPE html>long error page'), /database/);
  assert.doesNotMatch(refreshError('<html>bad gateway</html>'), /html/);
  assert.doesNotMatch(refreshError('Oops access_token=supersecret'), /supersecret/);
  assert.match(refreshError('Task timed out after 300 seconds'), /smaller date range/);
});

test('refresh endpoint rejects unauthenticated and cross-workspace requests before syncing', async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ allowed: [] }, 403]]) {
    const route = refreshRoute(options);
    assert.equal((await route.post()).status, status);
    assert.equal(route.calls.length, 0);
  }
});

test('refresh endpoint validates dates and forwards only the selected store and batch', async () => {
  const route = refreshRoute();
  assert.equal((await route.post({ to: '2026-10-08' })).status, 400);
  assert.equal((await route.post({ from: '2026-02-30' })).status, 400);
  assert.equal((await route.post({ step: 'unknown' })).status, 400);
  assert.equal(route.calls.length, 0);
  assert.equal((await route.post()).status, 200);
  assert.equal(route.calls[0].nextUrl.searchParams.get('store_id'), 'store-1');
  assert.equal(route.calls[0].nextUrl.searchParams.get('from'), '2026-10-01');
});

test('HTTP 200 cron failures become visible refresh errors', async () => {
  const route = refreshRoute({ result: { ok: true, results: [{ status: 'error', error: 'Meta API: Session has expired; token invalid' }] } });
  const response = await route.post({ step: 'meta' });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Reconnect Meta/);
});

test('failed report reads never write zero snapshots over existing data', async () => {
  const writes = [];
  const { GET } = loadRoute('src/app/api/cron/backfill-pnl/route.ts', {
    '@/app/api/lib/supabase-persistence': {
      isSupabasePersistenceEnabled: () => true,
      rest: async (path, init) => { if (init?.method === 'POST') writes.push(path); return []; },
    },
    '@/app/api/lib/supabase-pagination': { fetchAllRestRows: async () => { throw new Error('Supabase timeout'); } },
    '@/lib/pnl/dateUtils': { getStoreDateRangeForPeriod: () => ({ start: '2026-10-26T00:00:00Z', end: '2026-10-26T23:59:59Z' }) },
    '@/lib/pnl/orderFeeSync': { getOrderFees: async () => new Map() },
  });
  const response = await GET(new NextRequest('https://example.test/api/cron/backfill-pnl?storeId=store-1&from=2026-10-26&to=2026-10-26&feeMode=estimate', { headers: { authorization: 'Bearer test-secret' } }));
  assert.match((await response.json()).results[0].status, /error/);
  assert.equal(writes.length, 0);
});

test('manual Meta refresh uses historical dates and follows every page', async () => {
  const calls = [];
  const saved = [];
  const account = { ad_account_id: 'act_123', is_active: 1, timezone: 'America/New_York' };
  const { GET } = loadRoute('src/app/api/cron/sync-meta-spend/route.ts', {
    '@/app/api/lib/supabase-persistence': {
      isSupabasePersistenceEnabled: () => true,
      listPersistentStores: async () => [{ id: 'store-1', adAccounts: [account] }],
      listPersistentStoreAdAccounts: async () => [account],
      getPersistentConnection: async () => ({ access_token: 'test-token' }),
      logStoreError: async () => {},
      rest: async (path, init) => { if (path.startsWith('/meta_spend_cache')) saved.push(...JSON.parse(init.body)); },
    },
    '@/lib/timezone': { todayInTimezone: () => '2026-10-26', daysAgoInTimezone: () => '2026-10-25' },
    '@/app/api/lib/meta-client': { fetchFromMeta: async (_token, path, params) => {
      if (path === '/me/adaccounts') return { data: [] };
      calls.push(params);
      return { data: [{ ad_id: params.after ? 'ad-2' : 'ad-1', date_start: '2026-09-01', spend: '12.50', clicks: '2', impressions: '100' }],
        ...(params.after ? {} : { paging: { next: 'next-page', cursors: { after: 'cursor-2' } } }) };
    } },
  });
  const response = await GET(new NextRequest('https://example.test/api/cron/sync-meta-spend?store_id=store-1&from=2026-09-01&to=2026-09-07', { headers: { authorization: 'Bearer test-secret' } }));
  assert.equal((await response.json()).results[0].status, 'success');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].time_range, JSON.stringify({ since: '2026-09-01', until: '2026-09-07' }));
  assert.equal(calls[1].after, 'cursor-2');
  assert.deepEqual(saved.map(row => row.ad_id), ['ad-1', 'ad-2']);
});
