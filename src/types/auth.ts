export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  platform: 'meta' | 'shopify';
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
}
