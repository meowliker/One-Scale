export type SheetAccount = {
  credentialSource?: "integration" | "manual";
  business?: { id: string; name: string };
  adAccountId: string;
  name: string;
  currency: string;
  timezone: string;
  active: boolean;
  start: string;
  end: string;
  hasToken: boolean;
};
export type SheetDraft = SheetAccount & { accessToken?: string };
export type SheetRow = {
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  purchases?: number;
  linkClicks?: number;
};
export type SheetResult = {
  account: SheetAccount;
  rows: SheetRow[];
  fetchedAt: string;
  nextFrom: string | null;
  after: string | null;
};

export function validHour(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value))
    return false;
  const date = new Date(`${value}:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16) === value
  );
}

export function validateSchedule(value: {
  active?: unknown;
  start?: unknown;
  end?: unknown;
}): string | null {
  if (typeof value.active !== "boolean" || !validHour(value.start))
    return "Choose a valid start date and whole hour.";
  if (!value.active && (!validHour(value.end) || value.end <= value.start))
    return "End date and time must be after the start.";
  return null;
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export const PROFIT_SHEET_COLUMNS = [
  "DATE",
  "No of order",
  "Actual FB Ads",
  "AOV",
  "Total Revenue",
  "Shopify fees",
  "Profit Loss",
  "roas",
  "profit percent",
  "CPC",
  "Conversion Rate",
] as const;
export const STORE_SHEET_COLUMNS = [
  "Date",
  "Total Revenue",
  "Shopify Fees",
  "Actual Sales",
  "Ad Cost",
  "Profit",
  "Chargeback Loss",
  "Chargeback Won",
  "Adjustment",
  "Refunds",
] as const;
export type StoreSheetDay = {
  attributionVersion?: number;
  attributedRevenue?: number | null;
  financeVersion?: number;
  metaVersion?: number;
  impressions?: number | null;
  purchaseValue?: number | null;
  addToCart?: number | null;
  checkouts?: number | null;
  landingViews?: number | null;
  chargebackLoss?: number | null;
  chargebackWon?: number | null;
  adjustment?: number | null;
  refunds?: number | null;
  date: string;
  orders: number | null;
  revenue: number | null;
  shopifyFees: number | null;
  otherFees: number | null;
  adSpend: number | null;
  clicks: number | null;
  purchases: number | null;
  linkClicks: number | null;
};
export function sheetMetrics(day: StoreSheetDay) {
  const {
    orders,
    revenue,
    shopifyFees,
    adSpend,
    clicks,
    purchases,
    linkClicks,
  } = day;
  const profit =
    revenue !== null && shopifyFees !== null && adSpend !== null
      ? revenue - adSpend - Math.abs(shopifyFees)
      : null;
  return {
    aov:
      revenue !== null && orders !== null && orders > 0
        ? revenue / orders
        : null,
    profit,
    roas:
      revenue !== null && adSpend !== null && adSpend > 0
        ? revenue / adSpend
        : null,
    profitPercent:
      profit !== null && revenue !== null && revenue > 0
        ? (profit / revenue) * 100
        : null,
    cpc:
      adSpend !== null && clicks !== null && clicks > 0
        ? adSpend / clicks
        : null,
    conversionRate:
      purchases !== null && linkClicks !== null && linkClicks > 0
        ? (purchases / linkClicks) * 100
        : null,
  };
}

// Signed fee credits and adjustments are preserved; unknown inputs never become zero.
export function storeSheetMetrics(day: StoreSheetDay) {
  const values = [
    day.revenue,
    day.shopifyFees,
    day.chargebackLoss,
    day.chargebackWon,
    day.adjustment,
    day.refunds,
  ];
  const actualSales = values.every((v) => v != null && Number.isFinite(v))
    ? day.revenue! -
      day.shopifyFees! -
      day.chargebackLoss! -
      day.refunds! +
      day.chargebackWon! +
      day.adjustment!
    : null;
  return {
    actualSales,
    profit:
      actualSales != null && day.adSpend != null
        ? actualSales - day.adSpend
        : null,
  };
}
