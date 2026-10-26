import {
  addDays,
  type SheetAccount,
  type StoreSheetDay,
} from "@/lib/profit-sheet";
export const REPORTING_ZONE = "Asia/Kolkata";
export type SheetSettings = {
  savedFrom: string | null;
  savedTo: string | null;
  endToday: boolean;
};
export type ProductAssignment = {
  accountId: string;
  campaignIds: string[];
  mode?: "all" | "selected" | "ads";
  excludedCampaignIds?: string[];
  adLinks?: Array<{
    adId: string;
    campaignId: string;
    from: string;
    to?: string;
  }>;
};
export type SheetProduct = {
  id: string;
  source?: "manual" | "auto";
  manualOverride?: boolean;
  discovery?: {
    sessions: number;
    activeDays: number;
    sales: number;
    checkedAt: string;
  };
  name: string;
  links: string[];
  shopifyIds: string[];
  startDate?: string | null;
  assignments: ProductAssignment[];
};
export type SheetConfig = {
  settings: SheetSettings;
  accounts: SheetAccount[];
  products: SheetProduct[];
  version: number;
  currency: string | null;
};
export type SavedDay = {
  date: string;
  scope_id: string;
  metrics: StoreSheetDay;
  currency: string;
  config_version: number;
  warnings: string[];
  synced_at: string;
};
export type SheetJob = {
  store_id: string;
  date: string;
  status: "queued" | "running" | "success" | "error";
  error: string | null;
  lease_id: string;
  lease_until?: string | null;
  updated_at: string;
};
// 11:30 IST = 06:00 UTC. The exclusive end includes every instant before next day's 11:30.
export function reportingDay(now = new Date()): string {
  return new Date(now.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
}
export function dayWindow(date: string) {
  return {
    start: `${date}T06:00:00.000Z`,
    end: `${addDays(date, 1)}T06:00:00.000Z`,
  };
}
export function defaultRange(settings: SheetSettings, now = new Date()) {
  const to = reportingDay(now);
  return {
    from: settings.savedFrom || `${to.slice(0, 7)}-01`,
    to: settings.endToday ? to : settings.savedTo || to,
  };
}
export function validateProducts(
  products: SheetProduct[],
  accounts: SheetAccount[],
) {
  const ids = new Set<string>();
  const shopify = new Set<string>();
  const assignments = new Map<
    string,
    Array<{ product: string; campaigns: string[] }>
  >();
  for (const p of products) {
    if (p.startDate) {
      try {
        sheetDates(p.startDate, p.startDate);
      } catch {
        throw new Error(
          "Choose a valid product start date, no later than today.",
        );
      }
    }
    if (
      !p.id ||
      ids.has(p.id) ||
      !p.name?.trim() ||
      p.name.length > 160 ||
      !p.shopifyIds.length
    )
      throw new Error(
        "Each product needs a name and at least one valid Shopify product link.",
      );
    ids.add(p.id);
    for (const id of p.shopifyIds) {
      if (shopify.has(id))
        throw new Error(
          "A Shopify product can belong to only one product tab.",
        );
      shopify.add(id);
    }
    const seen = new Set<string>();
    for (const a of p.assignments) {
      if (
        !accounts.some((account) => account.adAccountId === a.accountId) ||
        seen.has(a.accountId)
      )
        throw new Error("Choose each saved ad account once per product.");
      seen.add(a.accountId);
      if (a.mode && !["all", "selected", "ads"].includes(a.mode))
        throw new Error("Invalid assignment mode.");
      if (a.excludedCampaignIds?.some((id) => !/^\d+$/.test(id)))
        throw new Error("Invalid excluded campaign.");
      if (
        a.mode === "ads" &&
        (!a.adLinks ||
          a.adLinks.some(
            (l) =>
              !/^\d+$/.test(l.adId) ||
              !a.campaignIds.includes(l.campaignId) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(l.from),
          ))
      )
        throw new Error("Invalid automatic ad mapping.");
      if (
        a.campaignIds.some((id) => !/^\d+$/.test(id)) ||
        new Set(a.campaignIds).size !== a.campaignIds.length
      )
        throw new Error("Invalid or duplicate campaign.");
      const list = assignments.get(a.accountId) || [];
      list.push({ product: p.id, campaigns: a.campaignIds });
      assignments.set(a.accountId, list);
    }
  }
  // Ad-level automatic mappings can share a campaign, but never an ad.
  for (const account of accounts) {
    const mapped = products.flatMap((p) =>
      p.assignments.filter((a) => a.accountId === account.adAccountId),
    );
    for (let i = 0; i < mapped.length; i++)
      for (let j = i + 1; j < mapped.length; j++) {
        const a = mapped[i],
          b = mapped[j];
        const all = (x: ProductAssignment) =>
          x.mode === "all" || (!x.mode && !x.campaignIds.length);
        if (
          (a.mode === "selected" && !a.campaignIds.length) ||
          (b.mode === "selected" && !b.campaignIds.length)
        )
          continue;
        if (all(a) || all(b))
          throw new Error(
            "Products sharing an ad account must each select their campaigns.",
          );
        if (a.mode === "ads" && b.mode === "ads") {
          if (
            a.adLinks?.some((x) =>
              b.adLinks?.some(
                (y) =>
                  y.adId === x.adId &&
                  x.from <= (y.to || "9999-12-31") &&
                  y.from <= (x.to || "9999-12-31"),
              ),
            )
          )
            throw new Error(
              "An ad cannot be assigned to more than one product.",
            );
        } else if (
          a.campaignIds.some(
            (id) =>
              b.campaignIds.includes(id) &&
              !a.excludedCampaignIds?.includes(id) &&
              !b.excludedCampaignIds?.includes(id),
          )
        )
          throw new Error(
            "A campaign cannot be assigned to more than one product unless both use separate ad mappings.",
          );
      }
  }
}
export function sheetDates(from: string, to: string, max = 1096): string[] {
  const valid = (s: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(`${s}T00:00:00Z`)) &&
    new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to) || from > to || to > reportingDay())
    throw new Error(
      "Choose valid reporting dates, ending no later than today.",
    );
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (days.length >= max)
      throw new Error("Choose a range of at most three years.");
    days.push(d);
  }
  return days;
}

export function currentSavedDay(
  row: SavedDay,
  version: number,
  scope: string,
  metaRequired = false,
  attributionRequired = false,
) {
  return (
    row.config_version === version &&
    (scope !== "store" || row.metrics.financeVersion === 1) &&
    (!metaRequired || row.metrics.metaVersion === 1) &&
    (!attributionRequired || row.metrics.attributionVersion === 1)
  );
}
export function runnableJob(jobs: SheetJob[], now = Date.now()) {
  return jobs.find(
    (j) =>
      j.status === "queued" ||
      (j.status === "running" &&
        (!j.lease_until || Date.parse(j.lease_until) <= now)),
  );
}
