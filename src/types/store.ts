export type AdPlatform = 'meta' | 'google' | 'tiktok';

export interface AdAccount {
  id: string;
  name: string;
  platform: AdPlatform;
  accountId: string; // e.g., "act_123456789"
  currency: string;
  timezone: string;
  isActive: boolean;
}

export interface Store {
  id: string;
  name: string;
  domain: string;
  platform: 'shopify' | 'woocommerce' | 'custom';
  logoUrl?: string;
  adAccounts: AdAccount[];
  createdAt: string;
  shopifyConnected?: boolean;
  metaConnected?: boolean;
  shopifyShopDomain?: string;
  metaAdAccountId?: string;
}
