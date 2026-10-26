import { assignmentMatches, productCampaignMatches } from "./discovery";
import type { CampaignMetric, OrderInput } from "./aggregate";
import { aggregateOrders } from "./aggregate";
import type { SheetProduct } from "./model";
export const ATTRIBUTION_VERSION = 1;
export type Utm = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  id?: string | null;
};
export type Visit = {
  occurredAt?: string | null;
  source?: string | null;
  referrerUrl?: string | null;
  utmParameters?: Utm | null;
};
export type Journey = {
  ready: boolean;
  firstVisit?: Visit | null;
  lastVisit?: Visit | null;
};
export type Evidence = {
  journey: Journey | null;
  ug: string | null;
  createdAt: string;
};
export type Entity = {
  accountId: string;
  id: string;
  kind: "campaign" | "adset" | "ad";
  name: string;
  campaignId: string;
  adsetId?: string;
  names?: string[];
};
export type Match = {
  accountId: string | null;
  campaignId: string | null;
  adsetId: string | null;
  adId: string | null;
  method: string;
  source: string;
  utm: Utm | null;
  timestamp: string | null;
  reason: string;
};
export type AttributedOrder = Match & {
  orderId: string;
  name: string;
  revenue: number;
  scopeRevenue: Record<string, number>;
  evidence: Evidence;
};
export type AttributionSnapshot = {
  date?: string;
  version: number;
  status: "complete" | "error";
  error?: string;
  orders: AttributedOrder[];
  campaigns: Array<CampaignMetric & { name: string }>;
  products: SheetProduct[];
};
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const hasUtm = (u?: Utm | null) =>
  !!u && Object.values(u).some((v) => !!text(v));
const metaSource = (s?: string | null) =>
  /^(facebook|fb|fbads|instagram|ig|meta|facebookads|facebook_ads|instagram_ads)$/i.test(
    text(s),
  ) || metaReferrer(text(s).includes("://") ? text(s) : `https://${text(s)}`);
