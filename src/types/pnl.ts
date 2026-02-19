export interface PnLEntry {
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
}

export interface ProductCOGS {
  productId: string;
  productName: string;
  sku: string;
  costPerUnit: number;
  sellingPrice: number;
  margin: number;
}

export interface PnLSummary {
  today: PnLEntry;
  thisWeek: PnLEntry;
  thisMonth: PnLEntry;
  allTime: PnLEntry;
  productType?: 'physical' | 'digital';
}

export interface HourlyPnLEntry {
  date: string;       // YYYY-MM-DD
  hour: number;       // 0-23
  hourLabel: string;   // "12am", "1am", etc.
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  conversions: number;
  cpa: number;
  ctr: number;
  cpc: number;
  cpm: number;
}
