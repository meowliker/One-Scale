import { getConnection, upsertConnection, deleteConnection, updateConnectionAccount, getStore, getAppCredentials } from './db';
import { getShopifyAccessToken } from './shopify-client';
import type { OAuthTokens, OAuthPlatform } from '@/types/auth';
import {
  deletePersistentConnection,
  getPersistentConnection,
  getPersistentAppCredentials,
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
  updatePersistentConnectionAccount,
  upsertPersistentConnection,
} from './supabase-persistence';
import { encryptSecret } from './crypto';

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

// ------ Google Drive Token (with auto-refresh) ------

/**
 * Refresh a Google Drive access token using the stored refresh_token and
 * app-level client credentials from the app_credentials table.
 */
async function refreshGoogleDriveAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return null;
    return await res.json() as { access_token: string; expires_in: number };
  } catch {
    return null;
  }
}

/** Load Google Drive app credentials (Client ID + Secret) from app_credentials table. */
async function loadGoogleDriveAppCredentials(): Promise<{ client_id: string; client_secret: string } | null> {
  try {
    if (isSupabasePersistenceEnabled()) {
      const creds = await getPersistentAppCredentials('google_drive');
      if (creds?.app_id && creds?.app_secret) {
        return { client_id: creds.app_id, client_secret: creds.app_secret };
      }
    } else {
      const creds = getAppCredentials('google_drive');
      if (creds?.app_id && creds?.app_secret) {
        return { client_id: creds.app_id, client_secret: creds.app_secret };
      }
    }
  } catch {
    // Non-critical
  }
  return null;
}

export async function getGoogleDriveToken(storeId: string): Promise<OAuthTokens | null> {
  // Helper to handle auto-refresh for a connection row
  const resolveToken = async (
    conn: {
      access_token: string;
      refresh_token: string | null;
      expires_at: number | null;
      store_id: string;
      account_id: string | null;
      metadata: string | null;
    },
    source: 'supabase' | 'local',
  ): Promise<OAuthTokens | null> => {
    const expired = conn.expires_at != null && conn.expires_at < Date.now();

    if (expired && conn.refresh_token) {
      const appCreds = await loadGoogleDriveAppCredentials();
      if (appCreds?.client_id && appCreds?.client_secret) {
        const refreshed = await refreshGoogleDriveAccessToken(
          conn.refresh_token,
          appCreds.client_id,
          appCreds.client_secret,
        );
        if (refreshed) {
          const newExpiresAt = Date.now() + refreshed.expires_in * 1000;
          // Persist refreshed token (both layers)
          upsertConnection({
            storeId,
            platform: 'google_drive',
            accessToken: refreshed.access_token,
            expiresAt: newExpiresAt,
          });
          if (isSupabasePersistenceEnabled()) {
            await upsertPersistentConnection({
              storeId,
              platform: 'google_drive',
              accessToken: refreshed.access_token,
              expiresAt: newExpiresAt,
            });
          }
          return {
            accessToken: refreshed.access_token,
            refreshToken: conn.refresh_token,
            platform: 'google_drive',
            storeId,
            accountId: conn.account_id ?? undefined,
            expiresAt: newExpiresAt,
          };
        }
      }
      // Refresh failed
      return null;
    }

    if (expired) return null;

    // Suppress unused-variable lint — `source` is kept for future logging.
    void source;

    return {
      accessToken: conn.access_token,
      refreshToken: conn.refresh_token ?? undefined,
      platform: 'google_drive',
      storeId,
      accountId: conn.account_id ?? undefined,
      expiresAt: conn.expires_at ?? undefined,
    };
  };

  const localConnection = getConnection(storeId, 'google_drive');

  // Try Supabase first
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const persistentConn = await getPersistentConnection(storeId, 'google_drive');
    if (persistentConn) {
      const resolvedPersistent = await resolveToken(persistentConn, 'supabase');
      if (resolvedPersistent) {
        return resolvedPersistent;
      }
    }
  }

  // Fallback to local SQLite
  if (!localConnection) return null;

  const resolvedLocal = await resolveToken(localConnection, 'local');

  if (resolvedLocal && isSupabasePersistenceEnabled()) {
    try {
      await upsertPersistentConnection({
        storeId,
        platform: 'google_drive',
        accessToken: resolvedLocal.accessToken,
        refreshToken: localConnection.refresh_token ?? undefined,
        expiresAt: resolvedLocal.expiresAt,
        accountId: localConnection.account_id ?? undefined,
      });
    } catch {
      // Non-critical. Local token still works for this request.
    }
  }

  return resolvedLocal;
}

export async function setGoogleDriveToken(
  storeId: string,
  payload: OAuthTokens & { metadata?: string },
): Promise<void> {
  upsertConnection({
    storeId,
    platform: 'google_drive',
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    expiresAt: payload.expiresAt,
    accountId: payload.accountId,
    metadata: payload.metadata ? encryptSecret(payload.metadata) : undefined,
  });
  if (isSupabasePersistenceEnabled()) {
    await upsertPersistentConnection({
      storeId,
      platform: 'google_drive',
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      expiresAt: payload.expiresAt,
      accountId: payload.accountId,
      metadata: payload.metadata ? encryptSecret(payload.metadata) : undefined,
    });
  }
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

export async function clearToken(platform: OAuthPlatform, storeId: string): Promise<void> {
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
