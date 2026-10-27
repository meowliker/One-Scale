import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as sheet from "../src/lib/profit-sheet.ts";
const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const saved = {
  adAccountId: "act_123",
  name: "Account",
  currency: "USD",
  timezone: "America/Guatemala",
  accessToken: "meta-secret",
  hasToken: true,
  active: false,
  start: "2026-10-25T10:00",
  end: "2026-10-26T12:00",
};
function route({
  authenticated = true,
  allowed = ["store-1"],
  metaError = null,
  role = "owner",
  accounts = [saved],
  paging = false,
  storageError = false,
} = {}) {
  const calls = [];
  const writes = [];
  const dependencies = {
    "@/app/api/lib/tokens": {getMetaToken: async()=>({accessToken:"integration-secret"})},
    "next/server": { NextRequest, NextResponse },
    "date-fns-tz": require("date-fns-tz"),
    "@/lib/profit-sheet": sheet,
    "@/lib/auth/request-session": {
      readSessionFromRequest: async () => ({
        authenticated,
        legacy: false,
        workspaceId: "w",
        role,
      }),
    },
    "@/app/api/lib/auth-users": {
      listStoreIdsForWorkspace: async () => allowed,
    },
    "@/app/api/lib/profit-sheet-storage": {
      loadSheetAccounts: async () => {
        if (storageError) throw new Error("private storage error");
        return accounts;
      },
      publicSheetAccounts: (accounts) =>
        accounts.map(({ accessToken, ...a }) => ({
          ...a,
          hasToken: !!accessToken,
        })),
      saveSheetAccounts: async (...args) => writes.push(args),
    },
    "@/app/api/lib/meta-client": {
      fetchFromMeta: async (token, endpoint, params) => {
        calls.push({ token, endpoint, params });
        if (metaError) throw new Error(metaError);
        if (!endpoint.endsWith("/insights"))
          return {
            name: "Verified account",
            currency: "USD",
            timezone_name: "America/Guatemala",
          };
        return {
          data: [
            {
              date_start: "2026-10-25",
              hourly_stats_aggregated_by_advertiser_time_zone:
                "09:00:00 - 09:59:59",
              spend: "100",
            },
            {
              date_start: "2026-10-25",
              hourly_stats_aggregated_by_advertiser_time_zone:
                "10:00:00 - 10:59:59",
              spend: "12",
              clicks: "3",
              inline_link_clicks: "2",
              actions: [
                { action_type: "purchase", value: "1" },
                { action_type: "omni_purchase", value: "1" },
              ],
            },
            {
              date_start: "2026-10-26",
              hourly_stats_aggregated_by_advertiser_time_zone:
                "11:00:00 - 11:59:59",
              spend: "4",
              impressions: "100",
            },
            {
              date_start: "2026-10-26",
              hourly_stats_aggregated_by_advertiser_time_zone:
                "12:00:00 - 12:59:59",
              spend: "200",
            },
          ],
          ...(paging
            ? {
                paging: {
                  next: "https://untrusted.test",
                  cursors: { after: "cursor" },
                },
              }
            : {}),
        };
      },
    },
  };
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/app/api/profit-sheet/route.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      Error,
      Date: class extends Date {
        constructor(...args) {
          super(...(args.length ? args : ["2026-11-01T12:00:00Z"]));
        }
      },
      require: (name) => dependencies[name],
    },
  );
  const call = (method, body) =>
    exports[method](
      new NextRequest("https://example.test/api/profit-sheet?storeId=store-1", {
        method,
        ...(method === "GET"
          ? {}
          : { body: JSON.stringify({ storeId: "store-1", ...body }) }),
      }),
    );
  return {
    calls,
    writes,
    get: () => call("GET"),
    post: (body = {}) => call("POST", { adAccountId: "act_123", ...body }),
    put: (entries = [saved]) => call("PUT", { accounts: entries }),
  };
}

