import { getConnection, upsertConnection, deleteConnection, updateConnectionAccount, getStore } from './db';
import { getShopifyAccessToken } from './shopify-client';
import type { OAuthTokens } from '@/types/auth';
import {
  deletePersistentConnection,
  getPersistentConnection,
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
  updatePersistentConnectionAccount,
  upsertPersistentConnection,
} from './supabase-persistence';

// ------ Get Tokens ------

export async function getMetaToken(storeId: string): Promise<OAuthTokens | null> {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const persistentConn = await getPersistentConnection(storeId, 'meta');
    if (persistentConn) {
      if (persistentConn.expires_at && persistentConn.expires_at < Date.now()) {
        return null;
      }
      return {
        accessToken: persistentConn.access_token,
        platform: 'meta',
        storeId: persistentConn.store_id,
        accountId: persistentConn.account_id ?? undefined,
        expiresAt: persistentConn.expires_at ?? undefined,
      };
    }
  }

  const conn = getConnection(storeId, 'meta');
  if (!conn) return null;

  // Check if token is expired
  if (conn.expires_at && conn.expires_at < Date.now()) {
    return null;
  }

  return {
    accessToken: conn.access_token,
    platform: 'meta',
    storeId: conn.store_id,
    accountId: conn.account_id ?? undefined,
    expiresAt: conn.expires_at ?? undefined,
  };
}

export async function getShopifyToken(storeId: string): Promise<OAuthTokens | null> {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const persistentConn = await getPersistentConnection(storeId, 'shopify');
    if (persistentConn) {
      const now = Math.floor(Date.now() / 1000);
      if (persistentConn.expires_at && persistentConn.expires_at < now) {
        const store = getStore(storeId);
        if (store?.api_key && store?.api_secret && persistentConn.shop_domain) {
          try {
            const tokenData = await getShopifyAccessToken(
              persistentConn.shop_domain,
              store.api_key,
              store.api_secret
            );
            const newExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;
            upsertConnection({
              storeId,
              platform: 'shopify',
              accessToken: tokenData.access_token,
              expiresAt: newExpiresAt,
              shopDomain: persistentConn.shop_domain,
              shopName: persistentConn.shop_name ?? undefined,
            });
            await upsertPersistentConnection({
              storeId,
              platform: 'shopify',
              accessToken: tokenData.access_token,
              expiresAt: newExpiresAt,
              shopDomain: persistentConn.shop_domain,
              shopName: persistentConn.shop_name ?? undefined,
            });
            return {
              accessToken: tokenData.access_token,
              platform: 'shopify',
              storeId,
              shopDomain: persistentConn.shop_domain ?? undefined,
            };
          } catch {
            return null;
          }
        }
        return null;
      }

      return {
        accessToken: persistentConn.access_token,
        platform: 'shopify',
        storeId: persistentConn.store_id,
        shopDomain: persistentConn.shop_domain ?? undefined,
      };
    }
  }

  const conn = getConnection(storeId, 'shopify');
  if (!conn) return null;

  // Check if token is expired (expires_at is stored as epoch seconds)
  const now = Math.floor(Date.now() / 1000);
  if (conn.expires_at && conn.expires_at < now) {
    // Try to auto-refresh using stored Client ID + Secret
    const store = getStore(storeId);
    if (store?.api_key && store?.api_secret && conn.shop_domain) {
      try {
        const tokenData = await getShopifyAccessToken(
          conn.shop_domain,
          store.api_key,
          store.api_secret
        );
        const newExpiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

        // Save refreshed token
        upsertConnection({
          storeId,
          platform: 'shopify',
          accessToken: tokenData.access_token,
          expiresAt: newExpiresAt,
          shopDomain: conn.shop_domain,
          shopName: conn.shop_name ?? undefined,
        });

        return {
          accessToken: tokenData.access_token,
          platform: 'shopify',
          storeId,
          shopDomain: conn.shop_domain ?? undefined,
        };
      } catch {
        // Refresh failed — return null so caller knows token is invalid
        return null;
      }
    }
    return null;
  }

  return {
    accessToken: conn.access_token,
    platform: 'shopify',
    storeId: conn.store_id,
    shopDomain: conn.shop_domain ?? undefined,
  };
}

// ------ Set Tokens ------

export async function setMetaToken(storeId: string, payload: OAuthTokens): Promise<void> {
  upsertConnection({
    storeId,
    platform: 'meta',
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    accountId: payload.accountId,
  });
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentConnection({
      storeId,
      platform: 'meta',
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      accountId: payload.accountId,
    });
  }
}

export async function setShopifyToken(storeId: string, payload: OAuthTokens): Promise<void> {
  upsertConnection({
    storeId,
    platform: 'shopify',
    accessToken: payload.accessToken,
    shopDomain: payload.shopDomain,
  });
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentConnection({
      storeId,
      platform: 'shopify',
      accessToken: payload.accessToken,
      shopDomain: payload.shopDomain,
    });
  }
}

// ------ Clear Token ------

export async function clearToken(platform: 'meta' | 'shopify', storeId: string): Promise<void> {
  deleteConnection(storeId, platform);
  if (isSupabasePersistenceEnabled()) {
    await deletePersistentConnection(storeId, platform);
  }
}

// ------ Update Account ------

export async function setMetaAccount(storeId: string, accountId: string, accountName: string): Promise<void> {
  updateConnectionAccount(storeId, 'meta', accountId, accountName);
  if (isSupabasePersistenceEnabled()) {
    await updatePersistentConnectionAccount(storeId, 'meta', accountId, accountName);
  }
}
