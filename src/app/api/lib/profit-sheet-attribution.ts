import { fetchFromMeta } from "./meta-client";
import { shopifyGraphQL } from "./shopify-graphql";
import { rest } from "./supabase-persistence";
import { fetchAllRestRows } from "./supabase-pagination";
import type { SavedSheetAccount } from "./profit-sheet-storage";
import type { Entity, Evidence, Journey } from "@/lib/profit-sheet/attribution";
import type { OrderInput } from "@/lib/profit-sheet/aggregate";
const enc = encodeURIComponent;
// No active-status filter: paused and historical entities are needed for old UTMs.
// Successful snapshots are retained and merged, never replaced with a partial page.
export async function loadMetaCatalog(
  storeId: string,
  account: SavedSheetAccount,
  deadline: number,
): Promise<Entity[]> {
  const filter = `store_id=eq.${enc(storeId)}&account_id=eq.${enc(account.adAccountId)}`;
  const [cached, state] = await Promise.all([
    fetchAllRestRows<{ entity: Entity }>(
      `/profit_sheet_meta_entities?${filter}&select=entity&order=entity_id.asc,kind.asc`,
    ),
    rest<Array<{ synced_at: string }>>(
      `/profit_sheet_meta_catalogs?${filter}&select=synced_at`,
    ),
  ]);
  if (cached.length >= 100000)
    throw new Error("Meta catalog exceeded storage pagination limit");
  if (state[0] && Date.parse(state[0].synced_at) > Date.now() - 30 * 60000)
    return cached.map((r) => r.entity);
  const entities: Entity[] = [];
  for (const kind of ["campaign", "adset", "ad"] as const) {
    let after: string | undefined;
    const seen = new Set<string>();
    let complete = false;
    for (let page = 0; page < 200; page++) {
      if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
      const data = await fetchFromMeta<{
        data: Array<{
          id: string;
          name: string;
          campaign_id?: string;
          adset_id?: string;
        }>;
        paging?: { next?: string; cursors?: { after?: string } };
      }>(
        account.accessToken,
        `/${account.adAccountId}/${kind}s`,
        {
          fields: `id,name${kind !== "campaign" ? ",campaign_id" : ""}${kind === "ad" ? ",adset_id" : ""}`,
          limit: "250",
          ...(after ? { after } : {}),
        },
        12000,
        0,
      );
      for (const row of data.data) {
        if (
          typeof row.id !== "string" ||
          !/^\d+$/.test(row.id) ||
          (kind !== "campaign" && !row.campaign_id)
        )
          throw new Error("Invalid Meta catalog entity");
        entities.push({
          accountId: account.adAccountId,
          id: row.id,
          name: row.name,
          kind,
          campaignId: kind === "campaign" ? row.id : row.campaign_id!,
          ...(row.adset_id ? { adsetId: row.adset_id } : {}),
        });
      }
      if (!data.paging?.next) {
        complete = true;
        break;
      }
      after = data.paging.cursors?.after;
      if (!after || seen.has(after))
        throw new Error("Incomplete Meta catalog pagination");
      seen.add(after);
    }
    if (!complete) throw new Error("Meta catalog exceeded pagination limit");
  }
  const merged = new Map(
    cached.map((r) => [`${r.entity.kind}:${r.entity.id}`, r.entity]),
  );
  for (const e of entities) {
    const old = merged.get(`${e.kind}:${e.id}`);
    merged.set(`${e.kind}:${e.id}`, {
      ...e,
      names: [
        ...new Set([e.name, ...(old?.names || []), ...(old ? [old.name] : [])]),
      ],
    });
  }
  const values = [...merged.values()];
  for (let i = 0; i < values.length; i += 250)
    await rest(
      "/profit_sheet_meta_entities?on_conflict=store_id,account_id,kind,entity_id",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(
          values.slice(i, i + 250).map((entity) => ({
            store_id: storeId,
            account_id: account.adAccountId,
            kind: entity.kind,
            entity_id: entity.id,
            entity,
          })),
        ),
      },
    );
  await rest("/profit_sheet_meta_catalogs?on_conflict=store_id,account_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      store_id: storeId,
      account_id: account.adAccountId,
      synced_at: new Date().toISOString(),
    }),
  });
  return values;
}
export async function loadOrderEvidence(
  storeId: string,
  orders: OrderInput[],
  deadline: number,
) {
  const evidence = new Map<string, Evidence>();
  const visit =
    "occurredAt source referrerUrl utmParameters { source medium campaign content term }";
  for (let i = 0; i < orders.length; i += 25) {
    if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
    const batch = orders.slice(i, i + 25);
    const result = await shopifyGraphQL<{
      nodes: Array<{
        id: string;
        createdAt: string;
        customAttributes: Array<{ key: string; value: string }>;
        customerJourneySummary: Journey | null;
      } | null>;
    }>(
      storeId,
      `query OrderEvidence($ids: [ID!]!) { nodes(ids: $ids) { ... on Order { id createdAt customAttributes { key value } customerJourneySummary { ready firstVisit { ${visit} } lastVisit { ${visit} } } } } }`,
      { ids: batch.map((o) => `gid://shopify/Order/${o.id}`) },
    );
    for (const node of result.nodes) {
      if (!node) throw new Error("Shopify attribution order is unavailable");
      evidence.set(node.id.split("/").at(-1)!, {
        createdAt: node.createdAt,
        journey: node.customerJourneySummary,
        ug:
          node.customAttributes.find((a) => a.key === "_ug_utm")?.value || null,
      });
    }
  }
  if (evidence.size !== orders.length)
    throw new Error("Incomplete Shopify attribution evidence");
  return evidence;
}