test("all endpoints enforce session and store access", async () => {
  for (const [options, status] of [
    [{ authenticated: false }, 401],
    [{ allowed: [] }, 403],
  ]) {
    const r = route(options);
    for (const call of [r.get, r.post, r.put])
      assert.equal((await call()).status, status);
    assert.equal(r.calls.length, 0);
    assert.equal(r.writes.length, 0);
  }
});
test("stored tokens are never returned to the browser", async () => {
  const result = await (await route().get()).json();
  assert.equal(result.accounts.length, 1);
  assert.equal(result.accounts[0].hasToken, true);
  assert.ok(!JSON.stringify(result).includes("meta-secret"));
});
test("hourly Meta figures respect inclusive start and exclusive end", async () => {
  const r = route();
  const response = await r.post();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(result.rows, [
    {
      date: "2026-10-25",
      spend: 12,
      clicks: 3,
      impressions: 0,
      purchases: 1,
      linkClicks: 2,
    },
    {
      date: "2026-10-26",
      spend: 4,
      clicks: 0,
      impressions: 100,
      purchases: 0,
      linkClicks: 0,
    },
  ]);
  assert.equal(
    r.calls[0].params.breakdowns,
    "hourly_stats_aggregated_by_advertiser_time_zone",
  );
  assert.equal(r.calls[0].token, "meta-secret");
  assert.equal(r.calls[0].endpoint, "/act_123/insights");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
test("pagination only forwards a cursor to the trusted account endpoint", async () => {
  const r = route({ paging: true });
  const result = await (await r.post()).json();
  assert.equal(result.after, "cursor");
  assert.equal(r.calls.length, 1);
  assert.ok(!JSON.stringify(result).includes("untrusted"));
});
test("multiple active accounts save together and blank tokens retain existing credentials", async () => {
  const r = route();
  const response = await r.put([
    { ...saved, accessToken: "", active: true },
    {
      ...saved,
      adAccountId: "456",
      active: true,
      accessToken: "second-secret",
    },
  ]);
  assert.equal(response.status, 200);
  const persisted = r.writes[0][1];
  assert.equal(persisted.length, 2);
  assert.ok(persisted.every((a) => a.active && a.end === ""));
  assert.equal(persisted[0].accessToken, "meta-secret");
  assert.equal(persisted[1].adAccountId, "act_456");
  assert.equal(r.calls.length, 1);
  assert.ok(!(await response.text()).includes("secret"));
});
test("invalid ranges, duplicates, missing tokens and viewer edits cannot save", async () => {
  for (const entries of [
    [{ ...saved, start: "2026-02-30T10:00" }],
    [{ ...saved, start: "2026-10-25T10:30" }],
    [{ ...saved, end: saved.start }],
    [saved, { ...saved, adAccountId: "123" }],
    [{ ...saved, adAccountId: "456", accessToken: "" }],
  ]) {
    const r = route();
    assert.equal((await r.put(entries)).status, 400);
    assert.equal(r.writes.length, 0);
    assert.equal(r.calls.length, 0);
  }
  assert.equal((await route({ role: "viewer" }).put()).status, 403);
});
test("future active schedules return no activity without contacting Meta", async () => {
  const r = route({
    accounts: [{ ...saved, active: true, start: "2099-01-01T00:00", end: "" }],
  });
  const result = await (await r.post()).json();
  assert.deepEqual(result.rows, []);
  assert.equal(r.calls.length, 0);
});
test("long active periods are fetched in week chunks and ignore stored end", async () => {
  const r = route({
    accounts: [
      {
        ...saved,
        active: true,
        start: "2025-01-01T00:00",
        end: "2025-01-02T00:00",
      },
    ],
  });
  const result = await (await r.post()).json();
  assert.equal(result.nextFrom, "2025-01-08");
  assert.deepEqual(JSON.parse(r.calls[0].params.time_range), {
    since: "2025-01-01",
    until: "2025-01-07",
  });
});
test("foreign accounts and out-of-range cursors cannot query Meta", async () => {
  for (const body of [
    { adAccountId: "act_999" },
    { from: "2026-02-30" },
    { from: "2020-01-01" },
  ]) {
    const r = route();
    assert.equal((await r.post(body)).status, 400);
    assert.equal(r.calls.length, 0);
  }
});
test("provider and persistence failures are explicit and redact secrets", async () => {
  const response = await route({
    metaError: "OAuthException 190 access_token=meta-secret",
  }).post();
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.match(result.error, /invalid or expired/);
  assert.ok(!result.error.includes("meta-secret"));
  const storage = await route({ storageError: true }).get();
  assert.equal(storage.status, 503);
  assert.ok(!(await storage.text()).includes("private storage error"));
});

test("profit formulas match the screenshot and use Meta conversions", () => {
  const metrics = sheet.sheetMetrics({
    date: "2026-09-03",
    orders: 11,
    revenue: 211.41,
    shopifyFees: 10.73,
    otherFees: 0,
    adSpend: 234.15,
    clicks: 100,
    purchases: 3,
    linkClicks: 50,
  });
  assert.equal(metrics.profit.toFixed(2), "-33.47");
  assert.equal(metrics.aov.toFixed(8), "19.21909091");
  assert.equal(metrics.roas.toFixed(9), "0.902882767");
  assert.equal(metrics.profitPercent.toFixed(6), "-15.831796");
  assert.equal(metrics.conversionRate, 6);
});
test("unknown and zero denominators do not create fake zero metrics", () => {
  const metrics = sheet.sheetMetrics({
    date: "2026-09-03",
    orders: 0,
    revenue: 0,
    shopifyFees: 0,
    otherFees: 0,
    adSpend: null,
    clicks: 0,
    purchases: 0,
    linkClicks: 0,
  });
  assert.ok(Object.values(metrics).every((value) => value === null));
});
test("Meta hourly rows are grouped into the selected store timezone", async () => {
  const result = await (
    await route().post({ timezone: "Pacific/Auckland" })
  ).json();
  assert.equal(result.rows[0].date, "2026-10-26");
  assert.equal(result.rows[0].purchases, 1);
});
function model() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/lib/profit-sheet/model.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports, Date, Error, Set, Map, require: () => sheet },
  );
  return exports;
}
test("IST day switches exactly at 11:30 AM and has an exclusive next-day end", () => {
  const m = model();
  assert.equal(
    m.reportingDay(new Date("2026-10-26T05:59:59.999Z")),
    "2026-10-25",
  );
  assert.equal(m.reportingDay(new Date("2026-10-26T06:00:00Z")), "2026-10-26");
  const window = m.dayWindow("2026-10-26");
  assert.equal(window.start, "2026-10-26T06:00:00.000Z");
  assert.equal(window.end, "2026-10-27T06:00:00.000Z");
});
test("default and saved ranges are independent per store", () => {
  const m = model(),
    now = new Date("2026-10-26T08:00:00Z");
  assert.equal(
    m.defaultRange({ savedFrom: null, savedTo: null, endToday: true }, now)
      .from,
    "2026-10-01",
  );
  assert.equal(
    m.defaultRange(
      { savedFrom: "2026-09-15", savedTo: null, endToday: true },
      now,
    ).from,
    "2026-09-15",
  );
  assert.equal(
    m.defaultRange(
      { savedFrom: "2026-09-15", savedTo: "2026-09-30", endToday: false },
      now,
    ).to,
    "2026-09-30",
  );
});
test("shared accounts require non-overlapping campaigns and Shopify products", () => {
  const m = model();
  const p = {
    id: "a",
    name: "A",
    links: ["https://store/products/a"],
    shopifyIds: ["1"],
    assignments: [{ accountId: "act_123", campaignIds: [] }],
  };
  assert.throws(
    () =>
      m.validateProducts([p, { ...p, id: "b", shopifyIds: ["2"] }], [saved]),
    /sharing/,
  );
  assert.throws(
    () => m.validateProducts([p, { ...p, id: "b" }], [saved]),
    /only one/,
  );
  const a = {
    ...p,
    assignments: [{ accountId: "act_123", campaignIds: ["10"] }],
  };
  assert.throws(
    () =>
      m.validateProducts([a, { ...a, id: "b", shopifyIds: ["2"] }], [saved]),
    /more than one/,
  );
  assert.doesNotThrow(() =>
    m.validateProducts(
      [
        a,
        {
          ...a,
          id: "b",
          shopifyIds: ["2"],
          assignments: [{ accountId: "act_123", campaignIds: ["20"] }],
        },
      ],
      [saved],
    ),
  );
});
function aggregator() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync("src/lib/profit-sheet/aggregate.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    { exports, Map, Number, Math, require:(name)=>{if(name === "./discovery")return compiled("src/lib/profit-sheet/discovery.ts",{});throw new Error(name);} },
  );
  return exports;
}
test("mixed orders allocate product revenue without duplicating store orders or campaign spend", () => {
  const a = aggregator();
  const products = [
    {
      id: "a",
      shopifyIds: ["1"],
      assignments: [{ accountId: "act_123", campaignIds: ["10"] }],
    },
    {
      id: "b",
      shopifyIds: ["2"],
      assignments: [{ accountId: "act_123", campaignIds: ["20"] }],
    },
  ];
  const orders = [
    {
      id: 1,
      total_price: "100",
      currency: "USD",
      financial_status: "paid",
      line_items: [
        { product_id: 1, price: "30", quantity: 1 },
        { product_id: 2, price: "70", quantity: 1 },
      ],
    },
  ];
  const rows = a.aggregateOrders(
    "2026-10-26",
    orders,
    products,
    new Map([["1", 10]]),
    20,
  );
  assert.equal(rows.get("store").orders, 1);
  assert.equal(rows.get("a").revenue, 30);
  assert.equal(rows.get("b").shopifyFees, 7);
  assert.equal(rows.get("a").otherFees, 6);
  a.attachAds(
    rows,
    products,
    [
      {
        accountId: "act_123",
        campaignId: "10",
        spend: 15,
        clicks: 10,
        linkClicks: 5,
        purchases: 1,
      },
      {
        accountId: "act_123",
        campaignId: "20",
        spend: 25,
        clicks: 20,
        linkClicks: 10,
        purchases: 2,
      },
    ],
    true,
    true,
  );
  assert.equal(rows.get("store").adSpend, 40);
  assert.equal(rows.get("a").adSpend, 15);
  assert.equal(rows.get("b").adSpend, 25);
});
test("failed Meta sync stays unavailable rather than showing partial spend as a complete total", () => {
  const a = aggregator();
  const rows = a.aggregateOrders("2026-10-26", [], [], new Map(), 0);
  a.attachAds(rows, [], [], false, true);
  assert.equal(rows.get("store").adSpend, null);
});
test("hour overlap excludes outside bins and does not halve current partial-hour data", () => {
  const a = aggregator();
  const hour = Date.parse("2026-10-26T06:00:00Z");
  assert.equal(a.hourWeight(hour, hour, hour + 3600000, hour + 1800000), 1);
  assert.equal(
    a.hourWeight(hour, hour + 1800000, hour + 3600000, hour + 7200000),
    0.5,
  );
  assert.equal(
    a.hourWeight(hour, hour + 3600000, hour + 7200000, hour + 7200000),
    0,
  );
});

