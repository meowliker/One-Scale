import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { decryptSecret, encryptSecret } from '@/app/api/lib/crypto';

function resolveDbPath(): string {
  if (process.env.SQLITE_DB_PATH && process.env.SQLITE_DB_PATH.trim()) {
    return process.env.SQLITE_DB_PATH.trim();
  }

  // Vercel serverless runtime has a read-only app directory; use /tmp.
  if (process.env.VERCEL) {
    return '/tmp/one-scale/app.db';
  }

  return path.join(process.cwd(), 'data', 'app.db');
}

const DB_PATH = resolveDbPath();

// Store db on globalThis so it survives Next.js HMR (hot module replacement).
// Without this, each HMR reload creates a new native SQLite handle while the
// old one is stale, which crashes the dev server.
const globalForDb = globalThis as unknown as {
  __sqlite_db?: Database.Database;
};

function initDb(): Database.Database {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const instance = new Database(DB_PATH);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  // Create tables
  instance.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('meta', 'shopify')),
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at INTEGER,
      account_id TEXT,
      account_name TEXT,
      shop_domain TEXT,
      shop_name TEXT,
      scopes TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_synced TEXT,
      UNIQUE(store_id, platform)
    );

    CREATE TABLE IF NOT EXISTS app_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL CHECK(platform IN ('meta', 'shopify')) UNIQUE,
      app_id TEXT NOT NULL,
      app_secret TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      scopes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_token TEXT NOT NULL UNIQUE,
      store_id TEXT NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('meta', 'shopify')),
      shop_domain TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      used INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      domain TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'shopify',
      api_key TEXT,
      api_secret TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS store_ad_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      ad_account_id TEXT NOT NULL,
      ad_account_name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'meta',
      currency TEXT,
      timezone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, ad_account_id)
    );

    CREATE TABLE IF NOT EXISTS pnl_product_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      sku TEXT,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      cost_type TEXT NOT NULL DEFAULT 'fixed' CHECK(cost_type IN ('fixed', 'percentage')),
      effective_date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, product_id, effective_date)
    );

    CREATE TABLE IF NOT EXISTS pnl_shipping_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      method TEXT NOT NULL DEFAULT 'flat_rate' CHECK(method IN ('flat_rate', 'percentage', 'equal_charged', 'per_item')),
      flat_rate REAL DEFAULT 0,
      percentage REAL DEFAULT 0,
      per_item_rate REAL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id)
    );

    CREATE TABLE IF NOT EXISTS pnl_payment_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      gateway_name TEXT NOT NULL,
      fee_percentage REAL NOT NULL DEFAULT 0,
      fee_fixed REAL NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, gateway_name)
    );

    CREATE TABLE IF NOT EXISTS pnl_custom_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'fixed' CHECK(category IN ('fixed', 'variable')),
      amount REAL NOT NULL DEFAULT 0,
      frequency TEXT NOT NULL DEFAULT 'monthly' CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly', 'one_time')),
      distribution TEXT NOT NULL DEFAULT 'daily' CHECK(distribution IN ('daily', 'hourly', 'smart')),
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pnl_handling_fees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      fee_type TEXT NOT NULL DEFAULT 'per_order' CHECK(fee_type IN ('per_order', 'per_item', 'percentage')),
      amount REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id)
    );

    CREATE TABLE IF NOT EXISTS pnl_store_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      product_type TEXT NOT NULL DEFAULT 'physical' CHECK(product_type IN ('physical', 'digital')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id)
    );

    CREATE TABLE IF NOT EXISTS pnl_daily_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL,
      date TEXT NOT NULL,
      revenue REAL NOT NULL DEFAULT 0,
      cogs REAL NOT NULL DEFAULT 0,
      ad_spend REAL NOT NULL DEFAULT 0,
      shipping REAL NOT NULL DEFAULT 0,
      fees REAL NOT NULL DEFAULT 0,
      refunds REAL NOT NULL DEFAULT 0,
      net_profit REAL NOT NULL DEFAULT 0,
      margin REAL NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0,
      full_refund_count INTEGER NOT NULL DEFAULT 0,
      partial_refund_count INTEGER NOT NULL DEFAULT 0,
      full_refund_amount REAL NOT NULL DEFAULT 0,
      partial_refund_amount REAL NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, date)
    );

    CREATE TABLE IF NOT EXISTS tracking_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
      pixel_id TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      server_side_enabled INTEGER NOT NULL DEFAULT 0,
      attribution_model TEXT NOT NULL DEFAULT 'last_click' CHECK(attribution_model IN ('first_click', 'last_click', 'linear', 'time_decay', 'position_based')),
      attribution_window TEXT NOT NULL DEFAULT '7day' CHECK(attribution_window IN ('1day', '7day', '28day')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tracking_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      event_name TEXT NOT NULL,
      event_id TEXT,
      source TEXT NOT NULL DEFAULT 'browser' CHECK(source IN ('browser', 'server', 'shopify')),
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      page_url TEXT,
      referrer TEXT,
      session_id TEXT,
      click_id TEXT,
      fbp TEXT,
      fbc TEXT,
      external_id TEXT,
      email_hash TEXT,
      phone_hash TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      value REAL,
      currency TEXT,
      order_id TEXT,
      campaign_id TEXT,
      adset_id TEXT,
      ad_id TEXT,
      payload_json TEXT,
      UNIQUE(store_id, event_id)
    );

    CREATE INDEX IF NOT EXISTS idx_tracking_events_store_time
      ON tracking_events(store_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracking_events_store_event_time
      ON tracking_events(store_id, event_name, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tracking_events_store_entities_time
      ON tracking_events(store_id, campaign_id, adset_id, ad_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS meta_endpoint_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL CHECK(endpoint IN ('creatives', 'adsets', 'ads', 'campaigns', 'insights')),
      scope_id TEXT NOT NULL DEFAULT '',
      variant_key TEXT NOT NULL DEFAULT '',
      row_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, endpoint, scope_id, variant_key)
    );

    CREATE INDEX IF NOT EXISTS idx_meta_endpoint_snapshots_lookup
      ON meta_endpoint_snapshots(store_id, endpoint, scope_id, updated_at DESC);
  `);

  // Migration: back-fill stores table from existing connections
  // This ensures stores created before the stores table was added still appear
  const orphanedConnections = instance.prepare(`
    SELECT DISTINCT c.store_id, c.shop_domain, c.shop_name, c.connected_at
    FROM connections c
    LEFT JOIN stores s ON s.id = c.store_id
    WHERE s.id IS NULL
  `).all() as { store_id: string; shop_domain: string | null; shop_name: string | null; connected_at: string }[];

  if (orphanedConnections.length > 0) {
    const insertStore = instance.prepare(`
      INSERT OR IGNORE INTO stores (id, name, domain, platform, created_at)
      VALUES (?, ?, ?, 'shopify', ?)
    `);
    for (const conn of orphanedConnections) {
      const name = conn.shop_name || conn.store_id;
      const domain = conn.shop_domain || `${conn.store_id}.myshopify.com`;
      insertStore.run(conn.store_id, name, domain, conn.connected_at);
    }
  }

  // Migration: add api_key / api_secret columns if missing (existing DBs)
  const storeColumns = instance.pragma('table_info(stores)') as { name: string }[];
  const hasApiKey = storeColumns.some((c) => c.name === 'api_key');
  if (!hasApiKey) {
    instance.exec('ALTER TABLE stores ADD COLUMN api_key TEXT');
    instance.exec('ALTER TABLE stores ADD COLUMN api_secret TEXT');
  }

  // Migration: add Meta delivery columns to tracking_events if missing.
  const trackingEventColumns = instance.pragma('table_info(tracking_events)') as { name: string }[];
  const hasMetaForwarded = trackingEventColumns.some((c) => c.name === 'meta_forwarded');
  if (!hasMetaForwarded) {
    instance.exec('ALTER TABLE tracking_events ADD COLUMN meta_forwarded INTEGER NOT NULL DEFAULT 0');
    instance.exec('ALTER TABLE tracking_events ADD COLUMN meta_last_attempt_at TEXT');
    instance.exec('ALTER TABLE tracking_events ADD COLUMN meta_last_error TEXT');
  }
  const hasCampaignId = trackingEventColumns.some((c) => c.name === 'campaign_id');
  if (!hasCampaignId) {
    instance.exec('ALTER TABLE tracking_events ADD COLUMN campaign_id TEXT');
  }
  const hasAdSetId = trackingEventColumns.some((c) => c.name === 'adset_id');
  if (!hasAdSetId) {
    instance.exec('ALTER TABLE tracking_events ADD COLUMN adset_id TEXT');
  }
  const hasAdId = trackingEventColumns.some((c) => c.name === 'ad_id');
  if (!hasAdId) {
    instance.exec('ALTER TABLE tracking_events ADD COLUMN ad_id TEXT');
  }
  instance.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracking_events_store_entities_time
      ON tracking_events(store_id, campaign_id, adset_id, ad_id, occurred_at DESC);
  `);

  ensureMetaSnapshotSchema(instance);

  return instance;
}

