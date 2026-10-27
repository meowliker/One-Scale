import { createHash } from "crypto";
import { fetchFromMeta, MetaRateLimitError } from "./meta-client";
import { getMetaToken } from "./tokens";
import { rest } from "./supabase-persistence";
import { safeSheetError } from "./profit-sheet-access";
import { creativeLinks, postDestinationLinks } from "@/lib/profit-sheet/discovery";
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
  destinationLinks?: string[];
};
type CreativeSnapshot = {
  ids?: string[];
  idsCheckedAt?: number;
  window?: string;
  ads: Record<string, { value: CreativeAd; checkedAt: number }>;
  cooldownUntil?: number;
  posts?: Record<string, { links: string[]; checkedAt: number }>;
};
// Persist each completed chunk. A rate-limited run resumes instead of fetching the
// same hundreds of creatives again. Cache scope includes store, account and token.
export async function recentCreatives(
  token: string, accountId: string, from: string, to: string, deadline: number,
  storeId: string,
): Promise<CreativeAd[]> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const key = `/profit_sheet_creative_cache?store_id=eq.${encodeURIComponent(storeId)}&account_id=eq.${encodeURIComponent(accountId)}`;
  const rows = await rest<Array<{ token_hash: string; snapshot: CreativeSnapshot }>>(key);
  const snapshot: CreativeSnapshot = rows[0]?.token_hash === tokenHash ? rows[0].snapshot : { ads: {} };
  const save = () => rest("/profit_sheet_creative_cache?on_conflict=store_id,account_id", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ store_id: storeId, account_id: accountId, token_hash: tokenHash, snapshot, updated_at: new Date().toISOString() }),
  });
  if ((snapshot.cooldownUntil || 0) > Date.now())
    throw new MetaRateLimitError(`/${accountId}/ads`, snapshot.cooldownUntil! - Date.now());
  try {
    // Refresh membership at most every 30 minutes; creatives at most hourly.
    if (!snapshot.ids || snapshot.window !== `${from}:${to}` || Date.now() - (snapshot.idsCheckedAt || 0) > 30 * 60000) {
      const active = await metaPages<{ id: string }>(token, `/${accountId}/ads`,
        { fields: "id", effective_status: JSON.stringify(["ACTIVE"]) }, deadline);
      const delivered = await metaPages<{ ad_id: string }>(token, `/${accountId}/insights`,
        { fields: "ad_id", level: "ad", time_range: JSON.stringify({ since: from, until: to }) }, deadline);
      snapshot.ids = [...new Set([...active.map(a => a.id), ...delivered.map(a => a.ad_id)].filter(Boolean))];
      snapshot.idsCheckedAt = Date.now();
      snapshot.window = `${from}:${to}`;
      const wanted = new Set(snapshot.ids);
      for (const id of Object.keys(snapshot.ads)) if (!wanted.has(id)) delete snapshot.ads[id];
      await save();
    }
    const missing = snapshot.ids.filter(id => !snapshot.ads[id] || Date.now() - snapshot.ads[id].checkedAt > 60 * 60000);
    for (let offset = 0; offset < missing.length; offset += 50) {
      const batch = missing.slice(offset, offset + 50);
      const page = await metaPages<CreativeAd>(token, `/${accountId}/ads`, {
        fields: "id,name,campaign_id,creative{object_story_spec,asset_feed_spec,object_url,link_url,effective_object_story_id}", limit: "50",
        filtering: JSON.stringify([{ field: "id", operator: "IN", value: batch }]),
      }, deadline);
      for (const ad of page) snapshot.ads[ad.id] = { value: ad, checkedAt: Date.now() };
      await save();
      if (batch.some(id => !page.some(a => a.id === id))) throw new Error("Incomplete Meta creative results");
    }
    for (const id of snapshot.ids) {
      const ad = snapshot.ads[id].value;
      const postId = ad.creative?.effective_object_story_id;
      if (creativeLinks(ad.creative || {}).length || typeof postId !== "string" || !/^\d+_\d+$/.test(postId)) continue;
      snapshot.posts ||= {};
      if (!snapshot.posts[postId] || Date.now() - snapshot.posts[postId].checkedAt > 3600000) {
        if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
        try {
          const post = await fetchFromMeta<Parameters<typeof postDestinationLinks>[0]>(token, `/${postId}`,
            { fields: "attachments{url,target,subattachments}" }, 25000, 0);
          snapshot.posts[postId] = { links: postDestinationLinks(post), checkedAt: Date.now() };
        } catch (error) {
          if (error instanceof MetaRateLimitError || !/Missing permissions|Unsupported get request|\"code\":\s*(100|200|10)[,}]/i.test(String(error))) throw error;
          // A saved post can be unreadable with ads-only access. Never infer its
          // URL from its name or copy. Keep it in review, and avoid repeated calls.
          snapshot.posts[postId] = { links: [], checkedAt: Date.now() };
        }
        await save();
      }
      ad.destinationLinks = snapshot.posts[postId].links;
    }
    snapshot.cooldownUntil = undefined;
    await save();
    return snapshot.ids.map(id => snapshot.ads[id].value);
  } catch (error) {
    if (error instanceof MetaRateLimitError) {
      snapshot.cooldownUntil = Date.now() + error.retryAfterMs;
      await save();
    }
    throw error;
  }
}
