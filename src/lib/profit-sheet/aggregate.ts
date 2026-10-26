import { assignmentMatches } from "./discovery";
import type { StoreSheetDay } from "@/lib/profit-sheet";
import type { SheetProduct } from "./model";
export type OrderInput = {
  id: string | number;
  name?: string;
  total_price: string;
  current_total_price?: string;
  financial_status: string;
  test?: boolean;
  cancelled_at?: string | null;
  currency: string;
  line_items: Array<{
    product_id: string | number | null;
    price: string;
    quantity: number;
    discount_allocations?: Array<{ amount: string }>;
  }>;
};
export type CampaignMetric = {
  accountId: string;
  campaignId: string;
  adId?: string;
  spend: number;
  impressions?: number;
  purchaseValue?: number;
  addToCart?: number;
  checkouts?: number;
  landingViews?: number;
  clicks: number;
  purchases: number;
  linkClicks: number;
};
export function emptyDay(date: string): StoreSheetDay {
  return {
    date,
    orders: 0,
    revenue: 0,
    shopifyFees: 0,
    otherFees: 0,
    adSpend: null,
    clicks: null,
    purchases: null,
    linkClicks: null,
  };
}
export function aggregateOrders(
  date: string,
  orders: OrderInput[],
  products: SheetProduct[],
  fees: Map<string, number>,
  otherFees: number,
) {
  const rows = new Map<string, StoreSheetDay>([
    ["store", emptyDay(date)],
    ...products.map((p) => [p.id, emptyDay(date)] as [string, StoreSheetDay]),
  ]);
  const store = rows.get("store")!;
  for (const order of orders) {
    if (
      order.test ||
      !["paid", "partially_paid", "partially_refunded", "refunded"].includes(
        order.financial_status,
      )
    )
      continue;
    const revenue = Number(order.current_total_price ?? order.total_price);
    // Complete-store refunds are separate cash movements, so retain the
    // pre-refund order total rather than subtracting refunds here as well.
    const grossRevenue = Number(order.total_price);
    const fee = fees.get(String(order.id)) ?? 0;
    store.orders!++;
    store.revenue! += grossRevenue;
    store.shopifyFees! += fee;
    const lines = order.line_items.map((l) => ({
      id: String(l.product_id),
      quantity: l.quantity,
      amount: Math.max(
        0,
        Number(l.price) * l.quantity -
          (l.discount_allocations || []).reduce(
            (s, d) => s + Number(d.amount),
            0,
          ),
      ),
    }));
    // Product links identify the order's offer, which may be a free entry item
    // with paid add-ons/shipping. Attribute the whole order to its matching tabs,
    // not only the entry item's price. Split multi-tab orders without duplication.
    const matches = products.flatMap((product) => {
      if (product.startDate && date < product.startDate) return [];
      const matched = lines.filter((l) => product.shopifyIds.includes(l.id));
      return matched.length
        ? [
            {
              product,
              amount: matched.reduce((s, l) => s + l.amount, 0),
              quantity: matched.reduce((s, l) => s + l.quantity, 0),
            },
          ]
        : [];
    });
    const base = matches.reduce((s, m) => s + m.amount, 0);
    const units = matches.reduce((s, m) => s + m.quantity, 0);
    for (const match of matches) {
      const row = rows.get(match.product.id)!;
      const share =
        base > 0
          ? match.amount / base
          : units > 0
            ? match.quantity / units
            : 1 / matches.length;
      row.orders!++;
      row.revenue! += revenue * share;
      row.shopifyFees! += fee * share;
    }
  }
  store.otherFees = otherFees;
  for (const product of products) {
    const row = rows.get(product.id)!;
    row.otherFees =
      store.revenue! > 0 ? (otherFees * row.revenue!) / store.revenue! : 0;
  }
  return rows;
}
function rowDate(rows: Map<string, StoreSheetDay>, id: string) {
  return rows.get(id)?.date;
}
export function attachAds(
  rows: Map<string, StoreSheetDay>,
  products: SheetProduct[],
  metrics: CampaignMetric[],
  complete: boolean,
  hasAccounts: boolean,
) {
  function apply(
    row: StoreSheetDay,
    selected: CampaignMetric[],
    available: boolean,
  ) {
    row.metaVersion = 1;
    row.impressions =
      row.purchaseValue =
      row.addToCart =
      row.checkouts =
      row.landingViews =
        null;
    if (!available) return;
    row.impressions =
      row.purchaseValue =
      row.addToCart =
      row.checkouts =
      row.landingViews =
        0;
    row.adSpend = 0;
    row.clicks = 0;
    row.purchases = 0;
    row.linkClicks = 0;
    for (const m of selected) {
      row.adSpend += m.spend;
      for (const key of [
        "impressions",
        "purchaseValue",
        "addToCart",
        "checkouts",
        "landingViews",
      ] as const)
        row[key] =
          row[key] == null || m[key] == null ? null : row[key]! + m[key]!;
      row.clicks += m.clicks;
      row.purchases += m.purchases;
      row.linkClicks += m.linkClicks;
    }
  }
  apply(rows.get("store")!, metrics, complete && hasAccounts);
  for (const product of products) {
    if (product.startDate && rows.get(product.id)!.date < product.startDate)
      continue;
    apply(
      rows.get(product.id)!,
      metrics.filter((m) =>
        product.assignments.some((a) =>
          assignmentMatches(a, m, rowDate(rows, product.id)),
        ),
      ),
      complete && product.assignments.length > 0,
    );
  }
}
// Meta supplies hourly bins. Use the overlap at historical boundaries; current-hour
// data already represents elapsed activity, so do not prorate it a second time.
export function hourWeight(
  hourStart: number,
  windowStart: number,
  windowEnd: number,
  now: number,
) {
  const availableEnd = Math.min(hourStart + 3600_000, now);
  const denominator = availableEnd - hourStart;
  if (denominator <= 0) return 0;
  return (
    Math.max(
      0,
      Math.min(availableEnd, windowEnd) - Math.max(hourStart, windowStart),
    ) / denominator
  );
}
