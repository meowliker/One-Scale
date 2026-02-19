export interface ProductPnLData {
  productId: string;
  productName: string;
  productImage: string | null;      // Shopify image URL
  shopifyUrl: string | null;        // Link to Shopify product admin page
  sku: string;

  // P&L metrics (product-level from Shopify orders)
  unitsSold: number;
  revenue: number;
  cogs: number;
  shipping: number;
  fees: number;
  netProfit: number;
  margin: number;                    // percentage

  // FB ad metrics — per-product when ad is mapped, account-level fallback
  fbMetrics: ProductFBMetrics;

  // Whether this product is actively being advertised on Facebook
  isAdvertised: boolean;
  // The FB ad landing page URL (if product is used as a landing page in ads)
  adLandingPageUrl: string | null;
  // Associated ad/adset names for context
  adName: string | null;
  adSetName: string | null;
  // Campaign name for grouping
  campaignName: string | null;
}

export interface ProductFBMetrics {
  roas: number;
  cpc: number;
  cpm: number;
  ctr: number;
  aov: number;
  atcRate: number;                   // Add to cart rate (%)
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  // Per-product level (only when isAdvertised = true)
  costPerPurchase: number;
  frequency: number;
  reach: number;
}

// Keep backward compat alias
export type AccountFBMetrics = ProductFBMetrics;

export type ProductSortKey =
  | 'productName'
  | 'revenue'
  | 'cogs'
  | 'netProfit'
  | 'margin'
  | 'unitsSold'
  | 'spend'
  | 'adRoas';

export type ProductViewMode = 'card' | 'list';