function compiled(path, dependencies) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(path, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      Date,
      Error,
      Set,
      Map,
      Buffer,
      structuredClone,
      Headers,
      URL,
      process,
      require: (name) => {
        if (!(name in dependencies))
          throw new Error(`Unexpected dependency ${name}`);
        return dependencies[name];
      },
    },
  );
  return exports;
}
function accessModule({
  authenticated = true,
  allowed = ["store-1"],
  role = "owner",
} = {}) {
  return compiled("src/app/api/lib/profit-sheet-access.ts", {
    "next/server": { NextRequest, NextResponse },
    "@/lib/auth/request-session": {
      readSessionFromRequest: async () => ({
        authenticated,
        workspaceId: "w",
        legacy: false,
        role,
      }),
    },
    "./auth-users": { listStoreIdsForWorkspace: async () => allowed },
  });
}
test("cached daily endpoint scopes every read to the authorized store and never calls providers", async () => {
  const reads = [];
  const api = compiled("src/app/api/profit-sheet/daily/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/lib/profit-sheet-access": accessModule(),
    "@/lib/profit-sheet/model": model(),
    "@/app/api/lib/supabase-pagination": {
      fetchAllRestRows: async (path) => {
        reads.push(path);
        return [];
      },
    },
  });
  const result = await api.GET(
    new NextRequest(
      "https://example.test/api/profit-sheet/daily?storeId=store-1&from=2026-10-01&to=2026-10-02&scope=product-1",
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(reads.length, 2);
  assert.ok(
    reads.every(
      (p) => p.includes("store_id=eq.store-1") && p.includes("order=date.asc"),
    ),
  );
  assert.match(reads[0], /scope_id=eq.product-1/);
  const denied = await api.GET(
    new NextRequest(
      "https://example.test/api/profit-sheet/daily?storeId=other-store&from=2026-10-01&to=2026-10-02",
    ),
  );
  assert.equal(denied.status, 403);
  assert.equal(reads.length, 2);
});
test("daily refresh queues only the requested day; viewer cannot enqueue or process jobs", async () => {
  const calls = [];
  function syncApi(access) {
    return compiled("src/app/api/profit-sheet/sync/route.ts", {
      "next/server": { NextRequest },
      "@/app/api/lib/profit-sheet-access": access,
      "@/lib/profit-sheet/model": model(),
      "@/app/api/lib/profit-sheet-repository": { loadConfig: async () => ({}) },
      "@/app/api/lib/profit-sheet-discovery": { queueDiscovery: async () => {} },
    "@/app/api/lib/profit-sheet-sync": {
        enqueueDays: async (...args) => calls.push(args),
        claimDay: async () => null,
        syncSheetDay: async () => {
          throw new Error("Should not process an unclaimed day");
        },
      },
    });
  }
  const req = () =>
    new NextRequest("https://example.test/api/profit-sheet/sync", {
      method: "POST",
      body: JSON.stringify({
        storeId: "store-1",
        action: "queue",
        force: true,
        from: "2026-10-24",
        to: "2026-10-24",
      }),
    });
  assert.equal(
    (await syncApi(accessModule({ role: "viewer" })).POST(req())).status,
    403,
  );
  assert.equal(calls.length, 0);
  assert.equal((await syncApi(accessModule()).POST(req())).status, 200);
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([["store-1", ["2026-10-24"], true]]),
  );
});
test("saved date ranges update only the selected store without invalidating report versions", async () => {
  const writes = [];
  const api = compiled("src/app/api/profit-sheet/config/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/lib/profit-sheet-access": accessModule(),
    "@/lib/profit-sheet/model": model(),
    "@/app/api/lib/profit-sheet-repository": {
      loadConfig: async () => ({}),
      publicConfig: (c) => c,
    },
    "@/app/api/lib/supabase-persistence": {
      rest: async (path, options) =>
        writes.push({ path, ...JSON.parse(options.body) }),
    },
  });
  const response = await api.PUT(
    new NextRequest("https://example.test/api/profit-sheet/config", {
      method: "PUT",
      body: JSON.stringify({
        storeId: "store-1",
        from: "2026-10-20",
        to: "2026-10-24",
        endToday: false,
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(writes, [
    {
      path: "/profit_sheet_stores?store_id=eq.store-1",
      saved_from: "2026-10-20",
      saved_to: "2026-10-24",
      end_today: false,
      updated_at: writes[0].updated_at,
    },
  ]);
  assert.equal(writes[0].version, undefined);
});
test("product saves resolve multiple links and verify bulk campaign selections in batches", async () => {
  const campaignIds = Array.from({ length: 575 }, (_, i) => String(900 + i));
  const providerCalls = [],
    writes = [];
  let config = {
    version: 3,
    settings: { savedFrom: null, savedTo: null, endToday: true },
    accounts: [saved],
    products: [],
  };
  const api = compiled("src/app/api/profit-sheet/products/route.ts", {
    "next/server": { NextRequest },
    crypto: require("crypto"),
    "@/app/api/lib/profit-sheet-access": accessModule(),
    "@/lib/profit-sheet/model": model(),
    "@/app/api/lib/profit-sheet-repository": {
      loadConfig: async () => config,
      publicConfig: (c) => ({ products: c.products }),
      saveConfig: async (id, c, change) => {
        writes.push({ id, change });
        config = { ...c, ...change };
      },
    },
    "@/app/api/lib/tokens": {
      getShopifyToken: async () => ({
        shopDomain: "selected-store.myshopify.com",
        accessToken: "shop-secret",
      }),
    },
    "@/app/api/lib/shopify-client": {
      fetchFromShopify: async (token, domain, path, params) => {
        providerCalls.push({ domain, path, params });
        return {
          products: [
            {
              id: params.handle === "first" ? 101 : 102,
              handle: params.handle,
            },
          ],
        };
      },
    },
    "@/app/api/lib/meta-client": {
      fetchFromMeta: async (token, path, params) => {
        providerCalls.push({ path, params });
        return {
          data: JSON.parse(params.filtering)[0].value.map((id) => ({ id })),
        };
      },
    },
  });
  const result = await api.PUT(
    new NextRequest("https://example.test/api/profit-sheet/products", {
      method: "PUT",
      body: JSON.stringify({
        storeId: "store-1",
        version: 3,
        products: [
          {
            id: "draft",
            name: "Collection",
            startDate: "2026-10-24",
            links: [
              "https://store.example/products/first",
              "https://store.example/products/second",
            ],
            assignments: [{ accountId: "act_123", campaignIds }],
          },
        ],
      }),
    }),
  );
  assert.equal(result.status, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, "store-1");
  assert.equal(writes[0].change.products[0].startDate, "2026-10-24");
  assert.equal(
    JSON.stringify(writes[0].change.products[0].shopifyIds),
    '["101","102"]',
  );
  assert.ok(
    providerCalls
      .slice(0, 2)
      .every((c) => c.domain === "selected-store.myshopify.com"),
  );
  assert.equal(providerCalls[2].path, "/act_123/campaigns");
  assert.deepEqual(
    providerCalls
      .slice(2)
      .map((c) => JSON.parse(c.params.filtering)[0].value.length),
    [200, 200, 175],
  );
  assert.equal(
    writes[0].change.products[0].assignments[0].campaignIds.length,
    575,
  );
  assert.ok(!(await result.text()).includes("secret"));
});

test("free entry product receives the matched order revenue, paid add-ons, shipping and fees", () => {
  const a = aggregator();
  const products = [
    { id: "quilting", shopifyIds: ["free-entry"], assignments: [] },
  ];
  const rows = a.aggregateOrders(
    "2026-10-24",
    [
      {
        id: 1,
        total_price: "20.82",
        current_total_price: "20.82",
        currency: "USD",
        financial_status: "paid",
        line_items: [
          { product_id: "free-entry", price: "0.00", quantity: 1 },
          { product_id: "addon", price: "14.85", quantity: 1 },
        ],
      },
    ],
    products,
    new Map([["1", 1.25]]),
    2,
  );
  assert.equal(rows.get("quilting").orders, 1);
  assert.equal(rows.get("quilting").revenue, 20.82);
  assert.equal(rows.get("quilting").shopifyFees, 1.25);
  assert.equal(rows.get("quilting").otherFees, 2);
  assert.equal(sheet.sheetMetrics(rows.get("quilting")).aov, 20.82);
});
test("shipping-only orders are divided across free product tabs without duplicating revenue", () => {
  const a = aggregator();
  const products = [
    { id: "a", shopifyIds: ["1"] },
    { id: "b", shopifyIds: ["2"] },
  ];
  const rows = a.aggregateOrders(
    "2026-10-24",
    [
      {
        id: 1,
        total_price: "9",
        currency: "USD",
        financial_status: "paid",
        line_items: [
          { product_id: 1, price: "0", quantity: 1 },
          { product_id: 2, price: "0", quantity: 2 },
        ],
      },
    ],
    products,
    new Map([["1", 0.9]]),
    0,
  );
  assert.equal(rows.get("a").revenue, 3);
  assert.equal(rows.get("b").revenue, 6);
  assert.equal(rows.get("store").revenue, 9);
});
test("product start date excludes earlier orders and ads without changing the complete store", () => {
  const a = aggregator();
  const p = {
    id: "a",
    shopifyIds: ["1"],
    startDate: "2026-10-25",
    assignments: [{ accountId: "act_123", campaignIds: [] }],
  };
  const order = {
    id: 1,
    total_price: "10",
    currency: "USD",
    financial_status: "paid",
    line_items: [{ product_id: 1, price: "0", quantity: 1 }],
  };
  const metrics = [
    {
      accountId: "act_123",
      campaignId: "10",
      spend: 5,
      clicks: 1,
      linkClicks: 1,
      purchases: 1,
    },
  ];
  for (const date of ["2026-10-24", "2026-10-25"]) {
    const rows = a.aggregateOrders(date, [order], [p], new Map(), 0);
    a.attachAds(rows, [p], metrics, true, true);
    assert.equal(rows.get("store").revenue, 10);
    assert.equal(rows.get("store").adSpend, 5);
    assert.equal(rows.get("a").revenue, date < p.startDate ? 0 : 10);
    assert.equal(rows.get("a").adSpend, date < p.startDate ? null : 5);
  }
  const valid = { ...p, name: "A", links: ["https://store/products/a"] };
  assert.throws(
    () =>
      model().validateProducts(
        [{ ...valid, startDate: "2026-02-30" }],
        [saved],
      ),
    /valid product start date/,
  );
  assert.doesNotThrow(() => model().validateProducts([valid], [saved]));
});

const finance = compiled("src/lib/profit-sheet/finance.ts", {});
test("financial movements use their processing day, signed fees and principal without double deductions", () => {
  const start = Date.parse("2026-10-24T06:00:00Z"),
    end = start + 86400000;
  const entry = (id, type, amount, fee, time = start) => ({
    id,
    type,
    amount,
    fee,
    net: amount - fee,
    currency: "USD",
    processed_at: new Date(time).toISOString(),
  });
  const rows = [
    entry(1, "charge", 100, 3),
    entry(2, "refund", -20, -1),
    entry(3, "dispute", -30, 15),
    entry(4, "dispute", 30, -15),
    entry(5, "adjustment", -4, 0),
    entry(6, "credit", 2, 0),
    entry(7, "payout", -1000, 0),
    entry(8, "reserve", -10, 0),
    entry(9, "refund", -99, 0, end),
    entry(10, "refund", -99, 0, start - 1),
  ];
  const result = finance.balanceDay([...rows, rows[1]], start, end, "USD");
  assert.equal(
    JSON.stringify(result),
    JSON.stringify({
      shopifyFees: 2,
      refunds: 20,
      chargebackLoss: 30,
      chargebackWon: 30,
      adjustment: -2,
    }),
  );
  const calculated = sheet.storeSheetMetrics({
    ...result,
    revenue: 100,
    adSpend: 40,
  });
  assert.equal(calculated.actualSales, 76);
  assert.equal(calculated.profit, 36);
  assert.equal(
    sheet.storeSheetMetrics({
      ...result,
      revenue: 100,
      adSpend: 40,
      refunds: null,
    }).profit,
    null,
  );
  assert.equal(
    sheet.storeSheetMetrics({ revenue: 100, shopifyFees: 3, adSpend: 40 })
      .actualSales,
    null,
  );
  assert.throws(
    () =>
      finance.balanceDay([{ ...rows[0], currency: "EUR" }], start, end, "USD"),
    /currency/,
  );
  assert.throws(
    () =>
      finance.balanceDay([{ ...rows[0], type: "unknown" }], start, end, "USD"),
    /Unsupported/,
  );
});
test("complete-store revenue keeps refunded paid orders before deducting separate refund movements", () => {
  const rows = aggregator().aggregateOrders(
    "2026-10-24",
    [
      {
        id: 1,
        total_price: "100",
        current_total_price: "80",
        financial_status: "refunded",
        cancelled_at: "2026-10-24",
        currency: "USD",
        line_items: [],
      },
    ],
    [],
    new Map(),
    0,
  );
  assert.equal(rows.get("store").revenue, 100);
  assert.equal(
    sheet.storeSheetMetrics({
      ...rows.get("store"),
      refunds: 20,
      chargebackLoss: 0,
      chargebackWon: 0,
      adjustment: 0,
      adSpend: 10,
    }).profit,
    70,
  );
});
test("range changes recognize saved reports and workers prioritize visible jobs including expired leases", () => {
  const m = model();
  assert.equal(
    m.currentSavedDay(
      { config_version: 4, metrics: { financeVersion: 1 } },
      4,
      "store",
    ),
    true,
  );
  assert.equal(
    m.currentSavedDay({ config_version: 4, metrics: {} }, 4, "store"),
    false,
  );
  assert.equal(
    m.currentSavedDay({ config_version: 4, metrics: {} }, 4, "product"),
    true,
  );
  const now = Date.now();
  const live = {
    date: "2026-10-24",
    status: "running",
    lease_until: new Date(now + 10000).toISOString(),
  };
  const queued = { date: "2026-10-25", status: "queued" };
  assert.equal(m.runnableJob([live, queued], now), queued);
  assert.equal(m.runnableJob([live], now), undefined);
  assert.equal(
    m.runnableJob(
      [{ ...live, lease_until: new Date(now - 1).toISOString() }],
      now,
    ).date,
    live.date,
  );
});
test("automatic range fills use missing-only queue, while explicit refresh can force a saved day", async () => {
  const calls = [];
  const api = compiled("src/app/api/profit-sheet/sync/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/lib/profit-sheet-access": accessModule(),
    "@/lib/profit-sheet/model": model(),
    "@/app/api/lib/profit-sheet-repository": {
      loadConfig: async () => ({ products: [] }),
    },
    "@/app/api/lib/profit-sheet-discovery": { queueDiscovery: async () => {} },
    "@/app/api/lib/profit-sheet-sync": {
      enqueueMissingDays: async (...args) => {
        calls.push(args);
        return 0;
      },
      enqueueDays: async () => {
        throw new Error("Must not force saved reports");
      },
    },
  });
  const res = await api.POST(
    new NextRequest("https://example.test/api/profit-sheet/sync", {
      method: "POST",
      body: JSON.stringify({
        storeId: "store-1",
        action: "queue",
        from: "2026-10-24",
        to: "2026-10-26",
      }),
    }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).queued, 0);
  assert.equal(
    JSON.stringify(calls),
    JSON.stringify([
      ["store-1", ["2026-10-24", "2026-10-25", "2026-10-26"], "store", 0, 0],
    ]),
  );
});
test("payment pagination walks backwards, filters the window, and persists idempotent ledger rows", async () => {
  const start = Date.parse("2026-10-24T06:00:00Z"),
    end = start + 86400000;
  const row = (id, time) => ({
    id,
    type: "charge",
    amount: "10",
    fee: "1",
    net: "9",
    currency: "USD",
    processed_at: new Date(time).toISOString(),
  });
  const calls = [],
    writes = [];
  const api = compiled("src/app/api/lib/profit-sheet-finance.ts", {
    "@/lib/profit-sheet/finance": finance,
    "./supabase-persistence": { rest: async (...args) => writes.push(args) },
    "./shopify-client": {
      fetchFromShopify: async (t, s, p, params) => {
        calls.push(params);
        return {
          transactions:
            calls.length === 1
              ? Array.from({ length: 250 }, (_, i) =>
                  row(500 - i, start + 1000),
                )
              : [row(250, start), row(249, start - 1)],
        };
      },
    },
  });
  const totals = await api.syncFinance(
    "store-1",
    { accessToken: "secret", shopDomain: "example" },
    start,
    end,
    "USD",
    Date.now() + 10000,
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].last_id, "251");
  assert.equal(totals.shopifyFees, 251);
  assert.equal(JSON.parse(writes[0][1].body).length, 251);
  assert.match(writes[0][0], /on_conflict=store_id,transaction_id/);
});

const columns = compiled("src/lib/profit-sheet/columns.ts", {
  "@/lib/profit-sheet": sheet,
});
test("column insertion handles both directions, ends, and Date without corrupting the list", () => {
  const initial = ["date", "revenue", "shopifyFees", "adSpend", "profit"];
  assert.equal(
    JSON.stringify(columns.moveColumn(initial, "profit", 1)),
    JSON.stringify(["date", "profit", "revenue", "shopifyFees", "adSpend"]),
  );
  assert.equal(
    JSON.stringify(columns.moveColumn(initial, "revenue", 5)),
    JSON.stringify(["date", "shopifyFees", "adSpend", "profit", "revenue"]),
  );
  assert.equal(
    JSON.stringify(columns.moveColumn(initial, "date", 5)),
    JSON.stringify(["revenue", "shopifyFees", "adSpend", "profit", "date"]),
  );
  assert.equal(
    JSON.stringify(columns.moveColumn(initial, "revenue", 2)),
    JSON.stringify(initial),
  );
  assert.equal(initial.length, 5);
});
test("saved views validate known columns, mandatory Date, unique names and product scope", () => {
  const valid = {
    revision: 0,
    columns: ["date", "profit", "metaRoas"],
    activeView: "v1",
    views: [
      {
        id: "v1",
        name: " Meta performance ",
        columns: ["date", "profit", "metaRoas"],
      },
    ],
  };
  assert.equal(
    columns.validateLayout(valid, "store").views[0].name,
    "Meta performance",
  );
  for (const change of [
    { columns: ["profit"] },
    { columns: ["date", "date"] },
    { columns: ["date", "unknown"] },
    { activeView: "missing" },
    { revision: -1 },
    {
      views: [
        ...valid.views,
        { ...valid.views[0], id: "v2", name: "meta performance" },
      ],
    },
  ])
    assert.throws(() =>
      columns.validateLayout({ ...valid, ...change }, "store"),
    );
  assert.throws(() =>
    columns.validateLayout(
      { ...valid, columns: ["date", "actualSales"] },
      "product-1",
    ),
  );
  assert.equal(columns.needsExtendedMeta(["date", "metaRoas"]), true);
  assert.equal(columns.needsExtendedMeta(["date", "adSpend", "cpc"]), false);
});
test("Meta rates use summed primitives, keep Meta ROAS separate from Shopify, and propagate unknowns", () => {
  const row = {
    revenue: 300,
    adSpend: 100,
    clicks: 50,
    linkClicks: 40,
    purchases: 5,
    impressions: 10000,
    purchaseValue: 250,
    shopifyFees: 10,
    refunds: 20,
    chargebackLoss: 0,
    chargebackWon: 0,
    adjustment: 0,
  };
  assert.equal(columns.columnValue("metaRoas", row, "store"), 2.5);
  assert.equal(columns.columnValue("blendedRoas", row, "store"), 3);
  assert.equal(columns.columnValue("cpc", row, "store"), 2);
  assert.equal(columns.columnValue("cpm", row, "store"), 10);
  assert.equal(columns.columnValue("ctr", row, "store"), 0.5);
  assert.equal(columns.columnValue("linkCtr", row, "store"), 0.4);
  assert.equal(columns.columnValue("costPerPurchase", row, "store"), 20);
  assert.equal(columns.columnValue("profit", row, "store"), 170);
  assert.equal(
    columns.columnValue(
      "metaRoas",
      { ...row, purchaseValue: undefined },
      "store",
    ),
    null,
  );
  assert.equal(
    columns.columnValue("cpm", { ...row, impressions: 0 }, "store"),
    null,
  );
  // Daily ROAS 1x and 4x with unequal spend: aggregate is 3.25x, not 2.5x.
  assert.equal(
    columns.columnValue(
      "metaRoas",
      { adSpend: 400, purchaseValue: 1300 },
      "store",
    ),
    3.25,
  );
});
test("extended Meta metrics honor product campaigns and are unavailable on provider errors", () => {
  const a = aggregator(),
    products = [
      {
        id: "p1",
        shopifyIds: [],
        assignments: [{ accountId: "act_1", campaignIds: ["c1"] }],
      },
    ];
  const rows = a.aggregateOrders("2026-10-25", [], products, new Map(), 0);
  const metric = {
    accountId: "act_1",
    campaignId: "c1",
    spend: 100,
    clicks: 10,
    linkClicks: 9,
    purchases: 2,
    impressions: 1000,
    purchaseValue: 250,
    addToCart: 5,
    checkouts: 3,
    landingViews: 8,
  };
  a.attachAds(
    rows,
    products,
    [metric, { ...metric, campaignId: "c2" }],
    true,
    true,
  );
  assert.equal(rows.get("store").impressions, 2000);
  assert.equal(rows.get("p1").impressions, 1000);
  assert.equal(rows.get("p1").purchaseValue, 250);
  a.attachAds(rows, products, [], false, true);
  assert.equal(rows.get("store").purchaseValue, null);
  assert.equal(rows.get("store").impressions, null);
});
function viewsApi({ access = accessModule(), conflict = false } = {}) {
  const calls = [];
  const api = compiled("src/app/api/profit-sheet/views/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/lib/profit-sheet-access": access,
    "@/lib/profit-sheet/columns": columns,
    "@/app/api/lib/profit-sheet-repository": {
      loadConfig: async () => ({ products: [{ id: "p1" }] }),
    },
    "@/app/api/lib/supabase-persistence": {
      rest: async (path, options) => {
        calls.push({ path, options });
        if (options) {
          if (conflict) throw new Error("Layout changed in another session");
          return 2;
        }
        return [];
      },
    },
  });
  return { ...api, calls };
}
test("view API scopes storage, rejects invalid/product-incompatible layouts and enforces edit rights", async () => {
  const layout = { ...columns.emptyLayout("store"), revision: 1 };
  const put = (scope = "store", data = layout) =>
    new NextRequest("https://example.test/api/profit-sheet/views", {
      method: "PUT",
      body: JSON.stringify({ storeId: "store-1", scope, layout: data }),
    });
  const viewer = viewsApi({ access: accessModule({ role: "viewer" }) });
  assert.equal((await viewer.PUT(put())).status, 403);
  assert.equal(viewer.calls.length, 0);
  const api = viewsApi();
  assert.equal((await api.PUT(put("missing"))).status, 400);
  assert.equal((await api.PUT(put("p1"))).status, 400);
  assert.equal(api.calls.length, 0);
  const saved = await api.PUT(put());
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).revision, 2);
  const body = JSON.parse(api.calls[0].options.body);
  assert.equal(body.p_store, "store-1");
  assert.equal(body.p_scope, "store");
  assert.equal(body.p_revision, 1);
  assert.equal((await viewsApi({ conflict: true }).PUT(put())).status, 409);
  const get = await api.GET(
    new NextRequest(
      "https://example.test/api/profit-sheet/views?storeId=store-1&scope=p1",
    ),
  );
  assert.equal(get.status, 200);
  assert.deepEqual(
    (await get.json()).columns,
    JSON.parse(JSON.stringify(columns.defaultColumns("p1"))),
  );
  assert.match(api.calls.at(-1).path, /store_id=eq.store-1&scope_id=eq.p1/);
  const foreign = await api.GET(
    new NextRequest(
      "https://example.test/api/profit-sheet/views?storeId=foreign",
    ),
  );
  assert.equal(foreign.status, 403);
});

