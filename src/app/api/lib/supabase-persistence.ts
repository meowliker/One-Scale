import {
  addStoreAdAccount,
  createStore,
  DbConnection,
  DbStore,
  DbStoreAdAccount,
  getDb,
  getStore,
  toggleStoreAdAccount,
  upsertConnection,
} from '@/app/api/lib/db';
import { decryptSecret, encryptSecret } from '@/app/api/lib/crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || '';

const hydrateCache = new Map<string, number>();
const HYDRATE_TTL_MS = 30_000;

export function isSupabasePersistenceEnabled(): boolean {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  return true;
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
  // Legacy keys are JWT-like and can be used as Bearer tokens.
  if (SUPABASE_SERVICE_ROLE_KEY.split('.').length === 3) {
    out.Authorization = `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`;
  }
  return out;
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return undefined as T;
  const body = await res.text();
  if (!body) return undefined as T;
  return JSON.parse(body) as T;
}

export async function listPersistentStores(): Promise<Array<DbStore & { adAccounts: DbStoreAdAccount[]; shopifyConnected: boolean; metaConnected: boolean }>> {
  const [stores, accounts, connections] = await Promise.all([
    rest<DbStore[]>('/stores?select=*&order=created_at.desc'),
    rest<Array<DbStoreAdAccount & { is_active: boolean | number }>>('/store_ad_accounts?select=*'),
    rest<Array<{ store_id: string; platform: 'meta' | 'shopify' }>>('/connections?select=store_id,platform'),
  ]);

  return stores.map((store) => ({
    ...store,
    adAccounts: accounts
      .filter((a) => a.store_id === store.id)
      .map((a) => ({ ...a, is_active: a.is_active ? 1 : 0 })) as DbStoreAdAccount[],
    metaConnected: connections.some((c) => c.store_id === store.id && c.platform === 'meta'),
    shopifyConnected: connections.some((c) => c.store_id === store.id && c.platform === 'shopify'),
  }));
}