function ensureMetaSnapshotSchema(db: Database.Database): void {
  const snapshotTableSql = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'meta_endpoint_snapshots'")
    .get() as { sql?: string } | undefined;
  const snapshotSqlText = (snapshotTableSql?.sql || '').toLowerCase();
  if (!snapshotSqlText) return;

  const hasExpandedConstraint =
    snapshotSqlText.includes("'campaigns'")
    && snapshotSqlText.includes("'insights'");
  if (hasExpandedConstraint) return;

  const needsMigration =
    snapshotSqlText.includes("endpoint in ('creatives', 'adsets', 'ads')")
    || snapshotSqlText.includes("endpoint in ('creatives','adsets','ads')");
  if (!needsMigration) return;

  db.exec(`
    ALTER TABLE meta_endpoint_snapshots RENAME TO meta_endpoint_snapshots_legacy;

    CREATE TABLE meta_endpoint_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL CHECK(endpoint IN ('creatives', 'adsets', 'ads', 'campaigns', 'insights')),
      scope_id TEXT NOT NULL DEFAULT '',
      variant_key TEXT NOT NULL DEFAULT '',
      row_count INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(store_id, endpoint, scope_id, variant_key)
    );

    INSERT INTO meta_endpoint_snapshots (id, store_id, endpoint, scope_id, variant_key, row_count, payload_json, updated_at)
    SELECT id, store_id, endpoint, scope_id, variant_key, row_count, payload_json, updated_at
    FROM meta_endpoint_snapshots_legacy;

    DROP TABLE meta_endpoint_snapshots_legacy;

    CREATE INDEX IF NOT EXISTS idx_meta_endpoint_snapshots_lookup
      ON meta_endpoint_snapshots(store_id, endpoint, scope_id, updated_at DESC);
  `);
}

function ensureTrackingEntityColumns(db: Database.Database): void {
  const columns = db.pragma('table_info(tracking_events)') as { name: string }[];
  if (!columns.some((c) => c.name === 'campaign_id')) {
    db.exec('ALTER TABLE tracking_events ADD COLUMN campaign_id TEXT');
  }
  if (!columns.some((c) => c.name === 'adset_id')) {
    db.exec('ALTER TABLE tracking_events ADD COLUMN adset_id TEXT');
  }
  if (!columns.some((c) => c.name === 'ad_id')) {
    db.exec('ALTER TABLE tracking_events ADD COLUMN ad_id TEXT');
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tracking_events_store_entities_time
      ON tracking_events(store_id, campaign_id, adset_id, ad_id, occurred_at DESC);
  `);
}

export function getDb(): Database.Database {
  // Reuse existing connection if it's still open
  if (globalForDb.__sqlite_db) {
    try {
      // Quick health check — if the handle is broken this will throw
      globalForDb.__sqlite_db.pragma('journal_mode');
      ensureMetaSnapshotSchema(globalForDb.__sqlite_db);
      ensureTrackingEntityColumns(globalForDb.__sqlite_db);
      return globalForDb.__sqlite_db;
    } catch {
      // Handle is dead (e.g. after HMR), recreate it
      globalForDb.__sqlite_db = undefined;
    }
  }

  globalForDb.__sqlite_db = initDb();
  ensureMetaSnapshotSchema(globalForDb.__sqlite_db);
  ensureTrackingEntityColumns(globalForDb.__sqlite_db);
  return globalForDb.__sqlite_db;
}

// ------ Connection CRUD ------

export interface DbConnection {
  id: number;
  store_id: string;
  platform: 'meta' | 'shopify';
  access_token: string;
  refresh_token: string | null;
  expires_at: number | null;
  account_id: string | null;
  account_name: string | null;
  shop_domain: string | null;
  shop_name: string | null;
  scopes: string | null;
  connected_at: string;
  last_synced: string | null;
}

export function getConnection(storeId: string, platform: 'meta' | 'shopify'): DbConnection | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM connections WHERE store_id = ? AND platform = ?'
  ).get(storeId, platform) as DbConnection | undefined;
  if (!row) return null;
  return {
    ...row,
    access_token: decryptSecret(row.access_token),
    refresh_token: row.refresh_token ? decryptSecret(row.refresh_token) : null,
  };
}

export function upsertConnection(data: {
  storeId: string;
  platform: 'meta' | 'shopify';
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
  accountName?: string;
  shopDomain?: string;
  shopName?: string;
  scopes?: string;
}): void {
  const db = getDb();
  const encryptedAccessToken = encryptSecret(data.accessToken);
  const encryptedRefreshToken = data.refreshToken ? encryptSecret(data.refreshToken) : null;
  db.prepare(`
    INSERT INTO connections (store_id, platform, access_token, refresh_token, expires_at, account_id, account_name, shop_domain, shop_name, scopes, last_synced)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, platform) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = COALESCE(excluded.refresh_token, connections.refresh_token),
      expires_at = COALESCE(excluded.expires_at, connections.expires_at),
      account_id = COALESCE(excluded.account_id, connections.account_id),
      account_name = COALESCE(excluded.account_name, connections.account_name),
      shop_domain = COALESCE(excluded.shop_domain, connections.shop_domain),
      shop_name = COALESCE(excluded.shop_name, connections.shop_name),
      scopes = COALESCE(excluded.scopes, connections.scopes),
      last_synced = datetime('now')
  `).run(
    data.storeId,
    data.platform,
    encryptedAccessToken,
    encryptedRefreshToken,
    data.expiresAt ?? null,
    data.accountId ?? null,
    data.accountName ?? null,
    data.shopDomain ?? null,
    data.shopName ?? null,
    data.scopes ?? null
  );
}

export function updateConnectionAccount(storeId: string, platform: 'meta' | 'shopify', accountId: string, accountName: string): void {
  const db = getDb();
  db.prepare(
    'UPDATE connections SET account_id = ?, account_name = ? WHERE store_id = ? AND platform = ?'
  ).run(accountId, accountName, storeId, platform);
}

export function deleteConnection(storeId: string, platform: 'meta' | 'shopify'): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM connections WHERE store_id = ? AND platform = ?'
  ).run(storeId, platform);
}

export function getConnectionStatus(storeId: string) {
  const meta = getConnection(storeId, 'meta');
  const shopify = getConnection(storeId, 'shopify');

  return {
    meta: {
      connected: !!meta,
      accountId: meta?.account_id ?? undefined,
      accountName: meta?.account_name ?? undefined,
      lastSynced: meta?.last_synced ?? undefined,
    },
    shopify: {
      connected: !!shopify,
      shopDomain: shopify?.shop_domain ?? undefined,
      shopName: shopify?.shop_name ?? undefined,
      lastSynced: shopify?.last_synced ?? undefined,
    },
  };
}

/**
 * Get all stores that have an active Meta connection.
 * Used to offer "reuse existing connection" when connecting a new store.
 */
export function getAllMetaConnections(): Array<{
  storeId: string;
  storeName: string;
  accountId: string | null;
  accountName: string | null;
  connectedAt: string;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT c.store_id, s.name as store_name, c.account_id, c.account_name, c.connected_at
    FROM connections c
    JOIN stores s ON s.id = c.store_id
    WHERE c.platform = 'meta'
    ORDER BY c.connected_at DESC
  `).all() as Array<{
    store_id: string;
    store_name: string;
    account_id: string | null;
    account_name: string | null;
    connected_at: string;
  }>;

  return rows.map((r) => ({
    storeId: r.store_id,
    storeName: r.store_name,
    accountId: r.account_id,
    accountName: r.account_name,
    connectedAt: r.connected_at,
  }));
}

/**
 * Copy a Meta connection from one store to another.
 * Creates a new row in `connections` for the target store using the same access token.
 */
export function copyMetaConnection(fromStoreId: string, toStoreId: string): void {
  const source = getConnection(fromStoreId, 'meta');
  if (!source) {
    throw new Error(`No Meta connection found for store ${fromStoreId}`);
  }

  upsertConnection({
    storeId: toStoreId,
    platform: 'meta',
    accessToken: source.access_token,
    refreshToken: source.refresh_token ?? undefined,
    expiresAt: source.expires_at ?? undefined,
    accountId: source.account_id ?? undefined,
    accountName: source.account_name ?? undefined,
    scopes: source.scopes ?? undefined,
  });
}