const attribution = compiled("src/lib/profit-sheet/attribution.ts", {
  "./discovery":compiled("src/lib/profit-sheet/discovery.ts",{}),
  "./aggregate": aggregator(),
});
const catalog = [
  {
    accountId: "act_1",
    id: "100",
    kind: "campaign",
    name: "Quilting",
    campaignId: "100",
  },
  {
    accountId: "act_1",
    id: "200",
    kind: "adset",
    name: "Prospecting",
    campaignId: "100",
  },
  {
    accountId: "act_1",
    id: "300",
    kind: "ad",
    name: "Video",
    campaignId: "100",
    adsetId: "200",
  },
];
const evidence = (utm, extra = {}) => ({
  createdAt: "2026-10-25T12:00:00Z",
  journey: null,
  ug: JSON.stringify({
    v: { source: "FbAds", ...utm },
    ts: Date.parse("2026-10-25T10:00:00Z"),
  }),
  ...extra,
});
test("exact ad IDs map to the campaign, preserving IDs as strings", () => {
  const match = attribution.matchOrder(
    evidence({ campaign: "100", term: "200", content: "300" }),
    catalog,
  );
  assert.equal(match.campaignId, "100");
  assert.equal(match.adId, "300");
  assert.equal(match.method, "ad ID");
});
test("legacy ad names resolve inside an ad set and campaign-only evidence never invents an ad", () => {
  assert.equal(
    attribution.matchOrder(
      evidence({ campaign: "Quilting", term: "200", content: "Video" }),
      catalog,
    ).adId,
    "300",
  );
  const match = attribution.matchOrder(
    evidence({ campaign: "Quilting" }),
    catalog,
  );
  assert.equal(match.campaignId, "100");
  assert.equal(match.adId, null);
  assert.equal(match.adsetId, null);
});
test("duplicate names, conflicting IDs, and absent stronger IDs stay unattributed", () => {
  const duplicate = [
    ...catalog,
    { ...catalog[0], id: "101", campaignId: "101" },
  ];
  assert.match(
    attribution.matchOrder(evidence({ campaign: "Quilting" }), duplicate)
      .reason,
    /Ambiguous/,
  );
  assert.match(
    attribution.matchOrder(
      evidence({ campaign: "999", content: "300" }),
      catalog,
    ).reason,
    /Conflicting/,
  );
  assert.equal(
    attribution.matchOrder(
      evidence({ campaign: "100", content: "999" }),
      catalog,
    ).campaignId,
    null,
  );
});
test("last Shopify visit overrides older saved Meta tracking and non-Meta sources do not get Meta credit", () => {
  const match = attribution.matchOrder(
    evidence(
      { campaign: "100" },
      {
        journey: {
          ready: true,
          lastVisit: { utmParameters: { source: "google", campaign: "100" } },
        },
      },
    ),
    catalog,
  );
  assert.equal(match.campaignId, null);
  assert.equal(match.source, "Shopify last visit");
  const known = attribution.matchOrder(
    evidence(
      { campaign: "100" },
      { journey: { ready: true, lastVisit: { source: "email" } } },
    ),
    catalog,
  );
  assert.equal(known.campaignId, null);
});
test("malformed and future saved touches cannot fabricate matching; pending journeys can use saved UTMs", () => {
  assert.equal(
    attribution.matchOrder(evidence({}, { ug: "not JSON" }), catalog)
      .campaignId,
    null,
  );
  const future = evidence({ campaign: "100" });
  future.ug = JSON.stringify({
    v: { source: "facebook", campaign: "100" },
    ts: Date.parse("2026-10-26T10:00:00Z"),
  });
  assert.equal(attribution.matchOrder(future, catalog).campaignId, null);
  assert.equal(
    attribution.matchOrder(
      evidence({ campaign: "100" }, { journey: { ready: false } }),
      catalog,
    ).campaignId,
    "100",
  );
});
test("first visit fallback requires a real Meta last referrer, not a similar malicious domain", () => {
  const base = {
    ready: true,
    firstVisit: { utmParameters: { source: "facebook", campaign: "100" } },
    lastVisit: { referrerUrl: "https://l.facebook.com/" },
  };
  assert.equal(
    attribution.matchOrder(evidence({}, { ug: null, journey: base }), catalog)
      .campaignId,
    "100",
  );
  base.lastVisit.referrerUrl = "https://facebook.com.attacker.test/";
  assert.equal(
    attribution.matchOrder(evidence({}, { ug: null, journey: base }), catalog)
      .campaignId,
    null,
  );
});
test("campaign revenue reconciles once per order, includes free-offer upsells and retains unmatched sales", () => {
  const product = {
    id: "p",
    name: "Quilting",
    shopifyIds: ["7"],
    assignments: [{ accountId: "act_1", campaignIds: ["100"] }],
  };
  const order = {
    id: "1",
    name: "#1",
    total_price: "180",
    current_total_price: "180",
    financial_status: "paid",
    currency: "USD",
    line_items: [
      { product_id: "7", quantity: 1, price: "0" },
      { product_id: "8", quantity: 1, price: "170" },
    ],
  };
  const other = {
    ...order,
    id: "2",
    total_price: "70",
    current_total_price: "70",
  };
  const snapshot = attribution.buildAttribution(
    "2026-10-25",
    [order, order, other],
    new Map([
      ["1", evidence({ campaign: "100", content: "300" })],
      ["2", evidence({}, { ug: null })],
    ]),
    catalog,
    [product],
    [
      {
        accountId: "act_1",
        campaignId: "100",
        spend: 100,
        purchaseValue: 300,
        purchases: 4,
        clicks: 20,
        linkClicks: 15,
      },
    ],
  );
  const report = attribution.summarizeAttribution([snapshot], "store");
  assert.equal(report.orderCount, 2);
  assert.equal(report.matchedOrders, 1);
  assert.equal(report.revenue, 250);
  assert.equal(report.matchedRevenue, 180);
  assert.equal(report.unmatchedRevenue, 70);
  assert.equal(report.campaigns[0].revenue, 180);
  assert.equal(report.campaigns[0].spend, 100);
  assert.equal(attribution.attributedRevenue(snapshot, "p"), 180);
  assert.equal(
    columns.columnValue(
      "shopifyRoas",
      { attributedRevenue: 180, adSpend: 100 },
      "store",
    ),
    1.8,
  );
  assert.equal(
    columns.columnValue(
      "metaRoas",
      { purchaseValue: 300, adSpend: 100 },
      "store",
    ),
    3,
  );
  assert.equal(
    attribution.attributedRevenue({ ...snapshot, status: "error" }, "store"),
    null,
  );
});
test("product campaigns cannot claim sales matched to another assigned campaign", () => {
  const p = {
    id: "p",
    assignments: [{ accountId: "act_1", campaignIds: ["999"] }],
  };
  const snapshot = {
    status: "complete",
    products: [p],
    orders: [
      {
        campaignId: "100",
        accountId: "act_1",
        scopeRevenue: { p: 25, store: 25 },
      },
    ],
    campaigns: [],
  };
  assert.equal(attribution.attributedRevenue(snapshot, "p"), 0);
  const report = attribution.summarizeAttribution([snapshot], "p");
  assert.equal(report.matchedRevenue, 0);
  assert.equal(report.unmatchedRevenue, 25);
});
test("Blended ROAS is selectable but absent from every default layout; Shopify ROAS is concise", () => {
  for (const scope of ["store", "p"]) {
    assert.equal(columns.defaultColumns(scope).includes("blendedRoas"), false);
    assert.equal(columns.availableColumns(scope).includes("blendedRoas"), true);
    assert.equal(columns.defaultColumns(scope).includes("shopifyRoas"), true);
  }
  assert.equal(columns.COLUMNS.shopifyRoas.label, "Shopify ROAS");
  assert.equal(
    columns.columnValue(
      "shopifyRoas",
      { adSpend: 0, attributedRevenue: 30 },
      "store",
    ),
    null,
  );
  assert.equal(
    columns.columnValue("shopifyRoas", { adSpend: 20 }, "store"),
    null,
  );
});

