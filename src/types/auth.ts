/** All supported OAuth platforms. Extend this union to add new integrations. */
export type OAuthPlatform = 'meta' | 'shopify' | 'google_drive';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  platform: OAuthPlatform;
  storeId: string;
  accountId?: string;
  shopDomain?: string;
}

export interface MetaTokenPayload {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface ShopifyTokenPayload {
  access_token: string;
  scope: string;
}

export interface GoogleDriveTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface ConnectionStatus {
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
  google_drive: {
    connected: boolean;
    accountId?: string;
    accountName?: string;
    lastSynced?: string;
  };
}