// ------ OAuth State CRUD ------

import { randomBytes } from 'crypto';

export interface OAuthState {
  id: number;
  state_token: string;
  store_id: string;
  platform: 'meta' | 'shopify';
  shop_domain: string | null;
  created_at: string;
  used: number;
}

export function createOAuthState(data: {
  storeId: string;
  platform: 'meta' | 'shopify';
  shopDomain?: string;
}): string {
  const db = getDb();
  const stateToken = randomBytes(32).toString('hex');

  db.prepare(
    'INSERT INTO oauth_states (state_token, store_id, platform, shop_domain) VALUES (?, ?, ?, ?)'
  ).run(stateToken, data.storeId, data.platform, data.shopDomain ?? null);

  // Clean up old states (older than 1 hour)
  db.prepare(
    "DELETE FROM oauth_states WHERE created_at < datetime('now', '-1 hour')"
  ).run();

  return stateToken;
}

export function consumeOAuthState(stateToken: string): OAuthState | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM oauth_states WHERE state_token = ? AND used = 0'
  ).get(stateToken) as OAuthState | undefined;

  if (!row) return null;

  // Mark as used so it can't be replayed
  db.prepare('UPDATE oauth_states SET used = 1 WHERE id = ?').run(row.id);

  return row;
}

// ------ App Credentials CRUD ------

export interface AppCredentials {
  id: number;
  platform: 'meta' | 'shopify';
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  scopes: string | null;
  updated_at: string;
}

export function getAppCredentials(platform: 'meta' | 'shopify'): AppCredentials | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM app_credentials WHERE platform = ?'
  ).get(platform) as AppCredentials | undefined;
  return row ?? null;
}

export function getAllAppCredentials(): { meta: AppCredentials | null; shopify: AppCredentials | null } {
  return {
    meta: getAppCredentials('meta'),
    shopify: getAppCredentials('shopify'),
  };
}

export function upsertAppCredentials(data: {
  platform: 'meta' | 'shopify';
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO app_credentials (platform, app_id, app_secret, redirect_uri, scopes, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(platform) DO UPDATE SET
      app_id = excluded.app_id,
      app_secret = excluded.app_secret,
      redirect_uri = excluded.redirect_uri,
      scopes = COALESCE(excluded.scopes, app_credentials.scopes),
      updated_at = datetime('now')
  `).run(
    data.platform,
    data.appId,
    data.appSecret,
    data.redirectUri,
    data.scopes ?? null
  );
}

export function deleteAppCredentials(platform: 'meta' | 'shopify'): void {
  const db = getDb();
  db.prepare('DELETE FROM app_credentials WHERE platform = ?').run(platform);
}

// ------ Store CRUD ------

export interface DbStore {
  id: string;
  name: string;
  domain: string;
  platform: string;
  api_key: string | null;
  api_secret: string | null;
  created_at: string;
}

export interface DbStoreAdAccount {
  id: number;
  store_id: string;
  ad_account_id: string;
  ad_account_name: string;
  platform: string;
  currency: string | null;
  timezone: string | null;
  is_active: number;
  created_at: string;
}

export function getAllStores(): Array<DbStore & { adAccounts: DbStoreAdAccount[]; shopifyConnected: boolean; metaConnected: boolean }> {
  const db = getDb();
  const stores = db.prepare('SELECT * FROM stores ORDER BY created_at DESC').all() as DbStore[];

  return stores.map((store) => {
    const adAccounts = db.prepare(
      'SELECT * FROM store_ad_accounts WHERE store_id = ? ORDER BY created_at ASC'
    ).all(store.id) as DbStoreAdAccount[];

    const metaConn = db.prepare(
      "SELECT 1 FROM connections WHERE store_id = ? AND platform = 'meta'"
    ).get(store.id);
    const shopifyConn = db.prepare(
      "SELECT 1 FROM connections WHERE store_id = ? AND platform = 'shopify'"
    ).get(store.id);

    return {
      ...store,
      adAccounts,
      metaConnected: !!metaConn,
      shopifyConnected: !!shopifyConn,
    };
  });
}

export function getStore(storeId: string): DbStore | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(storeId) as DbStore | undefined;
  return row ?? null;
}

export function getStoreByDomain(domain: string): DbStore | null {
  const db = getDb();
  const cleaned = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  const row = db.prepare(
    'SELECT * FROM stores WHERE lower(domain) = ?'
  ).get(cleaned) as DbStore | undefined;
  return row ?? null;
}

export function createStore(data: {
  id: string;
  name: string;
  domain: string;
  platform?: string;
  apiKey?: string;
  apiSecret?: string;
}): DbStore {
  const db = getDb();
  db.prepare(
    'INSERT INTO stores (id, name, domain, platform, api_key, api_secret) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(data.id, data.name, data.domain, data.platform || 'shopify', data.apiKey || null, data.apiSecret || null);
  return getStore(data.id)!;
}

export function deleteStore(storeId: string): void {
  const db = getDb();
  // Delete connections for this store too
  db.prepare('DELETE FROM connections WHERE store_id = ?').run(storeId);
  // store_ad_accounts cascade-deleted via foreign key
  db.prepare('DELETE FROM stores WHERE id = ?').run(storeId);
}

// ------ Store Ad Account Mapping CRUD ------

export function getStoreAdAccounts(storeId: string): DbStoreAdAccount[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM store_ad_accounts WHERE store_id = ? ORDER BY created_at ASC'
  ).all(storeId) as DbStoreAdAccount[];
}

export function addStoreAdAccount(data: {
  storeId: string;
  adAccountId: string;
  adAccountName: string;
  platform?: string;
  currency?: string;
  timezone?: string;
}): DbStoreAdAccount {
  const db = getDb();
  db.prepare(`
    INSERT INTO store_ad_accounts (store_id, ad_account_id, ad_account_name, platform, currency, timezone)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, ad_account_id) DO UPDATE SET
      ad_account_name = excluded.ad_account_name,
      currency = COALESCE(excluded.currency, store_ad_accounts.currency),
      timezone = COALESCE(excluded.timezone, store_ad_accounts.timezone)
  `).run(
    data.storeId,
    data.adAccountId,
    data.adAccountName,
    data.platform || 'meta',
    data.currency ?? null,
    data.timezone ?? null
  );

  return db.prepare(
    'SELECT * FROM store_ad_accounts WHERE store_id = ? AND ad_account_id = ?'
  ).get(data.storeId, data.adAccountId) as DbStoreAdAccount;
}

export function removeStoreAdAccount(storeId: string, adAccountId: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM store_ad_accounts WHERE store_id = ? AND ad_account_id = ?'
  ).run(storeId, adAccountId);
}

export function toggleStoreAdAccount(storeId: string, adAccountId: string, isActive: boolean): void {
  const db = getDb();
  db.prepare(
    'UPDATE store_ad_accounts SET is_active = ? WHERE store_id = ? AND ad_account_id = ?'
  ).run(isActive ? 1 : 0, storeId, adAccountId);
}

// ------ P&L Cost Settings CRUD ------

// --- Product Costs ---

export interface DbProductCost {
  id: number;
  store_id: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  cost_per_unit: number;
  cost_type: 'fixed' | 'percentage';
  effective_date: string;
  created_at: string;
}

export function getProductCosts(storeId: string): DbProductCost[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pnl_product_costs WHERE store_id = ? ORDER BY product_name ASC, effective_date DESC'
  ).all(storeId) as DbProductCost[];
}

export function upsertProductCost(data: {
  storeId: string;
  productId: string;
  productName: string;
  sku?: string;
  costPerUnit: number;
  costType?: 'fixed' | 'percentage';
  effectiveDate?: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_product_costs (store_id, product_id, product_name, sku, cost_per_unit, cost_type, effective_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, product_id, effective_date) DO UPDATE SET
      product_name = excluded.product_name,
      sku = COALESCE(excluded.sku, pnl_product_costs.sku),
      cost_per_unit = excluded.cost_per_unit,
      cost_type = excluded.cost_type
  `).run(
    data.storeId,
    data.productId,
    data.productName,
    data.sku ?? null,
    data.costPerUnit,
    data.costType || 'fixed',
    data.effectiveDate || new Date().toISOString().split('T')[0]
  );
}

export function deleteProductCost(storeId: string, productId: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM pnl_product_costs WHERE store_id = ? AND product_id = ?'
  ).run(storeId, productId);
}

// --- Shipping Settings ---