test("attribution API rejects foreign stores and exposes evidence only for requested campaign orders", async () => {
  const calls = [];
  const snapshot = {
    version: 1,
    status: "complete",
    products: [],
    campaigns: [
      {
        accountId: "act_1",
        campaignId: "100",
        name: "Quilting",
        spend: 10,
        purchaseValue: 50,
        purchases: 2,
      },
    ],
    orders: [
      {
        orderId: "1",
        campaignId: "100",
        accountId: "act_1",
        scopeRevenue: { store: 20 },
        evidence: evidence({ campaign: "100" }),
      },
    ],
  };
  const api = compiled("src/app/api/profit-sheet/attribution/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/lib/profit-sheet-access": accessModule(),
    "@/app/api/lib/profit-sheet-repository": {
      loadConfig: async () => ({ version: 2, currency: "USD", products: [] }),
    },
    "@/app/api/lib/supabase-pagination": {
      fetchAllRestRows: async (p) => {
        calls.push(p);
        return [
          { date: "2026-10-25", config_version: 2, snapshot, currency: "USD" },
        ];
      },
    },
    "@/lib/profit-sheet/model": model(),
    "@/lib/profit-sheet/attribution": attribution,
  });
  const url =
    "https://test/api/profit-sheet/attribution?from=2026-10-25&to=2026-10-25&storeId=";
  assert.equal((await api.GET(new NextRequest(url + "foreign"))).status, 403);
  assert.equal(calls.length, 0);
  const response = await api.GET(new NextRequest(url + "store-1"));
  const data = await response.json();
  assert.equal(data.matchedRevenue, 20);
  assert.equal(data.orders, undefined);
  assert.deepEqual(data.missing, []);
  assert.match(calls[0], /store_id=eq.store-1/);
  const detail = await (
    await api.GET(new NextRequest(url + "store-1&campaign=act_1:100"))
  ).json();
  assert.equal(detail.orders.length, 1);
  assert.equal(detail.totalOrders, 1);
  assert.equal(
    (await api.GET(new NextRequest(url + "store-1&offset=-1"))).status,
    400,
  );
});

