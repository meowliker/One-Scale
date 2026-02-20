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