export interface DbShippingSettings {
  id: number;
  store_id: string;
  method: 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item';
  flat_rate: number;
  percentage: number;
  per_item_rate: number;
  updated_at: string;
}

export function getShippingSettings(storeId: string): DbShippingSettings | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM pnl_shipping_settings WHERE store_id = ?'
  ).get(storeId) as DbShippingSettings | undefined;
  return row ?? null;
}

export function upsertShippingSettings(storeId: string, data: {
  method: 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item';
  flatRate?: number;
  percentage?: number;
  perItemRate?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_shipping_settings (store_id, method, flat_rate, percentage, per_item_rate, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      method = excluded.method,
      flat_rate = excluded.flat_rate,
      percentage = excluded.percentage,
      per_item_rate = excluded.per_item_rate,
      updated_at = datetime('now')
  `).run(
    storeId,
    data.method,
    data.flatRate ?? 0,
    data.percentage ?? 0,
    data.perItemRate ?? 0
  );
}

// --- Payment Fees ---

export interface DbPaymentFee {
  id: number;
  store_id: string;
  gateway_name: string;
  fee_percentage: number;
  fee_fixed: number;
  is_active: number;
  created_at: string;
}

export function getPaymentFees(storeId: string): DbPaymentFee[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pnl_payment_fees WHERE store_id = ? ORDER BY gateway_name ASC'
  ).all(storeId) as DbPaymentFee[];
}

export function upsertPaymentFee(storeId: string, data: {
  gatewayName: string;
  feePercentage: number;
  feeFixed: number;
  isActive?: boolean;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_payment_fees (store_id, gateway_name, fee_percentage, fee_fixed, is_active)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(store_id, gateway_name) DO UPDATE SET
      fee_percentage = excluded.fee_percentage,
      fee_fixed = excluded.fee_fixed,
      is_active = excluded.is_active
  `).run(
    storeId,
    data.gatewayName,
    data.feePercentage,
    data.feeFixed,
    data.isActive !== false ? 1 : 0
  );
}

export function deletePaymentFee(storeId: string, gatewayName: string): void {
  const db = getDb();
  db.prepare(
    'DELETE FROM pnl_payment_fees WHERE store_id = ? AND gateway_name = ?'
  ).run(storeId, gatewayName);
}

// --- Custom Expenses ---

export interface DbCustomExpense {
  id: number;
  store_id: string;
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution: 'daily' | 'hourly' | 'smart';
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  created_at: string;
}

export function getCustomExpenses(storeId: string): DbCustomExpense[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pnl_custom_expenses WHERE store_id = ? ORDER BY created_at DESC'
  ).all(storeId) as DbCustomExpense[];
}

export function addCustomExpense(storeId: string, data: {
  name: string;
  category?: 'fixed' | 'variable';
  amount: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution?: 'daily' | 'hourly' | 'smart';
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_custom_expenses (store_id, name, category, amount, frequency, distribution, start_date, end_date, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    storeId,
    data.name,
    data.category || 'fixed',
    data.amount,
    data.frequency || 'monthly',
    data.distribution || 'daily',
    data.startDate ?? null,
    data.endDate ?? null,
    data.isActive !== false ? 1 : 0
  );
}

export function updateCustomExpense(id: number, data: {
  name?: string;
  category?: 'fixed' | 'variable';
  amount?: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution?: 'daily' | 'hourly' | 'smart';
  startDate?: string;
  endDate?: string;
  isActive?: boolean;
}): void {
  const db = getDb();
  // Build SET clause dynamically for partial updates
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
  if (data.category !== undefined) { fields.push('category = ?'); values.push(data.category); }
  if (data.amount !== undefined) { fields.push('amount = ?'); values.push(data.amount); }
  if (data.frequency !== undefined) { fields.push('frequency = ?'); values.push(data.frequency); }
  if (data.distribution !== undefined) { fields.push('distribution = ?'); values.push(data.distribution); }
  if (data.startDate !== undefined) { fields.push('start_date = ?'); values.push(data.startDate); }
  if (data.endDate !== undefined) { fields.push('end_date = ?'); values.push(data.endDate); }
  if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive ? 1 : 0); }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE pnl_custom_expenses SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteCustomExpense(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM pnl_custom_expenses WHERE id = ?').run(id);
}

// --- Handling Fees ---

export interface DbHandlingFees {
  id: number;
  store_id: string;
  fee_type: 'per_order' | 'per_item' | 'percentage';
  amount: number;
  updated_at: string;
}

export function getHandlingFees(storeId: string): DbHandlingFees | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM pnl_handling_fees WHERE store_id = ?'
  ).get(storeId) as DbHandlingFees | undefined;
  return row ?? null;
}

export function upsertHandlingFees(storeId: string, data: {
  feeType: 'per_order' | 'per_item' | 'percentage';
  amount: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_handling_fees (store_id, fee_type, amount, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      fee_type = excluded.fee_type,
      amount = excluded.amount,
      updated_at = datetime('now')
  `).run(
    storeId,
    data.feeType,
    data.amount
  );
}

// --- Store P&L Settings (product type) ---

export interface DbPnlStoreSettings {
  id: number;
  store_id: string;
  product_type: 'physical' | 'digital';
  updated_at: string;
}

export function getPnlStoreSettings(storeId: string): DbPnlStoreSettings | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM pnl_store_settings WHERE store_id = ?'
  ).get(storeId) as DbPnlStoreSettings | undefined;
  return row ?? null;
}

export function upsertPnlStoreSettings(storeId: string, data: {
  productType: 'physical' | 'digital';
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_store_settings (store_id, product_type, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      product_type = excluded.product_type,
      updated_at = datetime('now')
  `).run(
    storeId,
    data.productType
  );
}

// ------ P&L Daily Cache CRUD ------

export interface DbPnlDailyCacheRow {
  id: number;
  store_id: string;
  date: string;
  revenue: number;
  cogs: number;
  ad_spend: number;
  shipping: number;
  fees: number;
  refunds: number;
  net_profit: number;
  margin: number;
  order_count: number;
  full_refund_count: number;
  partial_refund_count: number;
  full_refund_amount: number;
  partial_refund_amount: number;
  synced_at: string;
}

/** Get cached P&L entries for a date range (inclusive). Returns rows sorted by date ASC. */
export function getCachedPnLDays(storeId: string, startDate: string, endDate: string): DbPnlDailyCacheRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM pnl_daily_cache WHERE store_id = ? AND date >= ? AND date <= ? ORDER BY date ASC'
  ).all(storeId, startDate, endDate) as DbPnlDailyCacheRow[];
}

/** Get the most recent synced_at timestamp for a store's cache. Returns null if no cached data. */
export function getPnlCacheLastSynced(storeId: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT MAX(synced_at) as last_synced FROM pnl_daily_cache WHERE store_id = ?'
  ).get(storeId) as { last_synced: string | null } | undefined;
  return row?.last_synced ?? null;
}