test("Meta catalog loads all pages and paused entities, preserves old names and never caches a partial fetch", async () => {
  const writes = [],
    requests = [];
  let fail = false;
  const module = compiled("src/app/api/lib/profit-sheet-attribution.ts", {
    "./meta-client": {
      fetchFromMeta: async (_token, endpoint, params) => {
        requests.push({ endpoint, params });
        if (fail && endpoint.endsWith("/ads")) throw new Error("Meta error");
        if (endpoint.endsWith("/campaigns"))
          return params.after
            ? { data: [{ id: "101", name: "Paused campaign" }] }
            : {
                data: [{ id: "100", name: "Renamed" }],
                paging: { next: "exists", cursors: { after: "page2" } },
              };
        return {
          data: endpoint.endsWith("/adsets")
            ? [{ id: "200", name: "Set", campaign_id: "100" }]
            : [
                {
                  id: "300",
                  name: "Video",
                  campaign_id: "100",
                  adset_id: "200",
                },
              ],
        };
      },
    },
    "./shopify-graphql": {},
    "./supabase-persistence": {
      rest: async (p, init) => {
        if (init) writes.push({ p, body: JSON.parse(init.body) });
        return [];
      },
    },
    "./supabase-pagination": {
      fetchAllRestRows: async () => [{ entity: catalog[0] }],
    },
  });
  const rows = await module.loadMetaCatalog(
    "store-1",
    saved,
    Date.now() + 60000,
  );
  assert.equal(rows.length, 4);
  assert.equal(
    rows.find((r) => r.id === "100").names.includes("Quilting"),
    true,
  );
  assert.equal(
    requests.some((r) => r.params.after === "page2"),
    true,
  );
  assert.equal(
    requests.some((r) => r.params.filtering),
    false,
  );
  const before = writes.length;
  fail = true;
  await assert.rejects(() =>
    module.loadMetaCatalog("store-1", saved, Date.now() + 60000),
  );
  assert.equal(writes.length, before);
});

