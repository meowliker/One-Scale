import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { assertRefreshResult, createRefreshRunner, isTransientRefreshError, refreshError, refreshRanges, refreshStoreRange } from '../src/lib/store-overview-refresh.ts';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const helper = { assertRefreshResult, isTransientRefreshError, refreshError, refreshRanges };
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

test('Shopify failure prevents report rebuild', async () => {
  const calls = [];
  await assert.rejects(refreshStoreRange(refreshRanges('2026-10-26', '2026-10-26'), async step => {
    calls.push(step);
    if (step === 'orders') throw new Error('No Shopify connection');
  }, () => {}), /Reconnect Shopify/);
  assert.deepEqual(calls, ['orders']);
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
    '@/lib/pnl/shopifyReportingTimezone': { syncShopifyReportingTimezone: async () => 'America/Guatemala' },
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


test('Shopify-only refresh completes every batch without contacting Meta', async () => {
  const calls = [];
  const result = await refreshStoreRange(refreshRanges('2026-10-01', '2026-10-08'), async (step, range, metaSynced) => {
    calls.push([step, range.from, metaSynced]);
  }, () => {}, false);
  assert.deepEqual(calls, [
    ['orders', '2026-10-01', undefined], ['report', '2026-10-01', false],
    ['orders', '2026-10-08', undefined], ['report', '2026-10-08', false],
  ]);
  assert.deepEqual(result.warnings, []);
});

test('expired Meta never blocks Shopify reports or subsequent date batches', async () => {
  const calls = [];
  const result = await refreshStoreRange(refreshRanges('2026-10-01', '2026-10-08'), async (step, range, metaSynced) => {
    calls.push([step, range.from, metaSynced]);
    if (step === 'meta') throw new Error('Meta API: token expired');
  }, () => {}, true);
  assert.deepEqual(calls.map(call => call[0]), ['orders', 'meta', 'report', 'orders', 'report']);
  assert.ok(calls.filter(call => call[0] === 'report').every(call => call[2] === false));
  assert.match(result.warnings[0], /Reconnect Meta/);
});

test('unlinked Meta is a warning, not a Shopify failure or a successful ad sync', async () => {
  let reportMetaSynced;
  const result = await refreshStoreRange(refreshRanges('2026-10-26', '2026-10-26'), async (step, _range, metaSynced) => {
    if (step === 'meta') return { warning: 'No active Meta accounts' };
    if (step === 'report') reportMetaSynced = metaSynced;
  }, () => {}, true);
  assert.equal(reportMetaSynced, false);
  assert.deepEqual(result.warnings, ['No active Meta accounts']);
});

test('Shopify-only report saves revenue without reading Meta and persists unavailable status', async () => {
  let snapshot;
  const { GET } = loadRoute('src/app/api/cron/backfill-pnl/route.ts', {
    '@/app/api/lib/supabase-persistence': {
      isSupabasePersistenceEnabled: () => true,
      rest: async (path, init) => {
        if (init?.method === 'POST') { snapshot = JSON.parse(init.body)[0]; return; }
        if (path.startsWith('/daily_pnl_snapshots')) return [{ cogs: 10, shipping_cost: 5, ad_spend: 20 }];
        return [];
      },
    },
    '@/app/api/lib/supabase-pagination': { fetchAllRestRows: async path => {
      if (path.startsWith('/meta_spend_cache')) throw new Error('Meta reads must not block Shopify-only refresh');
      if (path.startsWith('/shopify_orders_cache')) return [{ shopify_order_id: '1', total_price: 100, financial_status: 'paid', line_items: '[]' }];
      return [];
    } },
    '@/lib/pnl/dateUtils': { getStoreDateRangeForPeriod: () => ({ start: '2026-10-26T00:00:00Z', end: '2026-10-26T23:59:59Z' }) },
    '@/lib/pnl/shopifyReportingTimezone': { syncShopifyReportingTimezone: async () => 'America/Guatemala' },
    '@/lib/pnl/orderFeeSync': { getOrderFees: async () => new Map() },
  });
  const response = await GET(new NextRequest('https://example.test/api/cron/backfill-pnl?storeId=store-1&from=2026-10-26&to=2026-10-26&feeMode=estimate&metaStatus=unavailable', { headers: { authorization: 'Bearer test-secret' } }));
  assert.equal((await response.json()).results[0].status, 'ok');
  assert.equal(snapshot.revenue, 100);
  assert.equal(snapshot.order_count, 1);
  assert.equal(snapshot.ad_spend, 20); // Keep the saved figure, but do not present it as fresh.
  assert.equal(snapshot.meta_synced, false);
  assert.equal(snapshot.shopify_synced, true);
  assert.deepEqual(JSON.parse(snapshot.warnings), ['overview_meta_unavailable']);
});

test('refresh report endpoint defaults to Shopify-only and forwards explicit Meta success', async () => {
  const route = refreshRoute({ result: { ok: true, results: [{ status: 'ok' }] } });
  assert.equal((await route.post({ step: 'report' })).status, 200);
  assert.equal(route.calls[0].nextUrl.searchParams.get('metaStatus'), 'unavailable');
  assert.equal((await route.post({ step: 'report', metaSynced: true })).status, 200);
  assert.equal(route.calls[1].nextUrl.searchParams.get('metaStatus'), 'synced');
});

const refreshInput = { storeId: 'store-1', step: 'orders', from: '2026-09-01', to: '2026-09-07' };
const success = () => Response.json({ ok: true });

test('interrupted transport and gateway errors retry, then checkpoint successful batches', async () => {
  const attempts = [], retries = [], waits = [];
  const run = createRefreshRunner(new Map(), new AbortController().signal, attempt => retries.push(attempt), async input => {
    attempts.push(input);
    if (attempts.length === 1) throw new TypeError('Failed to fetch');
    if (attempts.length === 2) return new Response('Bad gateway', { status: 502 });
    return success();
  }, async ms => waits.push(ms));
  await run(refreshInput);
  await run(refreshInput);
  assert.equal(attempts.length, 3);
  assert.deepEqual(retries, [2, 3]);
  assert.deepEqual(waits, [2000, 4000]);
});

test('retry store resumes the failed batch without repeating completed orders or reports', async () => {
  const completed = new Map(), calls = [];
  let fail = true;
  const run = createRefreshRunner(completed, new AbortController().signal, () => {}, async (_url, init) => {
    const input = JSON.parse(init.body);
    calls.push([input.step, input.from]);
    if (input.step === 'report' && input.from === '2026-09-08' && fail) {
      return Response.json({ ok: false, error: 'database unavailable', retryable: false }, { status: 502 });
    }
    return success();
  });
  const refresh = () => refreshStoreRange(refreshRanges('2026-09-01', '2026-09-08'),
    (step, range, metaSynced) => run({ storeId: 'store-1', step, ...range, metaSynced }), () => {}, false);
  await assert.rejects(refresh());
  fail = false;
  await refresh();
  assert.deepEqual(calls, [['orders', '2026-09-01'], ['report', '2026-09-01'], ['orders', '2026-09-08'], ['report', '2026-09-08'], ['report', '2026-09-08']]);
});

test('permanent failures and expired sessions are not retried or checkpointed', async () => {
  for (const response of [Response.json({ error: 'Reconnect Shopify', retryable: false }, { status: 502 }), Response.json({}, { status: 401 })]) {
    let calls = 0;
    const completed = new Map();
    const run = createRefreshRunner(completed, new AbortController().signal, () => assert.fail('Must not retry'), async () => { calls++; return response; });
    await assert.rejects(run(refreshInput), /Reconnect Shopify|session expired/);
    assert.equal(calls, 1);
    assert.equal(completed.size, 0);
  }
});

test('network retries are bounded and cancellation stops subsequent attempts', async () => {
  let calls = 0;
  const completed = new Map();
  const abort = new AbortController();
  const failedFetch = async () => { calls++; throw new TypeError('Failed to fetch'); };
  const run = createRefreshRunner(completed, abort.signal, () => {}, failedFetch, async () => {});
  await assert.rejects(run(refreshInput), /Retry store to resume/);
  assert.equal(calls, 3);
  assert.equal(completed.size, 0);
  const cancelRun = createRefreshRunner(completed, abort.signal, () => abort.abort(), failedFetch);
  await assert.rejects(cancelRun(refreshInput), { name: 'AbortError' });
  assert.equal(calls, 4);
});

test('interrupted response body is retried instead of caching an incomplete success', async () => {
  let calls = 0;
  const run = createRefreshRunner(new Map(), new AbortController().signal, () => {}, async () => {
    calls++;
    return calls === 1 ? new Response('{') : success();
  }, async () => {});
  await run(refreshInput);
  assert.equal(calls, 2);
});

test('server marks transient failures retryable and auth failures permanent', async () => {
  for (const [error, retryable] of [['Supabase statement timeout', true], ['No Shopify connection', false]]) {
    const route = refreshRoute({ result: { results: [{ status: 'error', error }] } });
    assert.equal((await (await route.post()).json()).retryable, retryable);
  }
});

const dateUtils = loadRoute('src/lib/pnl/dateUtils.ts', { 'date-fns-tz': require('date-fns-tz') });
function timezoneModule({ existing = [], shop = { iana_timezone: 'America/Guatemala', currency: 'USD' }, failSave = false } = {}) {
  const writes = [];
  const module = loadRoute('src/lib/pnl/shopifyReportingTimezone.ts', {
    '@/app/api/lib/tokens': { getShopifyToken: async () => ({ accessToken: 'test-token', shopDomain: 'example.myshopify.com' }) },
    '@/app/api/lib/shopify-client': { fetchFromShopify: async () => ({ shop }) },
    '@/app/api/lib/supabase-persistence': { rest: async (path, init) => {
      if (!init) return existing;
      if (failSave) throw new Error('Supabase save failed');
      writes.push({ path, method: init.method, body: JSON.parse(init.body) });
    } },
  });
  return { ...module, writes };
}

test('missing store config is initialized from Shopify, and existing preferences are preserved', async () => {
  const fresh = timezoneModule();
  assert.equal(await fresh.syncShopifyReportingTimezone('store-1'), 'America/Guatemala');
  assert.equal(fresh.writes[0].body.iana_timezone, 'America/Guatemala');
  assert.equal(fresh.writes[0].body.currency, 'USD');
  const existing = timezoneModule({ existing: [{ store_id: 'store-1', reporting_currency: 'EUR' }] });
  await existing.syncShopifyReportingTimezone('store-1');
  assert.equal(existing.writes[0].method, 'PATCH');
  assert.deepEqual(existing.writes[0].body, { iana_timezone: 'America/Guatemala' });
});

test('missing or invalid Shopify timezone and failed config saves stop report generation', async () => {
  for (const shop of [{ currency: 'USD' }, { iana_timezone: 'Invalid/Zone', currency: 'USD' }]) {
    const module = timezoneModule({ shop });
    await assert.rejects(module.syncShopifyReportingTimezone('store-1'), /timezone/);
    assert.equal(module.writes.length, 0);
  }
  await assert.rejects(timezoneModule({ failSave: true }).syncShopifyReportingTimezone('store-1'), /save failed/);
});

test('calendar boundaries use historical offsets and include the whole DST transition day', () => {
  const { getStoreDateRange } = dateUtils;
  assert.equal(getStoreDateRange('2026-01-15', 'America/New_York').start, '2026-01-15T05:00:00.000Z');
  assert.equal(getStoreDateRange('2026-07-15', 'America/New_York').start, '2026-07-15T04:00:00.000Z');
  for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]]) {
    const { start, end } = getStoreDateRange(date, 'America/New_York');
    assert.equal(Date.parse(end) - Date.parse(start) + 1, hours * 3600000);
  }
});