/** Upsert a single day's P&L data (INSERT OR REPLACE on store_id + date). */
export function upsertCachedPnLDay(storeId: string, entry: {
  date: string;
  revenue: number;
  cogs: number;
  adSpend: number;
  shipping: number;
  fees: number;
  refunds: number;
  netProfit: number;
  margin: number;
  orderCount?: number;
  fullRefundCount?: number;
  partialRefundCount?: number;
  fullRefundAmount?: number;
  partialRefundAmount?: number;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO pnl_daily_cache (store_id, date, revenue, cogs, ad_spend, shipping, fees, refunds, net_profit, margin, order_count, full_refund_count, partial_refund_count, full_refund_amount, partial_refund_amount, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, date) DO UPDATE SET
      revenue = excluded.revenue,
      cogs = excluded.cogs,
      ad_spend = excluded.ad_spend,
      shipping = excluded.shipping,
      fees = excluded.fees,
      refunds = excluded.refunds,
      net_profit = excluded.net_profit,
      margin = excluded.margin,
      order_count = excluded.order_count,
      full_refund_count = excluded.full_refund_count,
      partial_refund_count = excluded.partial_refund_count,
      full_refund_amount = excluded.full_refund_amount,
      partial_refund_amount = excluded.partial_refund_amount,
      synced_at = datetime('now')
  `).run(
    storeId,
    entry.date,
    entry.revenue,
    entry.cogs,
    entry.adSpend,
    entry.shipping,
    entry.fees,
    entry.refunds,
    entry.netProfit,
    entry.margin,
    entry.orderCount ?? 0,
    entry.fullRefundCount ?? 0,
    entry.partialRefundCount ?? 0,
    entry.fullRefundAmount ?? 0,
    entry.partialRefundAmount ?? 0
  );
}

/** Batch upsert multiple days' P&L data in a single transaction. */
export function batchUpsertCachedPnLDays(storeId: string, entries: Array<{
  date: string;
  revenue: number;
  cogs: number;
  adSpend: number;
  shipping: number;
  fees: number;
  refunds: number;
  netProfit: number;
  margin: number;
  orderCount?: number;
  fullRefundCount?: number;
  partialRefundCount?: number;
  fullRefundAmount?: number;
  partialRefundAmount?: number;
}>): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO pnl_daily_cache (store_id, date, revenue, cogs, ad_spend, shipping, fees, refunds, net_profit, margin, order_count, full_refund_count, partial_refund_count, full_refund_amount, partial_refund_amount, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, date) DO UPDATE SET
      revenue = excluded.revenue,
      cogs = excluded.cogs,
      ad_spend = excluded.ad_spend,
      shipping = excluded.shipping,
      fees = excluded.fees,
      refunds = excluded.refunds,
      net_profit = excluded.net_profit,
      margin = excluded.margin,
      order_count = excluded.order_count,
      full_refund_count = excluded.full_refund_count,
      partial_refund_count = excluded.partial_refund_count,
      full_refund_amount = excluded.full_refund_amount,
      partial_refund_amount = excluded.partial_refund_amount,
      synced_at = datetime('now')
  `);

  const runBatch = db.transaction((rows: typeof entries) => {
    for (const entry of rows) {
      stmt.run(
        storeId,
        entry.date,
        entry.revenue,
        entry.cogs,
        entry.adSpend,
        entry.shipping,
        entry.fees,
        entry.refunds,
        entry.netProfit,
        entry.margin,
        entry.orderCount ?? 0,
        entry.fullRefundCount ?? 0,
        entry.partialRefundCount ?? 0,
        entry.fullRefundAmount ?? 0,
        entry.partialRefundAmount ?? 0
      );
    }
  });

  runBatch(entries);
}

/** Delete all cached P&L data for a store (e.g., on reconnect or settings change). */
export function clearCachedPnL(storeId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM pnl_daily_cache WHERE store_id = ?').run(storeId);
}

// ------ Tracking Config + Events ------

export interface DbTrackingConfig {
  id: number;
  store_id: string;
  pixel_id: string;
  domain: string;
  server_side_enabled: number;
  attribution_model: 'first_click' | 'last_click' | 'linear' | 'time_decay' | 'position_based';
  attribution_window: '1day' | '7day' | '28day';
  created_at: string;
  updated_at: string;
}

export interface DbTrackingEvent {
  id: number;
  store_id: string;
  event_name: string;
  event_id: string | null;
  source: 'browser' | 'server' | 'shopify';
  occurred_at: string;
  created_at: string;
  page_url: string | null;
  referrer: string | null;
  session_id: string | null;
  click_id: string | null;
  fbp: string | null;
  fbc: string | null;
  external_id: string | null;
  email_hash: string | null;
  phone_hash: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  value: number | null;
  currency: string | null;
  order_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  payload_json: string | null;
}

export interface DbTrackingEventSummary {
  event_name: string;
  last_fired: string | null;
  count_24h: number;
  count_7d: number;
}

export interface DbTrackingEntityMetricRow {
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  results: number;
  purchases: number;
  purchase_value: number;
}

export interface DbTrackingCoverageRow {
  total_purchases: number;
  mapped_purchases: number;
  mapped_campaign: number;
  mapped_adset: number;
  mapped_ad: number;
}

export interface DbTrackingTopEntityRow {
  entity_id: string;
  purchases: number;
  purchase_value: number;
}

export interface DbTrackingUnattributedPurchaseRow {
  event_id: string | null;
  order_id: string | null;
  occurred_at: string;
  value: number | null;
  currency: string | null;
}

export interface DbTrackingPurchaseLiveRow {
  event_id: string | null;
  order_id: string | null;
  occurred_at: string;
  source: 'browser' | 'server' | 'shopify';
  value: number | null;
  currency: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  click_id: string | null;
  fbc: string | null;
  fbp: string | null;
  email_hash: string | null;
  payload_json: string | null;
}

export interface DbTrackingAttributionIds {
  campaignId: string | null;
  adSetId: string | null;
  adId: string | null;
}

export interface DbTrackingAttributionLookupInput {
  storeId: string;
  beforeIso?: string;
  clickId?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  emailHash?: string | null;
}

export interface DbTrackingAttributionScored extends DbTrackingAttributionIds {
  confidence: number;
  score: number;
  matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
  matchedAt: string;
  source: 'browser' | 'server' | 'shopify';
  ageHours: number | null;
}

export interface DbTrackingAttributionTimeProximity extends DbTrackingAttributionIds {
  confidence: number;
  score: number;
  matchedAt: string;
  source: 'browser' | 'server' | 'shopify';
  ageHours: number | null;
}

export function getTrackingConfig(storeId: string): DbTrackingConfig | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM tracking_configs WHERE store_id = ?'
  ).get(storeId) as DbTrackingConfig | undefined;
  return row ?? null;
}

export function getTrackingConfigByPixelId(pixelId: string): DbTrackingConfig | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM tracking_configs WHERE pixel_id = ?'
  ).get(pixelId) as DbTrackingConfig | undefined;
  return row ?? null;
}