test("changed-order scans revisit saved historical days, overlap cursors, and advance only after complete pagination", async () => {
  const writes = [], queries = [];
  let fail = false;
  const scan = compiled("src/app/api/lib/profit-sheet-attribution-updates.ts", {
    "./supabase-persistence": { rest: async (p, init) => {
      if (p.includes("claim_update_scan")) return [{ store_id: "store-1", scanned_until: "2026-10-25T10:00:00Z", checked_at: "2026-10-26T10:00:00Z" }];
      if (p.startsWith("/profit_sheet_days")) return [{ date: "2026-10-01" }];
      if (p.startsWith("/profit_sheet_attribution?")) return [];
      if (init) writes.push({ p, ...JSON.parse(init.body) });
      return [];
    } },
    "./shopify-graphql": { shopifyGraphQL: async (id, query, vars) => { queries.push({ id, vars }); if (fail) throw new Error("private error"); return { orders: { nodes: [{ createdAt: "2026-10-01T07:00:00Z" }], pageInfo: { hasNextPage: false } } }; } },
    "@/lib/profit-sheet/model": model(), "./profit-sheet-access": { safeSheetError: () => "Provider unavailable" },
  });
  await scan.queueChangedAttributionDays();
  assert.match(queries[0].vars.query, /2026-10-25T09:55:00.000Z/);
  assert.equal(writes[0].p_store, "store-1"); assert.deepEqual(JSON.parse(JSON.stringify(writes[0].p_dates)), ["2026-10-01"]);
  assert.ok(writes.at(-1).scanned_until);
  writes.length = 0; fail = true; await scan.queueChangedAttributionDays();
  assert.equal(writes.length, 1); assert.equal(writes[0].scanned_until, undefined); assert.equal(writes[0].error, "Provider unavailable");
});

const discovery = compiled("src/lib/profit-sheet/discovery.ts", {});
test("Clear all means none, legacy all remains compatible, and exclusions override all", () => {
  const metric={accountId:"act_1",campaignId:"100",adId:"300"};
  assert.equal(discovery.assignmentMatches({accountId:"act_1",campaignIds:[],mode:"selected"},metric),false);
  assert.equal(discovery.assignmentMatches({accountId:"act_1",campaignIds:[]},metric),true);
  assert.equal(discovery.assignmentMatches({accountId:"act_1",campaignIds:[],mode:"all",excludedCampaignIds:["100"]},metric),false);
});
test("creative matching normalizes product URLs and rejects foreign domains and non-product routes", () => {
  const domains=new Set(["store.test"]);
  assert.equal(discovery.productHandle("https://www.store.test/en/products/quilt?variant=1&utm_source=fb",domains),"quilt");
  assert.equal(discovery.productHandle("https://other.test/products/quilt",domains),null);
  assert.equal(discovery.productHandle("https://store.test/apps/downloads/secret",domains),null);
  const links=discovery.creativeLinks({object_story_spec:{link_data:{link:"https://store.test/products/quilt",child_attachments:[{link:"https://store.test/products/wire"}]}},asset_feed_spec:{link_urls:[{website_url:"https://store.test/products/quilt"}]}});
  assert.equal(links.length,2);
});
test("shared automatic campaigns count each ad once and honor observation dates", () => {
  const products=[{id:"a",shopifyIds:["1"],assignments:[{accountId:"act_1",campaignIds:["100"],mode:"ads",adLinks:[{adId:"300",campaignId:"100",from:"2020-01-02",to:"2020-01-03"}]}]},{id:"b",shopifyIds:["2"],assignments:[{accountId:"act_1",campaignIds:["100"],mode:"ads",adLinks:[{adId:"301",campaignId:"100",from:"2020-01-01"}]}]}];
  const metrics=[{accountId:"act_1",campaignId:"100",adId:"300",spend:30,clicks:3,purchases:1,linkClicks:2},{accountId:"act_1",campaignId:"100",adId:"301",spend:70,clicks:7,purchases:2,linkClicks:4}];
  const a=aggregator(),rows=a.aggregateOrders("2020-01-02",[],products,new Map(),0);a.attachAds(rows,products,metrics,true,true);
  assert.equal(rows.get("store").adSpend,100);assert.equal(rows.get("a").adSpend,30);assert.equal(rows.get("b").adSpend,70);
  assert.equal(discovery.assignmentMatches(products[0].assignments[0],metrics[0],"2020-01-04"),false);
  const snap=attribution.buildAttribution("2020-01-02",[],new Map(),catalog,products,metrics);
  assert.equal(attribution.summarizeAttribution([snap],"a").campaigns[0].spend,30);
  assert.equal(attribution.summarizeAttribution([snap],"store").campaigns[0].spend,100);
});
class TestRateLimitError extends Error { retryAfterMs = 900000; }
function discoveryEngine({excluded=[],products=[],analyticsError=false,metaError=false}={}) {
 const writes=[];const config={version:4,accounts:[{...saved,adAccountId:"act_1"}],products};
 const engine=compiled("src/app/api/lib/profit-sheet-discovery.ts",{
  "./meta-client":{MetaRateLimitError:TestRateLimitError},
  "./profit-sheet-exclusions":{loadExclusions:async()=>excluded.map(key=>({key}))},
  crypto:{randomUUID:()=>"new-product"},"./supabase-persistence":{rest:async(path,init)=>{if(!init)return excluded.map(key=>({key}));writes.push({path,body:JSON.parse(init.body)});return null;}},
  "./profit-sheet-repository":{loadConfig:async()=>config},"./tokens":{getShopifyToken:async()=>({accessToken:"secret",shopDomain:"store.test"})},
  "./shopify-client":{fetchFromShopify:async(_t,_d,path)=>path==="/shop.json"?{shop:{domain:"store.test",myshopify_domain:"x.myshopify.com"}}:path==="/products.json"?{products:[{id:1,handle:"quilt",title:"Quilt",status:"active"},{id:2,handle:"wire",title:"Wire",status:"active"}]}:{orders:[{id:1,test:false,financial_status:"paid",line_items:[{product_id:1}]}]}},
  "./shopify-graphql":{shopifyGraphQL:async()=>{if(analyticsError)throw new Error("denied");return {shopifyqlQuery:{parseErrors:[],tableData:{rows:[...Array.from({length:3},(_,i)=>({landing_page_path:"/products/quilt",day:`2020-01-0${i+1}`,sessions:"10"})),{landing_page_path:"/products/wire",day:"2020-01-01",sessions:"50"}]}}};}},
  "./crypto":{encryptSecret:()=>"encrypted"},"./profit-sheet-access":{safeSheetError:()=>"Provider unavailable"},
  "./profit-sheet-meta-discovery":{connectedAccounts:async()=>({}),recentCreatives:async()=>{if(metaError)throw metaError instanceof Error ? metaError : new Error("failed");return [{id:"300",campaign_id:"100",name:"Quilt ad",creative:{object_story_spec:{link_data:{link:"https://store.test/products/quilt"}}}},{id:"301",campaign_id:"100",name:"Mixed carousel",creative:{asset_feed_spec:{link_urls:[{website_url:"https://store.test/products/quilt"},{website_url:"https://store.test/products/wire"}]}}}];}},
  "@/lib/profit-sheet":sheet,"@/lib/profit-sheet/model":model(),"@/lib/profit-sheet/discovery":discovery
 });return {engine,writes};
}
test("discovery creates only qualified sold products and maps unambiguous ads, keeping mixed destinations for review",async()=>{
 const {engine,writes}=discoveryEngine();const r=await engine.runDiscovery({store_id:"s",lease:"l",run_day:"2020-01-06"});assert.equal(r.ok,true);const finish=writes.at(-1).body;assert.equal(finish.p_products.length,1);assert.equal(finish.p_products[0].shopifyIds[0],"1");assert.equal(finish.p_products[0].assignments[0].adLinks[0].adId,"300");assert.equal(finish.p_products[0].startDate,"2020-01-06");assert.equal(r.findings.find(f=>f.adId==="301").status,"review");
});
test("discovery preserves unlink exclusions and refuses activation when analytics is incomplete",async()=>{
 for(const options of [{excluded:["product:1"]},{analyticsError:true}]){const {engine,writes}=discoveryEngine(options);const r=await engine.runDiscovery({store_id:"s",lease:"l",run_day:"2020-01-06"});assert.equal(r.ok,true);assert.equal(writes.at(-1).body.p_products,null);}
});
test("manual assignments survive automatic discovery and provider failure",async()=>{
 const products=[{id:"manual",name:"Quilt",shopifyIds:["1"],links:["https://store.test/products/quilt"],assignments:[{accountId:"act_1",campaignIds:["100"]}]}];
 for(const metaError of [true,false]){const {engine,writes}=discoveryEngine({products,metaError});const r=await engine.runDiscovery({store_id:"s",lease:"l",run_day:"2020-01-06"});assert.equal(r.ok,true);assert.equal(writes.at(-1).body.p_products,null);}
});
test("integration accounts use the server token rather than a browser token and never disclose it",async()=>{
 const r=route();const res=await r.put([{...saved,credentialSource:"integration",accessToken:"untrusted-browser-token"}]);assert.equal(res.status,200);assert.equal(r.calls[0].token,"integration-secret");assert.equal(r.writes[0][1][0].credentialSource,"integration");assert.equal(JSON.stringify(await res.json()).includes("integration-secret"),false);
});
test("recent creative scans include paused delivered ads, paginate, and query only the discovered IDs",async()=>{
 const calls=[];
 const api=compiled("src/app/api/lib/profit-sheet-meta-discovery.ts",{
  crypto:require("node:crypto"),"@/lib/profit-sheet/discovery":discovery,
  "./meta-client":{fetchFromMeta:async(_t,endpoint,params)=>{calls.push({endpoint,params});if(params.fields==="id")return {data:[{id:"300"}]};if(endpoint.endsWith("insights"))return {data:[{ad_id:"301"}]};return {data:[{id:"300"},{id:"301"}]};}},
  "./tokens":{},"./supabase-persistence":{rest:async()=>[]},"./profit-sheet-access":{},
 });
 const ads=await api.recentCreatives("secret","act_1","2020-01-01","2020-01-06",Date.now()+10000,"store-1");assert.equal(ads.length,2);assert.deepEqual(JSON.parse(calls.at(-1).params.filtering)[0].value,["300","301"]);assert.equal(calls[0].params.effective_status,'["ACTIVE"]');
});