test('Acurewell regression: exclude eight previous-day orders totaling $164.04 from Today', async () => {
  const prices = [29.76, 38.71, 28.79, 21.93, 9.97, 5.97, 9.97, 18.94];
  const orders = [
    ...prices.map((total_price, i) => ({ shopify_order_id: String(i), total_price, created_at: '2026-10-25T23:00:00-06:00' })),
    ...[18.94, 4.97, 4.97].map((total_price, i) => ({ shopify_order_id: String(i + 8), total_price, created_at: '2026-10-26T01:00:00-06:00' })),
  ].map(o => ({ ...o, financial_status: 'paid', line_items: '[]' }));
  assert.equal(Number(orders.reduce((sum, o) => sum + o.total_price, 0).toFixed(2)), 192.92);
  let snapshot;
  const { GET } = loadRoute('src/app/api/cron/backfill-pnl/route.ts', {
    '@/app/api/lib/supabase-persistence': {
      isSupabasePersistenceEnabled: () => true,
      rest: async (_path, init) => { if (init?.method === 'POST') snapshot = JSON.parse(init.body)[0]; return []; },
    },
    '@/lib/pnl/shopifyReportingTimezone': timezoneModule(),
    '@/lib/pnl/dateUtils': dateUtils,
    '@/lib/pnl/orderFeeSync': { getOrderFees: async () => new Map() },
    '@/app/api/lib/supabase-pagination': { fetchAllRestRows: async path => {
      if (!path.startsWith('/shopify_orders_cache')) return [];
      const query = decodeURIComponent(path);
      const start = query.match(/created_at.gte.([^,]+)/)[1];
      const end = query.match(/created_at.lte.([^\)]+)/)[1];
      assert.equal(start, '2026-10-26T06:00:00.000Z');
      return orders.filter(o => Date.parse(o.created_at) >= Date.parse(start) && Date.parse(o.created_at) <= Date.parse(end));
    } },
  });
  const response = await GET(new NextRequest('https://example.test/api/cron/backfill-pnl?storeId=store-1&from=2026-10-26&to=2026-10-26&feeMode=estimate&metaStatus=unavailable', { headers: { authorization: 'Bearer test-secret' } }));
  assert.equal((await response.json()).results[0].status, 'ok');
  assert.equal(snapshot.order_count, 3);
  assert.equal(Number(snapshot.revenue.toFixed(2)), 28.88);
});