export function upsertTrackingConfig(storeId: string, data: {
  pixelId: string;
  domain: string;
  serverSideEnabled?: boolean;
  attributionModel?: 'first_click' | 'last_click' | 'linear' | 'time_decay' | 'position_based';
  attributionWindow?: '1day' | '7day' | '28day';
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO tracking_configs (store_id, pixel_id, domain, server_side_enabled, attribution_model, attribution_window, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id) DO UPDATE SET
      pixel_id = excluded.pixel_id,
      domain = excluded.domain,
      server_side_enabled = excluded.server_side_enabled,
      attribution_model = excluded.attribution_model,
      attribution_window = excluded.attribution_window,
      updated_at = datetime('now')
  `).run(
    storeId,
    data.pixelId,
    data.domain,
    data.serverSideEnabled ? 1 : 0,
    data.attributionModel || 'last_click',
    data.attributionWindow || '7day'
  );
}

export function insertTrackingEvent(data: {
  storeId: string;
  eventName: string;
  eventId?: string | null;
  source?: 'browser' | 'server' | 'shopify';
  occurredAt: string;
  pageUrl?: string | null;
  referrer?: string | null;
  sessionId?: string | null;
  clickId?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  externalId?: string | null;
  emailHash?: string | null;
  phoneHash?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
  value?: number | null;
  currency?: string | null;
  orderId?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  payloadJson?: string | null;
}): { inserted: boolean; updated: boolean } {
  const db = getDb();
  const insertResult = db.prepare(`
    INSERT INTO tracking_events (
      store_id, event_name, event_id, source, occurred_at, page_url, referrer,
      session_id, click_id, fbp, fbc, external_id, email_hash, phone_hash,
      ip_hash, user_agent, value, currency, order_id, campaign_id, adset_id,
      ad_id, payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(store_id, event_id) DO NOTHING
  `).run(
    data.storeId,
    data.eventName,
    data.eventId ?? null,
    data.source || 'browser',
    data.occurredAt,
    data.pageUrl ?? null,
    data.referrer ?? null,
    data.sessionId ?? null,
    data.clickId ?? null,
    data.fbp ?? null,
    data.fbc ?? null,
    data.externalId ?? null,
    data.emailHash ?? null,
    data.phoneHash ?? null,
    data.ipHash ?? null,
    data.userAgent ?? null,
    data.value ?? null,
    data.currency ?? null,
    data.orderId ?? null,
    data.campaignId ?? null,
    data.adSetId ?? null,
    data.adId ?? null,
    data.payloadJson ?? null
  );
  if (insertResult.changes > 0) {
    return { inserted: true, updated: false };
  }

  if (!data.eventId) {
    return { inserted: false, updated: false };
  }

  const updateResult = db.prepare(`
    UPDATE tracking_events
    SET
      click_id = COALESCE(click_id, ?),
      value = COALESCE(value, ?),
      currency = COALESCE(currency, ?),
      order_id = COALESCE(order_id, ?),
      campaign_id = COALESCE(campaign_id, ?),
      adset_id = COALESCE(adset_id, ?),
      ad_id = COALESCE(ad_id, ?),
      payload_json = COALESCE(payload_json, ?)
    WHERE store_id = ? AND event_id = ?
  `).run(
    data.clickId ?? null,
    data.value ?? null,
    data.currency ?? null,
    data.orderId ?? null,
    data.campaignId ?? null,
    data.adSetId ?? null,
    data.adId ?? null,
    data.payloadJson ?? null,
    data.storeId,
    data.eventId
  );

  return { inserted: false, updated: updateResult.changes > 0 };
}

/**
 * Bulk-map unmapped Purchase events to campaigns using signal overlap with
 * existing tracked events that DO have entity IDs. Runs a single SQL UPDATE
 * instead of N individual lookups — orders of magnitude faster than per-order
 * attribution scoring. Used after fast-mode backfill to fill in campaign mapping.
 *
 * Matching priority: click_id > fbc > fbp > email_hash (first match wins via LIMIT 1).
 * Only maps to events that occurred within ±24 hours of the purchase.
 */
export function bulkMapUnmappedPurchases(storeId: string, sinceIso: string): number {
  const db = getDb();
  // Find the best matching tracked event for each unmapped purchase
  const result = db.prepare(`
    UPDATE tracking_events
    SET
      campaign_id = (
        SELECT t.campaign_id FROM tracking_events t
        WHERE t.store_id = tracking_events.store_id
          AND t.campaign_id IS NOT NULL
          AND (
            (tracking_events.click_id IS NOT NULL AND tracking_events.click_id != '' AND t.click_id = tracking_events.click_id)
            OR (tracking_events.fbc IS NOT NULL AND tracking_events.fbc != '' AND t.fbc = tracking_events.fbc)
            OR (tracking_events.fbp IS NOT NULL AND tracking_events.fbp != '' AND t.fbp = tracking_events.fbp)
            OR (tracking_events.email_hash IS NOT NULL AND tracking_events.email_hash != '' AND t.email_hash = tracking_events.email_hash)
          )
          AND ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at)) < 1
        ORDER BY
          CASE
            WHEN t.click_id = tracking_events.click_id THEN 0
            WHEN t.fbc = tracking_events.fbc THEN 1
            WHEN t.fbp = tracking_events.fbp THEN 2
            ELSE 3
          END,
          ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at))
        LIMIT 1
      ),
      adset_id = (
        SELECT t.adset_id FROM tracking_events t
        WHERE t.store_id = tracking_events.store_id
          AND t.campaign_id IS NOT NULL
          AND (
            (tracking_events.click_id IS NOT NULL AND tracking_events.click_id != '' AND t.click_id = tracking_events.click_id)
            OR (tracking_events.fbc IS NOT NULL AND tracking_events.fbc != '' AND t.fbc = tracking_events.fbc)
            OR (tracking_events.fbp IS NOT NULL AND tracking_events.fbp != '' AND t.fbp = tracking_events.fbp)
            OR (tracking_events.email_hash IS NOT NULL AND tracking_events.email_hash != '' AND t.email_hash = tracking_events.email_hash)
          )
          AND ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at)) < 1
        ORDER BY
          CASE
            WHEN t.click_id = tracking_events.click_id THEN 0
            WHEN t.fbc = tracking_events.fbc THEN 1
            WHEN t.fbp = tracking_events.fbp THEN 2
            ELSE 3
          END,
          ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at))
        LIMIT 1
      ),
      ad_id = (
        SELECT t.ad_id FROM tracking_events t
        WHERE t.store_id = tracking_events.store_id
          AND t.campaign_id IS NOT NULL
          AND (
            (tracking_events.click_id IS NOT NULL AND tracking_events.click_id != '' AND t.click_id = tracking_events.click_id)
            OR (tracking_events.fbc IS NOT NULL AND tracking_events.fbc != '' AND t.fbc = tracking_events.fbc)
            OR (tracking_events.fbp IS NOT NULL AND tracking_events.fbp != '' AND t.fbp = tracking_events.fbp)
            OR (tracking_events.email_hash IS NOT NULL AND tracking_events.email_hash != '' AND t.email_hash = tracking_events.email_hash)
          )
          AND ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at)) < 1
        ORDER BY
          CASE
            WHEN t.click_id = tracking_events.click_id THEN 0
            WHEN t.fbc = tracking_events.fbc THEN 1
            WHEN t.fbp = tracking_events.fbp THEN 2
            ELSE 3
          END,
          ABS(julianday(t.occurred_at) - julianday(tracking_events.occurred_at))
        LIMIT 1
      )
    WHERE store_id = ?
      AND event_name = 'Purchase'
      AND campaign_id IS NULL
      AND adset_id IS NULL
      AND ad_id IS NULL
      AND datetime(occurred_at) >= datetime(?)
      AND (click_id IS NOT NULL OR fbc IS NOT NULL OR fbp IS NOT NULL OR email_hash IS NOT NULL)
  `).run(storeId, sinceIso);
  return result.changes;
}

export function getTrackingEntityMetrics(
  storeId: string,
  sinceIso: string,
  untilIso: string
): DbTrackingEntityMetricRow[] {
  const db = getDb();
  // Deduplicate by order_id to prevent double-counting when both browser pixel
  // and Shopify webhook/backfill create Purchase events for the same order.
  // ROW_NUMBER partitions by COALESCE(order_id, event_id) so events without
  // order_id fall back to event_id (always unique). Shopify source is preferred
  // over browser/server because it has the authoritative order value.
  return db.prepare(`
    WITH deduped AS (
      SELECT
        event_name,
        campaign_id,
        adset_id,
        ad_id,
        value,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(order_id, event_id)
          ORDER BY
            CASE WHEN source = 'shopify' THEN 0 WHEN source = 'server' THEN 1 ELSE 2 END,
            datetime(occurred_at) DESC
        ) AS rn
      FROM tracking_events
      WHERE store_id = ?
        AND datetime(occurred_at) >= datetime(?)
        AND datetime(occurred_at) <= datetime(?)
        AND (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
    )
    SELECT
      campaign_id,
      adset_id,
      ad_id,
      SUM(
        CASE WHEN event_name IN (
          'Purchase',
          'Lead',
          'CompleteRegistration',
          'Contact',
          'SubmitApplication',
          'Subscribe',
          'StartTrial',
          'AddPaymentInfo',
          'InitiateCheckout',
          'AddToCart'
        ) THEN 1 ELSE 0 END
      ) AS results,
      SUM(CASE WHEN event_name = 'Purchase' THEN 1 ELSE 0 END) AS purchases,
      SUM(CASE WHEN event_name = 'Purchase' THEN COALESCE(value, 0) ELSE 0 END) AS purchase_value
    FROM deduped
    WHERE rn = 1
    GROUP BY campaign_id, adset_id, ad_id
  `).all(storeId, sinceIso, untilIso) as DbTrackingEntityMetricRow[];
}

export function getTrackingAttributionCoverage(
  storeId: string,
  sinceIso: string,
  untilIso: string
): DbTrackingCoverageRow {
  const db = getDb();
  // Deduplicate Purchase events by order_id to avoid inflated counts from
  // both browser pixel and Shopify creating events for the same order.
  const row = db.prepare(`
    WITH deduped AS (
      SELECT
        event_name,
        campaign_id,
        adset_id,
        ad_id,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(order_id, event_id)
          ORDER BY
            CASE WHEN source = 'shopify' THEN 0 WHEN source = 'server' THEN 1 ELSE 2 END,
            datetime(occurred_at) DESC
        ) AS rn
      FROM tracking_events
      WHERE store_id = ?
        AND event_name = 'Purchase'
        AND datetime(occurred_at) >= datetime(?)
        AND datetime(occurred_at) <= datetime(?)
    )
    SELECT
      COUNT(*) AS total_purchases,
      SUM(
        CASE
          WHEN (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
          THEN 1
          ELSE 0
        END
      ) AS mapped_purchases,
      SUM(CASE WHEN campaign_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_campaign,
      SUM(CASE WHEN adset_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_adset,
      SUM(CASE WHEN ad_id IS NOT NULL THEN 1 ELSE 0 END) AS mapped_ad
    FROM deduped
    WHERE rn = 1
  `).get(storeId, sinceIso, untilIso) as DbTrackingCoverageRow | undefined;

  return {
    total_purchases: Number(row?.total_purchases || 0),
    mapped_purchases: Number(row?.mapped_purchases || 0),
    mapped_campaign: Number(row?.mapped_campaign || 0),
    mapped_adset: Number(row?.mapped_adset || 0),
    mapped_ad: Number(row?.mapped_ad || 0),
  };
}

export function getTrackingTopMappedEntities(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  level: 'campaign' | 'adset' | 'ad',
  limit = 20
): DbTrackingTopEntityRow[] {
  const db = getDb();
  const col =
    level === 'campaign' ? 'campaign_id' : level === 'adset' ? 'adset_id' : 'ad_id';
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return db.prepare(`
    SELECT
      ${col} AS entity_id,
      COUNT(*) AS purchases,
      SUM(COALESCE(value, 0)) AS purchase_value
    FROM tracking_events
    WHERE store_id = ?
      AND datetime(occurred_at) >= datetime(?)
      AND datetime(occurred_at) <= datetime(?)
      AND event_name = 'Purchase'
      AND ${col} IS NOT NULL
    GROUP BY ${col}
    ORDER BY purchases DESC, purchase_value DESC
    LIMIT ${safeLimit}
  `).all(storeId, sinceIso, untilIso) as DbTrackingTopEntityRow[];
}

export function getTrackingRecentUnattributedPurchases(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  limit = 25
): DbTrackingUnattributedPurchaseRow[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  return db.prepare(`
    SELECT
      event_id,
      order_id,
      occurred_at,
      value,
      currency
    FROM tracking_events
    WHERE store_id = ?
      AND datetime(occurred_at) >= datetime(?)
      AND datetime(occurred_at) <= datetime(?)
      AND event_name = 'Purchase'
      AND campaign_id IS NULL
      AND adset_id IS NULL
      AND ad_id IS NULL
    ORDER BY datetime(occurred_at) DESC
    LIMIT ${safeLimit}
  `).all(storeId, sinceIso, untilIso) as DbTrackingUnattributedPurchaseRow[];
}

export function getTrackingRecentPurchasesWithMapping(
  storeId: string,
  sinceIso: string,
  untilIso: string,
  limit = 50
): DbTrackingPurchaseLiveRow[] {
  const db = getDb();
  const safeLimit = Math.max(1, Math.min(10000, Math.floor(limit)));
  return db.prepare(`
    SELECT
      event_id,
      order_id,
      occurred_at,
      source,
      value,
      currency,
      campaign_id,
      adset_id,
      ad_id,
      click_id,
      fbc,
      fbp,
      email_hash,
      payload_json
    FROM tracking_events
    WHERE store_id = ?
      AND datetime(occurred_at) >= datetime(?)
      AND datetime(occurred_at) <= datetime(?)
      AND event_name = 'Purchase'
    ORDER BY datetime(occurred_at) DESC
    LIMIT ${safeLimit}
  `).all(storeId, sinceIso, untilIso) as DbTrackingPurchaseLiveRow[];
}

export function getTrackingShopifyPurchaseEventIdByOrderId(
  storeId: string,
  orderId: string
): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT event_id
      FROM tracking_events
      WHERE store_id = ?
        AND source = 'shopify'
        AND event_name = 'Purchase'
        AND order_id = ?
      ORDER BY datetime(occurred_at) DESC
      LIMIT 1
    `
    )
    .get(storeId, orderId) as { event_id: string | null } | undefined;
  return row?.event_id ?? null;
}

export function getLatestTrackingAttributionByClickId(
  storeId: string,
  clickId: string,
  beforeIso?: string
): DbTrackingAttributionIds | null {
  const db = getDb();
  const row = beforeIso
    ? db.prepare(`
        SELECT campaign_id, adset_id, ad_id
        FROM tracking_events
        WHERE store_id = ?
          AND click_id = ?
          AND occurred_at <= ?
          AND (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
        ORDER BY occurred_at DESC
        LIMIT 1
      `).get(storeId, clickId, beforeIso) as
        | { campaign_id: string | null; adset_id: string | null; ad_id: string | null }
        | undefined
    : db.prepare(`
        SELECT campaign_id, adset_id, ad_id
        FROM tracking_events
        WHERE store_id = ?
          AND click_id = ?
          AND (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
        ORDER BY occurred_at DESC
        LIMIT 1
      `).get(storeId, clickId) as
        | { campaign_id: string | null; adset_id: string | null; ad_id: string | null }
        | undefined;

  if (!row) return null;
  return {
    campaignId: row.campaign_id ?? null,
    adSetId: row.adset_id ?? null,
    adId: row.ad_id ?? null,
  };
}

export function getLatestTrackingAttributionBySignals(
  input: DbTrackingAttributionLookupInput
): DbTrackingAttributionIds | null {
  const scored = getScoredTrackingAttributionBySignals(input);
  if (!scored) return null;
  return {
    campaignId: scored.campaignId,
    adSetId: scored.adSetId,
    adId: scored.adId,
  };
}

function computeSignalMatchScore(args: {
  matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'>;
  source: 'browser' | 'server' | 'shopify';
  ageHours: number | null;
}): number {
  const has = new Set(args.matchedSignals);
  let score = 0;

  if (has.has('click_id')) score += 72;
  if (has.has('fbc')) score += 58;
  if (has.has('fbp')) score += 24;
  if (has.has('email_hash')) score += 12;

  if (has.has('click_id') && has.has('fbc')) score += 18;
  if (args.matchedSignals.length >= 2) score += (args.matchedSignals.length - 1) * 6;

  if (args.ageHours !== null) {
    const h = args.ageHours;
    if (h > 0) {
      const recencyMultiplier =
        h <= 1 ? 1 :
        h <= 6 ? 0.97 :
        h <= 24 ? 0.9 :
        h <= 72 ? 0.75 :
        h <= 168 ? 0.55 : 0.35;
      score *= recencyMultiplier;
    }
    if (args.matchedSignals.length === 1 && has.has('email_hash') && h > 120) {
      score *= 0.35;
    }
    if (args.matchedSignals.length === 1 && has.has('fbp') && h > 48) {
      score *= 0.6;
    }
  }

  if (args.source === 'shopify') {
    // Slightly downweight because these rows may themselves be fallback-derived.
    score *= 0.72;
  }

  return score;
}

export function getScoredTrackingAttributionBySignals(
  input: DbTrackingAttributionLookupInput
): DbTrackingAttributionScored | null {
  const db = getDb();
  const whereParts: string[] = [];
  const params: Array<string> = [input.storeId];

  if (input.clickId) {
    whereParts.push('click_id = ?');
    params.push(input.clickId);
  }
  if (input.fbc) {
    whereParts.push('fbc = ?');
    params.push(input.fbc);
  }
  if (input.fbp) {
    whereParts.push('fbp = ?');
    params.push(input.fbp);
  }
  if (input.emailHash) {
    whereParts.push('email_hash = ?');
    params.push(input.emailHash);
  }
  if (whereParts.length === 0) return null;

  let sql = `
    SELECT campaign_id, adset_id, ad_id, occurred_at, source, click_id, fbc, fbp, email_hash
    FROM tracking_events
    WHERE store_id = ?
      AND (${whereParts.join(' OR ')})
      AND (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
      AND event_name != 'Refund'
  `;
  if (input.beforeIso) {
    sql += ' AND datetime(occurred_at) <= datetime(?)';
    params.push(input.beforeIso);
  }
  sql += ' ORDER BY datetime(occurred_at) DESC LIMIT 250';

  const rows = db.prepare(sql).all(...params) as Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    occurred_at: string;
    source: 'browser' | 'server' | 'shopify';
    click_id: string | null;
    fbc: string | null;
    fbp: string | null;
    email_hash: string | null;
  }>;
  if (rows.length === 0) return null;

  const beforeTs =
    input.beforeIso && Number.isFinite(Date.parse(input.beforeIso))
      ? Date.parse(input.beforeIso)
      : null;

  let best: DbTrackingAttributionScored | null = null;
  for (const row of rows) {
    const matchedSignals: Array<'click_id' | 'fbc' | 'fbp' | 'email_hash'> = [];
    if (input.clickId && row.click_id === input.clickId) matchedSignals.push('click_id');
    if (input.fbc && row.fbc === input.fbc) matchedSignals.push('fbc');
    if (input.fbp && row.fbp === input.fbp) matchedSignals.push('fbp');
    if (input.emailHash && row.email_hash === input.emailHash) matchedSignals.push('email_hash');
    if (matchedSignals.length === 0) continue;

    let ageHours: number | null = null;
    if (beforeTs !== null) {
      const rowTs = Date.parse(row.occurred_at);
      if (Number.isFinite(rowTs)) {
        ageHours = Math.max(0, (beforeTs - rowTs) / (1000 * 60 * 60));
      }
    }

    const score = computeSignalMatchScore({
      matchedSignals,
      source: row.source,
      ageHours,
    });
    const confidence = Math.max(0.05, Math.min(0.98, score / 120));

    if (!best || score > best.score || (score === best.score && row.occurred_at > best.matchedAt)) {
      best = {
        campaignId: row.campaign_id ?? null,
        adSetId: row.adset_id ?? null,
        adId: row.ad_id ?? null,
        confidence,
        score,
        matchedSignals,
        matchedAt: row.occurred_at,
        source: row.source,
        ageHours,
      };
    }
  }

  return best;
}

