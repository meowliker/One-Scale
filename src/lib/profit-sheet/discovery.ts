import type { ProductAssignment, SheetProduct } from "./model";
export type DiscoveredAccount = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
  business?: { id: string; name: string };
};
export type DiscoveryFinding = {
  key: string;
  kind: "product" | "ad" | "notice";
  status: "active" | "candidate" | "review" | "excluded";
  title: string;
  detail: string;
  productId?: string;
  sessions?: number;
  activeDays?: number;
  sales?: number;
  links?: string[];
  accountId?: string;
  campaignId?: string;
  adId?: string;
};
export function assignmentMatches(
  a: ProductAssignment,
  m: { accountId: string; campaignId: string; adId?: string },
  date?: string,
) {
  if (
    a.accountId !== m.accountId ||
    a.excludedCampaignIds?.includes(m.campaignId)
  )
    return false;
  if (a.mode === "ads")
    return (
      !!m.adId &&
      !!a.adLinks?.some(
        (l) =>
          l.adId === m.adId &&
          l.campaignId === m.campaignId &&
          (!date || (date >= l.from && (!l.to || date <= l.to))),
      )
    );
  return (
    a.mode === "all" ||
    (!a.mode && !a.campaignIds.length) ||
    a.campaignIds.includes(m.campaignId)
  );
}
export function productCampaignMatches(
  p: SheetProduct,
  accountId: string,
  campaignId: string,
  adId?: string,
  date?: string,
) {
  return p.assignments.some((a) => {
    if (
      a.accountId !== accountId ||
      a.excludedCampaignIds?.includes(campaignId)
    )
      return false;
    if (a.mode !== "ads")
      return assignmentMatches(a, { accountId, campaignId, adId }, date);
    return !!a.adLinks?.some(
      (l) =>
        l.campaignId === campaignId &&
        (!adId || l.adId === adId) &&
        (!date || (date >= l.from && (!l.to || date <= l.to))),
    );
  });
}
export function productHandle(value: string, domains?: Set<string>) {
  try {
    const u = new URL(value, "https://relative.invalid");
    if (!["http:", "https:"].includes(u.protocol)) return null;
    if (domains && !domains.has(u.hostname.toLowerCase().replace(/^www\./, "")))
      return null;
    const handle = u.pathname.match(/(?:^|\/)products\/([^/]+)\/?$/)?.[1];
    return handle ? decodeURIComponent(handle) : null;
  } catch {
    return null;
  }
}
// Only public creative destination fields are inspected. Never crawl customer or download URLs.
export function creativeLinks(creative: Record<string, unknown>): string[] {
  const urls = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== "object" || depth > 8) return;
    for (const [key, value] of Object.entries(v)) {
      if (
        ["link", "link_url", "website_url", "object_url"].includes(key) &&
        typeof value === "string" &&
        /^https?:\/\//.test(value)
      )
        urls.add(value);
      else if (typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(creative, 0);
  return [...urls];
}