function metaReferrer(value?: string | null) {
  try {
    const host = new URL(value || "").hostname;
    return /(^|\.)(facebook\.com|instagram\.com|fb\.com)$/.test(host);
  } catch {
    return false;
  }
}
function externalSource(v?: Visit | null) {
  const s = text(v?.source);
  return !!s && !metaSource(s) && !/^(direct|unknown|none)$/i.test(s);
}
function timestamp(value: unknown) {
  const n =
    typeof value === "number"
      ? value < 1e12
        ? value * 1000
        : value
      : Date.parse(text(value));
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
export function selectEvidence(
  e: Evidence,
): Pick<Match, "source" | "utm" | "timestamp" | "reason"> {
  const last = e.journey?.lastVisit;
  if (hasUtm(last?.utmParameters))
    return {
      source: "Shopify last visit",
      utm: last!.utmParameters!,
      timestamp: last?.occurredAt || null,
      reason: "Last visit UTMs take precedence",
    };
  // Never replace a known non-Meta last touch with an older Facebook cookie.
  if (externalSource(last) && !metaReferrer(last?.referrerUrl))
    return {
      source: "Shopify last visit",
      utm: null,
      timestamp: last?.occurredAt || null,
      reason: "Last visit identifies another source",
    };
  try {
    const raw = JSON.parse(e.ug || "null");
    const v = raw?.v;
    if (v && typeof v === "object") {
      const u = Object.fromEntries(
        ["source", "medium", "campaign", "term", "content", "id"].map((k) => [
          k,
          text(v[k]) || null,
        ]),
      ) as Utm;
      const ts = timestamp(raw.ts);
      if (hasUtm(u)) {
        if (ts && Date.parse(ts) > Date.parse(e.createdAt) + 60000)
          return {
            source: "Upsell Genie",
            utm: u,
            timestamp: ts,
            reason: "Saved touch occurs after the order; not credited",
          };
        return {
          source: "Upsell Genie",
          utm: u,
          timestamp: ts,
          reason: "Saved order UTMs; no fixed click window applied",
        };
      }
    }
  } catch {
    /* Malformed tracking remains unmatched; it must not break sales sync. */
  }
  const first = e.journey?.firstVisit;
  if (metaReferrer(last?.referrerUrl) && hasUtm(first?.utmParameters))
    return {
      source: "Shopify first visit (Meta return)",
      utm: first!.utmParameters!,
      timestamp: first?.occurredAt || null,
      reason: "First visit fallback supported by last Meta referrer",
    };
  return {
    source: "None",
    utm: null,
    timestamp: null,
    reason:
      e.journey?.ready === false
        ? "Shopify journey pending; no saved UTMs"
        : "No usable campaign tracking",
  };
}
export function matchOrder(e: Evidence, catalog: Entity[]): Match {
  const selected = selectEvidence(e);
  const base: Match = {
    ...selected,
    accountId: null,
    campaignId: null,
    adsetId: null,
    adId: null,
    method: "unmatched",
  };
  const u = selected.utm;
  if (!u || selected.reason.startsWith("Saved touch occurs")) return base;
  if (text(u.source) && !metaSource(u.source))
    return { ...base, reason: "UTM source is not Meta" };
  const content = text(u.content),
    term = text(u.term),
    campaign = text(u.campaign);
  const unique = (rows: Entity[]) => [
    ...new Map(
      rows.map((x) => [`${x.accountId}:${x.kind}:${x.id}`, x]),
    ).values(),
  ];
  const candidates: Array<[string, Entity[]]> = [
    ["ad ID", catalog.filter((x) => x.kind === "ad" && x.id === content)],
    [
      "ad-set ID + ad name",
      catalog.filter(
        (x) =>
          x.kind === "ad" &&
          x.adsetId === term &&
          (x.name === content || x.names?.includes(content)),
      ),
    ],
    ["ad-set ID", catalog.filter((x) => x.kind === "adset" && x.id === term)],
    [
      "campaign ID",
      catalog.filter(
        (x) =>
          x.kind === "campaign" &&
          (x.id === campaign || (!campaign && x.id === text(u.id))),
      ),
    ],
    [
      "unique campaign name",
      catalog.filter(
        (x) =>
          x.kind === "campaign" &&
          (x.name === campaign || x.names?.includes(campaign)),
      ),
    ],
  ];
  for (const [method, found] of candidates) {
    const rows = unique(found);
    if (!rows.length) continue;
    if (rows.length > 1)
      return { ...base, reason: `Ambiguous ${method}; multiple matches` };
    const row = rows[0];
    // Conflicting explicit IDs must not silently be downgraded to a weaker match.
    if (
      (/^\d+$/.test(campaign) && campaign !== row.campaignId) ||
      (row.kind === "ad" && /^\d+$/.test(term) && term !== row.adsetId)
    )
      return { ...base, reason: "Conflicting campaign/ad-set IDs" };
    if (
      (/^\d+$/.test(content) && row.kind !== "ad") ||
      (/^\d+$/.test(term) && row.kind === "campaign")
    )
      return {
        ...base,
        reason: "Stronger tracking ID is missing from the Meta catalog",
      };
    return {
      ...base,
      accountId: row.accountId,
      campaignId: row.campaignId,
      adsetId: row.kind === "adset" ? row.id : row.adsetId || null,
      adId: row.kind === "ad" ? row.id : null,
      method,
      reason: `Matched by ${method}`,
    };
  }
  return { ...base, reason: "UTMs do not match the saved Meta catalog" };
}
export function assigned(
  product: SheetProduct | undefined,
  accountId: string | null,
  campaignId: string | null,
  adId?: string | null,
  date?: string,
) {
  return (
    !product ||
    productCampaignMatches(
      product,
      accountId || "",
      campaignId || "",
      adId || undefined,
      date,
    )
  );
}
export function buildAttribution(
  date: string,
  orders: OrderInput[],
  evidence: Map<string, Evidence>,
  catalog: Entity[],
  products: SheetProduct[],
  metrics: CampaignMetric[],
): AttributionSnapshot {
  const result: AttributedOrder[] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (
      seen.has(String(o.id)) ||
      o.test ||
      !["paid", "partially_paid", "partially_refunded", "refunded"].includes(
        o.financial_status,
      )
    )
      continue;
    seen.add(String(o.id));
    const e = evidence.get(String(o.id));
    if (!e) throw new Error("Incomplete Shopify attribution evidence");
    const shares = aggregateOrders(date, [o], products, new Map(), 0);
    result.push({
      ...matchOrder(e, catalog),
      orderId: String(o.id),
      name: o.name || String(o.id),
      revenue: Number(o.total_price),
      scopeRevenue: Object.fromEntries(
        [...shares]
          .filter(([, r]) => r.orders! > 0)
          .map(([id, r]) => [id, r.revenue!]),
      ),
      evidence: e,
    });
  }
  const campaigns = new Map<string, CampaignMetric & { name: string }>();
  for (const m of metrics) {
    const key = `${m.accountId}:${m.campaignId}:${m.adId || ""}`;
    const prev = campaigns.get(key);
    if (!prev)
      campaigns.set(key, {
        ...m,
        name:
          catalog.find(
            (c) =>
              c.kind === "campaign" &&
              c.id === m.campaignId &&
              c.accountId === m.accountId,
          )?.name || m.campaignId,
      });
    else
      for (const k of [
        "spend",
        "clicks",
        "linkClicks",
        "purchases",
        "impressions",
        "purchaseValue",
        "addToCart",
        "checkouts",
        "landingViews",
      ] as const)
        prev[k] = (prev[k] || 0) + (m[k] || 0);
  }
  for (const o of result)
    if (
      o.campaignId &&
      o.accountId &&
      ![...campaigns.values()].some(
        (c) => c.accountId === o.accountId && c.campaignId === o.campaignId,
      )
    )
      campaigns.set(`${o.accountId}:${o.campaignId}`, {
        accountId: o.accountId,
        campaignId: o.campaignId,
        name:
          catalog.find(
            (c) =>
              c.kind === "campaign" &&
              c.id === o.campaignId &&
              c.accountId === o.accountId,
          )?.name || o.campaignId,
        spend: 0,
        purchaseValue: 0,
        clicks: 0,
        purchases: 0,
        linkClicks: 0,
      });
  return {
    version: ATTRIBUTION_VERSION,
    date,
    status: "complete",
    orders: result,
    campaigns: [...campaigns.values()],
    products,
  };
}
export function attributedRevenue(
  snapshot: AttributionSnapshot,
  scope: string,
) {
  if (snapshot.status !== "complete") return null;
  const product = snapshot.products.find((p) => p.id === scope);
  return snapshot.orders.reduce(
    (s, o) =>
      s +
      (o.campaignId &&
      assigned(product, o.accountId, o.campaignId, o.adId, snapshot.date)
        ? o.scopeRevenue[scope] || 0
        : 0),
    0,
  );
}
export type CampaignReport = {
  key: string;
  accountId: string;
  campaignId: string;
  name: string;
  spend: number;
  metaValue: number;
  metaPurchases: number;
  revenue: number;
  orders: number;
};
export function summarizeAttribution(
  snapshots: AttributionSnapshot[],
  scope: string,
) {
  const campaigns = new Map<string, CampaignReport>();
  const orders: Array<
    AttributedOrder & { scopedRevenue: number; scopedMatch: boolean }
  > = [];
  let revenue = 0,
    matchedRevenue = 0,
    matchedOrders = 0;
  for (const snapshot of snapshots) {
    if (snapshot.status !== "complete") continue;
    const product = snapshot.products.find((p) => p.id === scope);
    if (scope !== "store" && !product) continue;
    for (const c of snapshot.campaigns) {
      if (
        product &&
        !product.assignments.some((a) => assignmentMatches(a, c, snapshot.date))
      )
        continue;
      const key = `${c.accountId}:${c.campaignId}`;
      const row = campaigns.get(key) || {
        key,
        accountId: c.accountId,
        campaignId: c.campaignId,
        name: c.name,
        spend: 0,
        metaValue: 0,
        metaPurchases: 0,
        revenue: 0,
        orders: 0,
      };
      row.spend += c.spend;
      row.metaValue += c.purchaseValue || 0;
      row.metaPurchases += c.purchases;
      campaigns.set(key, row);
    }
    for (const o of snapshot.orders) {
      if (!(scope in o.scopeRevenue)) continue;
      const value = o.scopeRevenue[scope];
      const matched =
        !!o.campaignId &&
        assigned(product, o.accountId, o.campaignId, o.adId, snapshot.date);
      revenue += value;
      if (matched) {
        matchedRevenue += value;
        matchedOrders++;
        const key = `${o.accountId}:${o.campaignId}`;
        if (!campaigns.has(key))
          campaigns.set(key, {
            key,
            accountId: o.accountId!,
            campaignId: o.campaignId!,
            name:
              snapshot.campaigns.find(
                (c) =>
                  c.accountId === o.accountId && c.campaignId === o.campaignId,
              )?.name || o.campaignId!,
            spend: 0,
            metaValue: 0,
            metaPurchases: 0,
            revenue: 0,
            orders: 0,
          });
        const campaign = campaigns.get(key)!;
        campaign.revenue += value;
        campaign.orders++;
      }
      orders.push({
        ...o,
        scopedRevenue: value,
        scopedMatch: matched,
        reason:
          o.campaignId && !matched
            ? "Matched campaign is not assigned to this product"
            : o.reason,
      });
    }
  }
  return {
    campaigns: [...campaigns.values()].sort(
      (a, b) => b.spend - a.spend || a.name.localeCompare(b.name),
    ),
    orders,
    revenue,
    matchedRevenue,
    unmatchedRevenue: revenue - matchedRevenue,
    matchedOrders,
    orderCount: orders.length,
    coverage: revenue > 0 ? (matchedRevenue / revenue) * 100 : null,
  };
}