export function getTrackingAttributionByTimeProximity(input: {
  storeId: string;
  occurredAt: string;
  windowMinutes?: number;
}): DbTrackingAttributionTimeProximity | null {
  const db = getDb();
  const windowMinutes = Math.max(2, Math.min(60, Math.floor(input.windowMinutes ?? 10)));
  const windowSeconds = windowMinutes * 60;
  const occurredTs = Date.parse(input.occurredAt);
  if (!Number.isFinite(occurredTs)) return null;

  const rows = db.prepare(`
    SELECT campaign_id, adset_id, ad_id, occurred_at, source
    FROM tracking_events
    WHERE store_id = ?
      AND event_name = 'Purchase'
      AND (campaign_id IS NOT NULL OR adset_id IS NOT NULL OR ad_id IS NOT NULL)
      AND ABS(strftime('%s', occurred_at) - strftime('%s', ?)) <= ?
    ORDER BY
      ABS(strftime('%s', occurred_at) - strftime('%s', ?)) ASC,
      CASE source
        WHEN 'shopify' THEN 0
        WHEN 'server' THEN 1
        ELSE 2
      END ASC,
      datetime(occurred_at) DESC
    LIMIT 8
  `).all(input.storeId, input.occurredAt, windowSeconds, input.occurredAt) as Array<{
    campaign_id: string | null;
    adset_id: string | null;
    ad_id: string | null;
    occurred_at: string;
    source: 'browser' | 'server' | 'shopify';
  }>;
  if (rows.length === 0) return null;

  const scored = rows
    .map((row) => {
      const rowTs = Date.parse(row.occurred_at);
      if (!Number.isFinite(rowTs)) return null;
      const diffSeconds = Math.abs(Math.round((occurredTs - rowTs) / 1000));
      return { row, diffSeconds };
    })
    .filter((item): item is { row: {
      campaign_id: string | null;
      adset_id: string | null;
      ad_id: string | null;
      occurred_at: string;
      source: 'browser' | 'server' | 'shopify';
    }; diffSeconds: number } => item !== null);
  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (a.diffSeconds !== b.diffSeconds) return a.diffSeconds - b.diffSeconds;
    return Date.parse(b.row.occurred_at) - Date.parse(a.row.occurred_at);
  });

  const best = scored[0];
  const bestKey = `${best.row.campaign_id || ''}|${best.row.adset_id || ''}|${best.row.ad_id || ''}`;

  // Guardrail: if a different mapping is almost equally close, do not model.
  const nearestDifferent = scored.find((entry) => {
    const key = `${entry.row.campaign_id || ''}|${entry.row.adset_id || ''}|${entry.row.ad_id || ''}`;
    return key !== bestKey;
  });
  if (nearestDifferent && nearestDifferent.diffSeconds - best.diffSeconds <= 120) {
    return null;
  }

  let confidence = 0.42;
  if (best.diffSeconds <= 60) confidence = 0.76;
  else if (best.diffSeconds <= 3 * 60) confidence = 0.72;
  else if (best.diffSeconds <= 5 * 60) confidence = 0.67;
  else if (best.diffSeconds <= 10 * 60) confidence = 0.6;
  else if (best.diffSeconds <= 15 * 60) confidence = 0.53;

  return {
    campaignId: best.row.campaign_id ?? null,
    adSetId: best.row.adset_id ?? null,
    adId: best.row.ad_id ?? null,
    confidence,
    score: Math.round(confidence * 100),
    matchedAt: best.row.occurred_at,
    source: best.row.source,
    ageHours: best.diffSeconds / 3600,
  };
}