test("destination mapping accepts grouped product links but never a mixed or foreign destination", () => {
 const products=[{id:"group",shopifyIds:["1","2"]},{id:"other",shopifyIds:["3"]}];
 const catalog=[{id:1,handle:"quilt"},{id:2,handle:"quilt-free"},{id:3,handle:"wire"}],domains=new Set(["store.test"]);
 const match=(links)=>discovery.creativeOwner(links,products,catalog,domains)?.id;
 assert.equal(match(["https://store.test/products/quilt?utm_campaign=1","https://store.test/products/quilt-free"]),"group");
 assert.equal(match(["https://store.test/products/quilt","https://store.test/products/wire"]),undefined);
 assert.equal(match(["https://other.test/products/quilt"]),undefined);
 assert.equal(match([]),undefined);
});
test("rate-limited discovery persists a partial report and schedules a cooldown instead of claiming success", async () => {
 const before=Date.now();const {engine,writes}=discoveryEngine({metaError:new TestRateLimitError("limited")});
 const r=await engine.runDiscovery({store_id:"s",lease:"l",run_day:"2020-01-06"});
 assert.equal(r.metaComplete,false);assert.ok(Date.parse(r.retryAt)>=before+900000);
 assert.equal(writes.at(-1).body.p_report.metaComplete,false);
 assert.match(r.warnings[0],/retry automatically/);
});
test("creative cache resumes completed batches, isolates credentials, and honors cooldown before any Meta call", async () => {
 let stored=null,fail=true;const calls=[];
 const ids=Array.from({length:51},(_,i)=>String(i+100));
 const api=compiled("src/app/api/lib/profit-sheet-meta-discovery.ts",{
  crypto:require("node:crypto"),"@/lib/profit-sheet/discovery":discovery,"./tokens":{},"./profit-sheet-access":{},
  "./supabase-persistence":{rest:async(_path,init)=>{if(init){stored=JSON.parse(init.body);return null;}return stored?[structuredClone(stored)]:[];}},
  "./meta-client":{MetaRateLimitError:TestRateLimitError,fetchFromMeta:async(_token,endpoint,p)=>{
   calls.push(p);if(p.fields==="id")return {data:ids.map(id=>({id}))};if(endpoint.endsWith("insights"))return {data:[]};
   const batch=JSON.parse(p.filtering)[0].value;if(batch.length===1&&fail)throw new TestRateLimitError("limited");
   return {data:batch.map(id=>({id,campaign_id:"1"}))};
  }},
 });
 const run=()=>api.recentCreatives("token-a","act_1","2020-01-01","2020-01-06",Date.now()+10000,"store-1");
 await assert.rejects(run,TestRateLimitError);assert.equal(Object.keys(stored.snapshot.ads).length,50);
 const count=calls.length;await assert.rejects(run,TestRateLimitError);assert.equal(calls.length,count);
 stored.snapshot.cooldownUntil=0;fail=false;assert.equal((await run()).length,51);assert.equal(calls.length,count+1);
 assert.equal((await run()).length,51);assert.equal(calls.length,count+1);
 await api.recentCreatives("new-token","act_1","2020-01-01","2020-01-06",Date.now()+10000,"store-1");
 assert.ok(calls.length>count+1);
});
test("Meta error codes and provider cooldown headers are recognized", () => {
 const meta=compiled("src/app/api/lib/meta-client.ts",{});
 assert.equal(meta.isRateLimitError(400,JSON.stringify({error:{code:80004}})),true);
 assert.equal(meta.isRateLimitError(403,JSON.stringify({error:{code:4}})),true);
 assert.equal(meta.isRateLimitError(400,JSON.stringify({error:{code:190}})),false);
 assert.equal(meta.metaRetryAfter(new Headers({"retry-after":"1800"})),1800000);
 assert.equal(meta.metaRetryAfter(new Headers({"x-business-use-case-usage":JSON.stringify({"1":[{estimated_time_to_regain_access:60}]})})),3600000);
});

test("existing post destinations unwrap Meta link shims without treating Facebook video URLs as products",()=>{
 assert.deepEqual(Array.from(discovery.postDestinationLinks({attachments:{data:[{url:"https://l.facebook.com/l.php?u=https%3A%2F%2Fstore.test%2Fproducts%2Fquilt",target:{url:"https://www.facebook.com/video/123"}}]}})),["https://store.test/products/quilt"]);
});