export async function getPersistentStore(storeId: string): Promise<DbStore | null> {
  const rows = await rest<DbStore[]>(
    `/stores?id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function getPersistentConnectionStatus(storeId: string): Promise<{
  meta: {
    connected: boolean;
    accountId?: string;
    accountName?: string;
    lastSynced?: string;
  };
  shopify: {
    connected: boolean;
    shopDomain?: string;
    shopName?: string;
    lastSynced?: string;
  };
}> {
  const [metaConn, shopifyConn] = await Promise.all([
    getPersistentConnection(storeId, 'meta'),
    getPersistentConnection(storeId, 'shopify'),
  ]);

  return {
    meta: {
      connected: !!metaConn,
      accountId: metaConn?.account_id ?? undefined,
      accountName: metaConn?.account_name ?? undefined,
      lastSynced: metaConn?.last_synced ?? undefined,
    },
    shopify: {
      connected: !!shopifyConn,
      shopDomain: shopifyConn?.shop_domain ?? undefined,
      shopName: shopifyConn?.shop_name ?? undefined,
      lastSynced: shopifyConn?.last_synced ?? undefined,
    },
  };
}

export async function getAllPersistentMetaConnections(): Promise<Array<{
  storeId: string;
  storeName: string;
  accountId: string | null;
  accountName: string | null;
  connectedAt: string;
}>> {
  // Supabase REST API doesn't support JOINs directly, so we fetch both tables
  const [connections, stores] = await Promise.all([
    rest<Array<{
      store_id: string;
      account_id: string | null;
      account_name: string | null;
      connected_at: string;
    }>>("/connections?platform=eq.meta&select=store_id,account_id,account_name,connected_at&order=connected_at.desc"),
    rest<Array<{ id: string; name: string }>>('/stores?select=id,name'),
  ]);

  const storeMap = new Map(stores.map((s) => [s.id, s.name]));

  return connections.map((c) => ({
    storeId: c.store_id,
    storeName: storeMap.get(c.store_id) || c.store_id,
    accountId: c.account_id,
    accountName: c.account_name,
    connectedAt: c.connected_at,
  }));
}

export async function copyPersistentMetaConnection(fromStoreId: string, toStoreId: string): Promise<void> {
  const source = await getPersistentConnection(fromStoreId, 'meta');
  if (!source) {
    throw new Error(`No Meta connection found for store ${fromStoreId}`);
  }

  await upsertPersistentConnection({
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

export async function upsertPersistentStore(data: {
  id: string;
  name: string;
  domain: string;
  platform?: string;
  apiKey?: string;
  apiSecret?: string;
}): Promise<void> {
  await rest(
    '/stores?on_conflict=id',
    {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([{
        id: data.id,
        name: data.name,
        domain: data.domain,
        platform: data.platform || 'shopify',
        api_key: data.apiKey || null,
        api_secret: data.apiSecret || null,
      }]),
    }
  );
}

export async function deletePersistentStore(storeId: string): Promise<void> {
  await rest(`/stores?id=eq.${encodeURIComponent(storeId)}`, { method: 'DELETE' });
}

export async function getPersistentConnection(storeId: string, platform: 'meta' | 'shopify'): Promise<DbConnection | null> {
  const rows = await rest<DbConnection[]>(
    `/connections?store_id=eq.${encodeURIComponent(storeId)}&platform=eq.${platform}&select=*&limit=1`
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    access_token: decryptSecret(row.access_token),
    refresh_token: row.refresh_token ? decryptSecret(row.refresh_token) : null,
  };
}

export async function upsertPersistentConnection(data: {
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
}): Promise<void> {
  await rest(
    '/connections?on_conflict=store_id,platform',
    {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([{
        store_id: data.storeId,
        platform: data.platform,
        access_token: encryptSecret(data.accessToken),
        refresh_token: data.refreshToken ? encryptSecret(data.refreshToken) : null,
        expires_at: data.expiresAt ?? null,
        account_id: data.accountId ?? null,
        account_name: data.accountName ?? null,
        shop_domain: data.shopDomain ?? null,
        shop_name: data.shopName ?? null,
        scopes: data.scopes ?? null,
        last_synced: new Date().toISOString(),
      }]),
    }
  );
}

export async function updatePersistentConnectionAccount(
  storeId: string,
  platform: 'meta' | 'shopify',
  accountId: string,
  accountName: string
): Promise<void> {
  await rest(
    `/connections?store_id=eq.${encodeURIComponent(storeId)}&platform=eq.${platform}`,
    {
      method: 'PATCH',
      headers: headers({
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({
        account_id: accountId,
        account_name: accountName,
        last_synced: new Date().toISOString(),
      }),
    }
  );
}

export async function deletePersistentConnection(storeId: string, platform: 'meta' | 'shopify'): Promise<void> {
  await rest(`/connections?store_id=eq.${encodeURIComponent(storeId)}&platform=eq.${platform}`, { method: 'DELETE' });
}

export async function listPersistentStoreAdAccounts(storeId: string): Promise<DbStoreAdAccount[]> {
  const rows = await rest<Array<DbStoreAdAccount & { is_active: boolean | number }>>(
    `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=created_at.asc`
  );
  return rows.map((r) => ({ ...r, is_active: r.is_active ? 1 : 0 })) as DbStoreAdAccount[];
}

export async function upsertPersistentStoreAdAccount(data: {
  storeId: string;
  adAccountId: string;
  adAccountName: string;
  platform?: string;
  currency?: string;
  timezone?: string;
}): Promise<void> {
  await rest(
    '/store_ad_accounts?on_conflict=store_id,ad_account_id',
    {
      method: 'POST',
      headers: headers({
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }),
      body: JSON.stringify([{
        store_id: data.storeId,
        ad_account_id: data.adAccountId,
        ad_account_name: data.adAccountName,
        platform: data.platform || 'meta',
        currency: data.currency ?? null,
        timezone: data.timezone ?? null,
      }]),
    }
  );
}

export async function deletePersistentStoreAdAccount(storeId: string, adAccountId: string): Promise<void> {
  await rest(
    `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&ad_account_id=eq.${encodeURIComponent(adAccountId)}`,
    { method: 'DELETE' }
  );
}

export async function togglePersistentStoreAdAccount(storeId: string, adAccountId: string, isActive: boolean): Promise<void> {
  await rest(
    `/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&ad_account_id=eq.${encodeURIComponent(adAccountId)}`,
    {
      method: 'PATCH',
      headers: headers({
        Prefer: 'return=minimal',
      }),
      body: JSON.stringify({ is_active: !!isActive }),
    }
  );
}

export async function hydrateStoreFromSupabase(storeId: string): Promise<void> {
  if (!isSupabasePersistenceEnabled()) return;

  const now = Date.now();
  const last = hydrateCache.get(storeId) || 0;
  if (now - last < HYDRATE_TTL_MS) return;

  const [stores, connections, adAccounts] = await Promise.all([
    rest<DbStore[]>(`/stores?id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`),
    rest<Array<DbConnection & { id: number }>>(`/connections?store_id=eq.${encodeURIComponent(storeId)}&select=*`),
    rest<Array<DbStoreAdAccount & { is_active: boolean | number }>>(`/store_ad_accounts?store_id=eq.${encodeURIComponent(storeId)}&select=*`),
  ]);

  const store = stores[0];
  if (!store) {
    hydrateCache.set(storeId, now);
    return;
  }

  const localStore = getStore(storeId);
  if (!localStore) {
    createStore({
      id: store.id,
      name: store.name,
      domain: store.domain,
      platform: store.platform,
      apiKey: store.api_key || undefined,
      apiSecret: store.api_secret || undefined,
    });
  } else if (localStore.api_key !== store.api_key || localStore.api_secret !== store.api_secret || localStore.name !== store.name || localStore.domain !== store.domain) {
    const db = getDb();
    db.prepare(
      'UPDATE stores SET name = ?, domain = ?, platform = ?, api_key = ?, api_secret = ? WHERE id = ?'
    ).run(
      store.name,
      store.domain,
      store.platform,
      store.api_key ?? null,
      store.api_secret ?? null,
      store.id
    );
  }

  for (const conn of connections) {
    upsertConnection({
      storeId: conn.store_id,
      platform: conn.platform,
      accessToken: decryptSecret(conn.access_token),
      refreshToken: conn.refresh_token ? decryptSecret(conn.refresh_token) : undefined,
      expiresAt: conn.expires_at ?? undefined,
      accountId: conn.account_id ?? undefined,
      accountName: conn.account_name ?? undefined,
      shopDomain: conn.shop_domain ?? undefined,
      shopName: conn.shop_name ?? undefined,
      scopes: conn.scopes ?? undefined,
    });
  }

  for (const account of adAccounts) {
    addStoreAdAccount({
      storeId: account.store_id,
      adAccountId: account.ad_account_id,
      adAccountName: account.ad_account_name,
      platform: account.platform,
      currency: account.currency ?? undefined,
      timezone: account.timezone ?? undefined,
    });
    toggleStoreAdAccount(account.store_id, account.ad_account_id, !!account.is_active);
  }

  hydrateCache.set(storeId, now);
}

export async function hydrateAllStoresFromSupabase(): Promise<void> {
  if (!isSupabasePersistenceEnabled()) return;
  const stores = await rest<DbStore[]>('/stores?select=id');
  await Promise.all(stores.map((store) => hydrateStoreFromSupabase(store.id)));
}

// ------ App Credentials (Supabase-backed) ------

export interface PersistentAppCredentials {
  id: number;
  platform: 'meta' | 'shopify';
  app_id: string;
  app_secret: string;
  redirect_uri: string;
  scopes: string | null;
  updated_at: string;
}

export async function getPersistentAppCredentials(
  platform: 'meta' | 'shopify'
): Promise<PersistentAppCredentials | null> {
  const rows = await rest<PersistentAppCredentials[]>(
    `/app_credentials?platform=eq.${encodeURIComponent(platform)}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function getAllPersistentAppCredentials(): Promise<{
  meta: PersistentAppCredentials | null;
  shopify: PersistentAppCredentials | null;
}> {
  const rows = await rest<PersistentAppCredentials[]>(
    '/app_credentials?select=*'
  );
  return {
    meta: rows.find((r) => r.platform === 'meta') || null,
    shopify: rows.find((r) => r.platform === 'shopify') || null,
  };
}

export async function upsertPersistentAppCredentials(data: {
  platform: 'meta' | 'shopify';
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes?: string;
}): Promise<void> {
  const payload = {
    platform: data.platform,
    app_id: data.appId,
    app_secret: data.appSecret,
    redirect_uri: data.redirectUri,
    scopes: data.scopes ?? null,
    updated_at: new Date().toISOString(),
  };

  // First try to check if a row exists for this platform
  const existing = await getPersistentAppCredentials(data.platform);

  if (existing) {
    // PATCH (update) existing row
    await rest(
      `/app_credentials?platform=eq.${encodeURIComponent(data.platform)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(payload),
      }
    );
  } else {
    // INSERT new row
    await rest('/app_credentials', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  }
}

export async function deletePersistentAppCredentials(
  platform: 'meta' | 'shopify'
): Promise<void> {
  await rest(
    `/app_credentials?platform=eq.${encodeURIComponent(platform)}`,
    { method: 'DELETE' }
  );
}

// ------ P&L Product Costs (Supabase-backed) ------

export interface PersistentProductCost {
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

export async function getPersistentProductCosts(
  storeId: string
): Promise<PersistentProductCost[]> {
  return rest<PersistentProductCost[]>(
    `/pnl_product_costs?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=product_name.asc,effective_date.desc`
  );
}

export async function upsertPersistentProductCost(data: {
  storeId: string;
  productId: string;
  productName: string;
  sku?: string;
  costPerUnit: number;
  costType?: 'fixed' | 'percentage';
  effectiveDate?: string;
}): Promise<void> {
  const payload = {
    store_id: data.storeId,
    product_id: data.productId,
    product_name: data.productName,
    sku: data.sku ?? null,
    cost_per_unit: data.costPerUnit,
    cost_type: data.costType || 'fixed',
    effective_date: data.effectiveDate || new Date().toISOString().split('T')[0],
  };

  await rest(
    '/pnl_product_costs?on_conflict=store_id,product_id,effective_date',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

export async function deletePersistentProductCost(id: number): Promise<void> {
  await rest(`/pnl_product_costs?id=eq.${id}`, { method: 'DELETE' });
}

// ------ P&L Shipping Settings (Supabase-backed) ------

export interface PersistentShippingSettings {
  id: number;
  store_id: string;
  method: 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item';
  flat_rate: number;
  percentage: number;
  per_item_rate: number;
  updated_at: string;
}

export async function getPersistentShippingSettings(
  storeId: string
): Promise<PersistentShippingSettings | null> {
  const rows = await rest<PersistentShippingSettings[]>(
    `/pnl_shipping_settings?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function upsertPersistentShippingSettings(data: {
  storeId: string;
  method: 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item';
  flatRate?: number;
  percentage?: number;
  perItemRate?: number;
}): Promise<void> {
  const payload = {
    store_id: data.storeId,
    method: data.method,
    flat_rate: data.flatRate ?? 0,
    percentage: data.percentage ?? 0,
    per_item_rate: data.perItemRate ?? 0,
    updated_at: new Date().toISOString(),
  };

  await rest(
    '/pnl_shipping_settings?on_conflict=store_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

// ------ P&L Payment Fees (Supabase-backed) ------

export interface PersistentPaymentFee {
  id: number;
  store_id: string;
  gateway_name: string;
  fee_percentage: number;
  fee_fixed: number;
  is_active: boolean;
  created_at: string;
}

export async function getPersistentPaymentFees(
  storeId: string
): Promise<PersistentPaymentFee[]> {
  return rest<PersistentPaymentFee[]>(
    `/pnl_payment_fees?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=gateway_name.asc`
  );
}

export async function upsertPersistentPaymentFee(data: {
  storeId: string;
  gatewayName: string;
  feePercentage: number;
  feeFixed: number;
  isActive?: boolean;
}): Promise<void> {
  const payload = {
    store_id: data.storeId,
    gateway_name: data.gatewayName,
    fee_percentage: data.feePercentage,
    fee_fixed: data.feeFixed,
    is_active: data.isActive !== false,
  };

  await rest(
    '/pnl_payment_fees?on_conflict=store_id,gateway_name',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

export async function deletePersistentPaymentFee(id: number): Promise<void> {
  await rest(`/pnl_payment_fees?id=eq.${id}`, { method: 'DELETE' });
}

// ------ P&L Custom Expenses (Supabase-backed) ------

export interface PersistentCustomExpense {
  id: number;
  store_id: string;
  name: string;
  category: 'fixed' | 'variable';
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution: 'daily' | 'hourly' | 'smart';
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getPersistentCustomExpenses(
  storeId: string
): Promise<PersistentCustomExpense[]> {
  return rest<PersistentCustomExpense[]>(
    `/pnl_custom_expenses?store_id=eq.${encodeURIComponent(storeId)}&select=*&order=created_at.desc`
  );
}

export async function addPersistentCustomExpense(data: {
  storeId: string;
  name: string;
  category?: 'fixed' | 'variable';
  amount: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
  distribution?: 'daily' | 'hourly' | 'smart';
  startDate?: string;
  endDate?: string;
}): Promise<void> {
  const payload = {
    store_id: data.storeId,
    name: data.name,
    category: data.category || 'fixed',
    amount: data.amount,
    frequency: data.frequency || 'monthly',
    distribution: data.distribution || 'daily',
    start_date: data.startDate ?? null,
    end_date: data.endDate ?? null,
    is_active: true,
  };

  await rest('/pnl_custom_expenses', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function updatePersistentCustomExpense(
  id: number,
  data: {
    name?: string;
    category?: 'fixed' | 'variable';
    amount?: number;
    frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
    distribution?: 'daily' | 'hourly' | 'smart';
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
  }
): Promise<void> {
  const payload: Record<string, unknown> = {};

  if (data.name !== undefined) payload.name = data.name;
  if (data.category !== undefined) payload.category = data.category;
  if (data.amount !== undefined) payload.amount = data.amount;
  if (data.frequency !== undefined) payload.frequency = data.frequency;
  if (data.distribution !== undefined) payload.distribution = data.distribution;
  if (data.startDate !== undefined) payload.start_date = data.startDate;
  if (data.endDate !== undefined) payload.end_date = data.endDate;
  if (data.isActive !== undefined) payload.is_active = data.isActive;

  if (Object.keys(payload).length === 0) return;

  await rest(`/pnl_custom_expenses?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

export async function deletePersistentCustomExpense(id: number): Promise<void> {
  await rest(`/pnl_custom_expenses?id=eq.${id}`, { method: 'DELETE' });
}

// ------ P&L Handling Fees (Supabase-backed) ------

export interface PersistentHandlingFees {
  id: number;
  store_id: string;
  fee_type: 'per_order' | 'per_item' | 'percentage';
  amount: number;
  updated_at: string;
}

export async function getPersistentHandlingFees(
  storeId: string
): Promise<PersistentHandlingFees | null> {
  const rows = await rest<PersistentHandlingFees[]>(
    `/pnl_handling_fees?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function upsertPersistentHandlingFees(data: {
  storeId: string;
  feeType: 'per_order' | 'per_item' | 'percentage';
  amount: number;
}): Promise<void> {
  const payload = {
    store_id: data.storeId,
    fee_type: data.feeType,
    amount: data.amount,
    updated_at: new Date().toISOString(),
  };

  await rest(
    '/pnl_handling_fees?on_conflict=store_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

// ------ P&L Store Settings (Supabase-backed) ------

export interface PersistentPnlStoreSettings {
  id: number;
  store_id: string;
  product_type: 'physical' | 'digital';
  updated_at: string;
}

export async function getPersistentPnlStoreSettings(
  storeId: string
): Promise<PersistentPnlStoreSettings | null> {
  const rows = await rest<PersistentPnlStoreSettings[]>(
    `/pnl_store_settings?store_id=eq.${encodeURIComponent(storeId)}&select=*&limit=1`
  );
  return rows[0] || null;
}

export async function upsertPersistentPnlStoreSettings(
  storeId: string,
  data: { productType: 'physical' | 'digital' }
): Promise<void> {
  const payload = {
    store_id: storeId,
    product_type: data.productType,
    updated_at: new Date().toISOString(),
  };

  await rest(
    '/pnl_store_settings?on_conflict=store_id',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

// ------ P&L Daily Cache (Supabase-backed) ------

export interface PersistentPnlDailyCacheRow {
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

export async function getPersistentCachedPnLDays(
  storeId: string,
  startDate: string,
  endDate: string
): Promise<PersistentPnlDailyCacheRow[]> {
  return rest<PersistentPnlDailyCacheRow[]>(
    `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}&date=gte.${encodeURIComponent(startDate)}&date=lte.${encodeURIComponent(endDate)}&select=*&order=date.asc`
  );
}

export async function getPersistentPnlCacheLastSynced(
  storeId: string
): Promise<string | null> {
  const rows = await rest<Array<{ synced_at: string }>>(
    `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}&select=synced_at&order=synced_at.desc&limit=1`
  );
  return rows[0]?.synced_at ?? null;
}

export async function upsertPersistentCachedPnLDay(
  storeId: string,
  date: string,
  data: {
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
  }
): Promise<void> {
  const payload = {
    store_id: storeId,
    date,
    revenue: data.revenue,
    cogs: data.cogs,
    ad_spend: data.adSpend,
    shipping: data.shipping,
    fees: data.fees,
    refunds: data.refunds,
    net_profit: data.netProfit,
    margin: data.margin,
    order_count: data.orderCount ?? 0,
    full_refund_count: data.fullRefundCount ?? 0,
    partial_refund_count: data.partialRefundCount ?? 0,
    full_refund_amount: data.fullRefundAmount ?? 0,
    partial_refund_amount: data.partialRefundAmount ?? 0,
    synced_at: new Date().toISOString(),
  };

  await rest(
    '/pnl_daily_cache?on_conflict=store_id,date',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([payload]),
    }
  );
}

export async function batchUpsertPersistentCachedPnLDays(
  storeId: string,
  rows: Array<{
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
  }>
): Promise<void> {
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  const payloads = rows.map((entry) => ({
    store_id: storeId,
    date: entry.date,
    revenue: entry.revenue,
    cogs: entry.cogs,
    ad_spend: entry.adSpend,
    shipping: entry.shipping,
    fees: entry.fees,
    refunds: entry.refunds,
    net_profit: entry.netProfit,
    margin: entry.margin,
    order_count: entry.orderCount ?? 0,
    full_refund_count: entry.fullRefundCount ?? 0,
    partial_refund_count: entry.partialRefundCount ?? 0,
    full_refund_amount: entry.fullRefundAmount ?? 0,
    partial_refund_amount: entry.partialRefundAmount ?? 0,
    synced_at: now,
  }));

  await rest(
    '/pnl_daily_cache?on_conflict=store_id,date',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payloads),
    }
  );
}

export async function clearPersistentCachedPnL(storeId: string): Promise<void> {
  await rest(
    `/pnl_daily_cache?store_id=eq.${encodeURIComponent(storeId)}`,
    { method: 'DELETE' }
  );
}