export function getTrackingEventSummaries(storeId: string): DbTrackingEventSummary[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      event_name,
      MAX(occurred_at) AS last_fired,
      SUM(CASE WHEN occurred_at >= datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS count_24h,
      SUM(CASE WHEN occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS count_7d
    FROM tracking_events
    WHERE store_id = ?
    GROUP BY event_name
  `).all(storeId) as DbTrackingEventSummary[];
}

export function getLatestTrackingEventAt(storeId: string): string | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT MAX(occurred_at) as latest FROM tracking_events WHERE store_id = ?'
  ).get(storeId) as { latest: string | null } | undefined;
  return row?.latest ?? null;
}

export function countTrackingServerEvents24h(storeId: string): number {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) as cnt
     FROM tracking_events
     WHERE store_id = ? AND source = 'server' AND occurred_at >= datetime('now', '-24 hours')`
  ).get(storeId) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

export function getTrackingEventsSince(storeId: string, sinceIso: string): DbTrackingEvent[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tracking_events WHERE store_id = ? AND occurred_at >= ? ORDER BY occurred_at ASC'
  ).all(storeId, sinceIso) as DbTrackingEvent[];
}

export function markTrackingEventMetaDelivery(data: {
  storeId: string;
  eventId: string;
  forwarded: boolean;
  error?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    UPDATE tracking_events
    SET meta_forwarded = ?,
        meta_last_attempt_at = datetime('now'),
        meta_last_error = ?
    WHERE store_id = ? AND event_id = ?
  `).run(data.forwarded ? 1 : 0, data.error ?? null, data.storeId, data.eventId);
}

// ------ Meta Endpoint Snapshot Cache ------

export interface DbMetaEndpointSnapshot {
  id: number;
  store_id: string;
  endpoint: MetaSnapshotEndpoint;
  scope_id: string;
  variant_key: string;
  row_count: number;
  payload_json: string;
  updated_at: string;
}

export type MetaSnapshotEndpoint = 'creatives' | 'adsets' | 'ads' | 'campaigns' | 'insights';

export function upsertMetaEndpointSnapshot(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string,
  variantKey: string,
  payload: unknown
): void {
  const db = getDb();
  const payloadJson = JSON.stringify(payload);
  const rowCount = Array.isArray(payload) ? payload.length : 0;
  db.prepare(`
    INSERT INTO meta_endpoint_snapshots (store_id, endpoint, scope_id, variant_key, row_count, payload_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(store_id, endpoint, scope_id, variant_key) DO UPDATE SET
      row_count = excluded.row_count,
      payload_json = excluded.payload_json,
      updated_at = datetime('now')
  `).run(storeId, endpoint, scopeId, variantKey, rowCount, payloadJson);
}

export function getMetaEndpointSnapshot<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string,
  variantKey: string
): { data: T; updatedAt: string; rowCount: number } | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT payload_json, updated_at, row_count
    FROM meta_endpoint_snapshots
    WHERE store_id = ? AND endpoint = ? AND scope_id = ? AND variant_key = ?
    LIMIT 1
  `).get(storeId, endpoint, scopeId, variantKey) as
    | { payload_json: string; updated_at: string; row_count: number }
    | undefined;
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.payload_json) as T,
      updatedAt: row.updated_at,
      rowCount: row.row_count,
    };
  } catch {
    return null;
  }
}

export function getLatestMetaEndpointSnapshot<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  scopeId: string
): { data: T; updatedAt: string; rowCount: number } | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT payload_json, updated_at, row_count
    FROM meta_endpoint_snapshots
    WHERE store_id = ? AND endpoint = ? AND scope_id = ?
    ORDER BY updated_at DESC
    LIMIT 1
  `).get(storeId, endpoint, scopeId) as
    | { payload_json: string; updated_at: string; row_count: number }
    | undefined;
  if (!row) return null;
  try {
    return {
      data: JSON.parse(row.payload_json) as T,
      updatedAt: row.updated_at,
      rowCount: row.row_count,
    };
  } catch {
    return null;
  }
}

export function getRecentMetaEndpointSnapshots<T>(
  storeId: string,
  endpoint: MetaSnapshotEndpoint,
  limit = 50
): Array<{ scopeId: string; variantKey: string; data: T; updatedAt: string; rowCount: number }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT scope_id, variant_key, payload_json, updated_at, row_count
    FROM meta_endpoint_snapshots
    WHERE store_id = ? AND endpoint = ?
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(storeId, endpoint, Math.max(1, limit)) as Array<{
    scope_id: string;
    variant_key: string;
    payload_json: string;
    updated_at: string;
    row_count: number;
  }>;

  const parsed: Array<{ scopeId: string; variantKey: string; data: T; updatedAt: string; rowCount: number }> = [];
  for (const row of rows) {
    try {
      parsed.push({
        scopeId: row.scope_id,
        variantKey: row.variant_key,
        data: JSON.parse(row.payload_json) as T,
        updatedAt: row.updated_at,
        rowCount: row.row_count,
      });
    } catch {
      // ignore malformed payload rows
    }
  }
  return parsed;
}
