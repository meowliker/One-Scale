import { fetchFromMeta } from "./meta-client";
import { getMetaToken } from "./tokens";
import { rest } from "./supabase-persistence";
import { safeSheetError } from "./profit-sheet-access";
import type { DiscoveredAccount } from "@/lib/profit-sheet/discovery";
export async function metaPages<T>(
  token: string,
  endpoint: string,
  params: Record<string, string>,
  deadline: number,
): Promise<T[]> {
  const all: T[] = [];
  const seen = new Set<string>();
  let after: string | undefined;
  for (let page = 0; page < 200; page++) {
    if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
    const r = await fetchFromMeta<{
      data: T[];
      paging?: { next?: string; cursors?: { after?: string } };
    }>(
      token,
      endpoint,
      { ...params, limit: params.limit || "250", ...(after ? { after } : {}) },
      25000,
      0,
    );
    if (!Array.isArray(r.data)) throw new Error("Missing Meta results");
    all.push(...r.data);
    if (!r.paging?.next) return all;
    after = r.paging.cursors?.after;
    if (!after || seen.has(after))
      throw new Error("Incomplete Meta pagination");
    seen.add(after);
  }
  throw new Error("Meta pagination limit exceeded");
}
export async function connectedAccounts(
  storeId: string,
  deadline = Date.now() + 50000,
) {
  const token = await getMetaToken(storeId);
  if (!token) throw new Error("Meta integration unavailable");
  const [accountResult, businessResult] = await Promise.allSettled([
    metaPages<DiscoveredAccount>(
      token.accessToken,
      "/me/adaccounts",
      {
        fields:
          "id,name,currency,timezone_name,account_status,business{id,name}",
      },
      deadline,
    ),
    metaPages<{ id: string; name: string }>(
      token.accessToken,
      "/me/businesses",
      { fields: "id,name" },
      deadline,
    ),
  ]);
  if (accountResult.status === "rejected") throw accountResult.reason;
  const accounts = [
    ...new Map(accountResult.value.map((a) => [a.id, a])).values(),
  ];
  const businesses =
    businessResult.status === "fulfilled" ? businessResult.value : [];
  const warnings =
    businessResult.status === "rejected"
      ? [
          `Business grouping unavailable: ${safeSheetError(businessResult.reason)} Accessible ad accounts are still listed.`,
        ]
      : [];
  const result = { accounts, businesses, warnings };
  await rest("/profit_sheet_meta_inventory?on_conflict=store_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      store_id: storeId,
      ...result,
      updated_at: new Date().toISOString(),
    }),
  });
  return result;
}

export type CreativeAd = {
  id: string;
  name: string;
  campaign_id: string;
  creative?: Record<string, unknown>;
};
// Discover currently active ads plus ads that delivered recently. Fetching years of
// inactive creatives makes large accounts time out without improving current mapping.
export async function recentCreatives(
  token: string,
  accountId: string,
  from: string,
  to: string,
  deadline: number,
): Promise<CreativeAd[]> {
  const [active, delivered] = await Promise.all([
    metaPages<{ id: string }>(
      token,
      `/${accountId}/ads`,
      { fields: "id", effective_status: JSON.stringify(["ACTIVE"]) },
      deadline,
    ),
    metaPages<{ ad_id: string }>(
      token,
      `/${accountId}/insights`,
      {
        fields: "ad_id",
        level: "ad",
        time_range: JSON.stringify({ since: from, until: to }),
      },
      deadline,
    ),
  ]);
  const ids = [
    ...new Set(
      [...active.map((a) => a.id), ...delivered.map((a) => a.ad_id)].filter(
        Boolean,
      ),
    ),
  ];
  const ads: CreativeAd[] = [];
  for (let offset = 0; offset < ids.length; offset += 25) {
    const batch = ids.slice(offset, offset + 25);
    const page = await metaPages<CreativeAd>(
      token,
      `/${accountId}/ads`,
      {
        fields:
          "id,name,campaign_id,creative{object_story_spec,asset_feed_spec,object_url}",
        limit: "25",
        filtering: JSON.stringify([
          { field: "id", operator: "IN", value: batch },
        ]),
      },
      deadline,
    );
    ads.push(...page);
    if (batch.some((id) => !page.some((a) => a.id === id)))
      throw new Error("Incomplete Meta creative results");
  }
  return ads;
}
