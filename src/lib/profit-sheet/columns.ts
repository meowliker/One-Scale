import {
  sheetMetrics,
  storeSheetMetrics,
  type StoreSheetDay,
} from "@/lib/profit-sheet";
export const COLUMNS = {
  date: { label: "Date", group: "Store", format: "date" },
  revenue: { label: "Total Revenue", group: "Store", format: "money" },
  shopifyFees: { label: "Shopify Fees", group: "Store", format: "money" },
  actualSales: {
    label: "Actual Sales",
    group: "Store",
    format: "money",
    storeOnly: true,
  },
  adSpend: { label: "Ad Cost", group: "Meta", format: "money" },
  profit: { label: "Profit", group: "Store", format: "money" },
  chargebackLoss: {
    label: "Chargeback Loss",
    group: "Store",
    format: "money",
    storeOnly: true,
  },
  chargebackWon: {
    label: "Chargeback Won",
    group: "Store",
    format: "money",
    storeOnly: true,
  },
  adjustment: {
    label: "Adjustment",
    group: "Store",
    format: "money",
    storeOnly: true,
  },
  refunds: {
    label: "Refunds",
    group: "Store",
    format: "money",
    storeOnly: true,
  },
  orders: { label: "Orders", group: "Store", format: "number" },
  aov: { label: "AOV", group: "Store", format: "money" },
  shopifyRoas: {
    label: "Shopify ROAS",
    group: "Store",
    format: "ratio",
    attribution: true,
  },
  blendedRoas: { label: "Blended ROAS", group: "Store", format: "ratio" },
  profitPercent: { label: "Profit %", group: "Store", format: "percent" },
  clicks: { label: "Meta Clicks", group: "Meta", format: "number" },
  linkClicks: { label: "Meta Link Clicks", group: "Meta", format: "number" },
  purchases: { label: "Meta Purchases", group: "Meta", format: "number" },
  cpc: { label: "Meta CPC", group: "Meta", format: "money" },
  costPerPurchase: {
    label: "Meta Cost / Purchase",
    group: "Meta",
    format: "money",
  },
  conversionRate: {
    label: "Meta Conversion Rate",
    group: "Meta",
    format: "percent",
  },
  impressions: {
    label: "Meta Impressions",
    group: "Meta",
    format: "number",
    extended: true,
  },
  cpm: { label: "Meta CPM", group: "Meta", format: "money", extended: true },
  ctr: { label: "Meta CTR", group: "Meta", format: "percent", extended: true },
  linkCtr: {
    label: "Meta Link CTR",
    group: "Meta",
    format: "percent",
    extended: true,
  },
  purchaseValue: {
    label: "Meta Purchase Value",
    group: "Meta",
    format: "money",
    extended: true,
  },
  metaRoas: {
    label: "Meta ROAS",
    group: "Meta",
    format: "ratio",
    extended: true,
  },
  addToCart: {
    label: "Meta Adds to Cart",
    group: "Meta",
    format: "number",
    extended: true,
  },
  checkouts: {
    label: "Meta Checkouts Initiated",
    group: "Meta",
    format: "number",
    extended: true,
  },
  landingViews: {
    label: "Meta Landing Page Views",
    group: "Meta",
    format: "number",
    extended: true,
  },
} as const;
export type ColumnId = keyof typeof COLUMNS;
export type SavedView = { id: string; name: string; columns: ColumnId[] };
export type SheetLayout = {
  columns: ColumnId[];
  views: SavedView[];
  activeView: string | null;
  revision: number;
};
export function defaultColumns(scope: string): ColumnId[] {
  return scope === "store"
    ? [
        "date",
        "revenue",
        "shopifyFees",
        "actualSales",
        "adSpend",
        "profit",
        "chargebackLoss",
        "chargebackWon",
        "adjustment",
        "refunds",
        "shopifyRoas",
        "metaRoas",
      ]
    : [
        "date",
        "orders",
        "adSpend",
        "aov",
        "revenue",
        "shopifyFees",
        "profit",
        "shopifyRoas",
        "metaRoas",
        "profitPercent",
        "cpc",
        "conversionRate",
      ];
}
export function emptyLayout(scope: string): SheetLayout {
  return {
    columns: defaultColumns(scope),
    views: [],
    activeView: null,
    revision: 0,
  };
}
export function availableColumns(scope: string) {
  return (Object.keys(COLUMNS) as ColumnId[]).filter(
    (id) => scope === "store" || !("storeOnly" in COLUMNS[id]),
  );
}
export function needsAttribution(columns: ColumnId[]) {
  return columns.includes("shopifyRoas");
}
export function needsExtendedMeta(columns: ColumnId[]) {
  return columns.some((id) => "extended" in COLUMNS[id]);
}
export function moveColumn(
  columns: ColumnId[],
  source: ColumnId,
  insertion: number,
): ColumnId[] {
  const from = columns.indexOf(source);
  if (from < 0) return columns;
  const next = columns.filter((id) => id !== source);
  next.splice(
    Math.max(0, Math.min(next.length, insertion - (from < insertion ? 1 : 0))),
    0,
    source,
  );
  return next;
}
export function validateLayout(value: unknown, scope: string): SheetLayout {
  const allowed = new Set(availableColumns(scope));
  const columns = (v: unknown): ColumnId[] => {
    if (
      !Array.isArray(v) ||
      !v.length ||
      v.length > allowed.size ||
      !v.includes("date") ||
      new Set(v).size !== v.length ||
      v.some((id) => !allowed.has(id))
    )
      throw new Error("Choose valid, unique columns including Date.");
    return v;
  };
  if (!value || typeof value !== "object") throw new Error("Invalid layout.");
  const v = value as Record<string, unknown>;
  if (
    !Number.isInteger(v.revision) ||
    Number(v.revision) < 0 ||
    !Array.isArray(v.views) ||
    v.views.length > 30
  )
    throw new Error("Invalid layout or too many views (maximum 30).");
  const views = v.views.map((view: SavedView) => {
    if (
      !view ||
      typeof view.id !== "string" ||
      !/^[\w-]{1,80}$/.test(view.id) ||
      typeof view.name !== "string" ||
      !view.name.trim() ||
      view.name.trim().length > 60
    )
      throw new Error("Give each view a name of 1–60 characters.");
    return {
      id: view.id,
      name: view.name.trim(),
      columns: columns(view.columns),
    };
  });
  if (
    new Set(views.map((x) => x.id)).size !== views.length ||
    new Set(views.map((x) => x.name.toLowerCase())).size !== views.length
  )
    throw new Error("View names must be unique.");
  if (v.activeView !== null && !views.some((x) => x.id === v.activeView))
    throw new Error("Unknown saved view.");
  return {
    columns: columns(v.columns),
    views,
    activeView: v.activeView as string | null,
    revision: Number(v.revision),
  };
}
const ratio = (
  n: number | null | undefined,
  d: number | null | undefined,
  scale = 1,
) => (n != null && d != null && d > 0 ? (n / d) * scale : null);
export function columnValue(
  id: ColumnId,
  day: StoreSheetDay,
  scope: string,
): number | null {
  const m = sheetMetrics(day),
    store = storeSheetMetrics(day);
  switch (id) {
    case "date":
      return null;
    case "shopifyFees":
      return day.shopifyFees == null ? null : -day.shopifyFees;
    case "actualSales":
      return store.actualSales;
    case "profit":
      return scope === "store" ? store.profit : m.profit;
    case "profitPercent":
      return ratio(
        scope === "store" ? store.profit : m.profit,
        day.revenue,
        100,
      );
    case "shopifyRoas":
      return ratio(day.attributedRevenue, day.adSpend);
    case "blendedRoas":
      return m.roas;
    case "aov":
      return m.aov;
    case "cpc":
      return m.cpc;
    case "conversionRate":
      return m.conversionRate;
    case "costPerPurchase":
      return ratio(day.adSpend, day.purchases);
    case "cpm":
      return ratio(day.adSpend, day.impressions, 1000);
    case "ctr":
      return ratio(day.clicks, day.impressions, 100);
    case "linkCtr":
      return ratio(day.linkClicks, day.impressions, 100);
    case "metaRoas":
      return ratio(day.purchaseValue, day.adSpend);
    default:
      return day[id] ?? null;
  }
}
