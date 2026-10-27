import { MetaRateLimitError } from "./meta-client";
import { loadExclusions } from "./profit-sheet-exclusions";
import { randomUUID } from "crypto";
import { rest } from "./supabase-persistence";
import { loadConfig } from "./profit-sheet-repository";
import { getShopifyToken } from "./tokens";
import { fetchFromShopify } from "./shopify-client";
import { shopifyGraphQL } from "./shopify-graphql";
import { encryptSecret } from "./crypto";
import { safeSheetError } from "./profit-sheet-access";
import {
  recentCreatives,
} from "./profit-sheet-meta-discovery";
import { addDays } from "@/lib/profit-sheet";
import {
  dayWindow,
  reportingDay,
  validateProducts,
  type SheetProduct,
} from "@/lib/profit-sheet/model";
import {
  creativeLinks,
  creativeOwner,
  productHandle,
  assignmentMatches,
  landingPurchaseProduct,
  type DiscoveryOrder,
  type DiscoveryFinding,
} from "@/lib/profit-sheet/discovery";
type Job = { store_id: string; lease: string; run_day: string; attempts?: number };
type Product = {
  id: number | string;
  handle: string;
  title: string;
  status: string;
};
const check = (deadline: number) => {
  if (Date.now() > deadline) throw new Error("Sync time budget exceeded");
};
async function restPages<T extends { id: string | number }>(
  token: string,
  domain: string,
  endpoint: string,
  key: string,
  params: Record<string, string>,
  deadline: number,
) {
  const all: T[] = [];
  let since: string | undefined;
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    check(deadline);
    const r = await fetchFromShopify<Record<string, T[]>>(
      token,
      domain,
      endpoint,
      { ...params, limit: "250", ...(since ? { since_id: since } : {}) },
    );
    const page = r[key];
    if (!Array.isArray(page)) throw new Error("Missing Shopify records");
    for (const x of page) {
      if (seen.has(String(x.id)))
        throw new Error("Incomplete Shopify pagination");
      seen.add(String(x.id));
      all.push(x);
    }
    if (page.length < 250) return all;
    since = String(page.at(-1)!.id);
  }
  throw new Error("Shopify pagination limit exceeded");
}
export async function runDiscovery(job: Job) {
  const storeId = job.store_id,
    deadline = Date.now() + 230000;
  try {
    const config = await loadConfig(storeId);
    const token = await getShopifyToken(storeId);
    if (!token?.shopDomain) throw new Error("Missing Shopify connection");
    const day = job.run_day,
      from = addDays(day, -5),
      to = addDays(day, -1);
    const warnings: string[] = [],
      findings: DiscoveryFinding[] = [];
    const { shop } = await fetchFromShopify<{
      shop: { domain: string; myshopify_domain: string };
    }>(token.accessToken, token.shopDomain, "/shop.json", {
      fields: "domain,myshopify_domain",
    });
    const domains = new Set(
      [shop.domain, shop.myshopify_domain, token.shopDomain]
        .filter(Boolean)
        .map((d) => d.toLowerCase().replace(/^www\./, "")),
    );
    const [catalog, orders, excluded] = await Promise.all([
      restPages<Product>(
        token.accessToken,
        token.shopDomain,
        "/products.json",
        "products",
        { fields: "id,handle,title,status" },
        deadline,
      ),
      restPages<DiscoveryOrder>(
        token.accessToken,
        token.shopDomain,
        "/orders.json",
        "orders",
        {
          status: "any",
          created_at_min: dayWindow(from).start,
          created_at_max: new Date(
            Date.parse(dayWindow(day).start) - 1,
          ).toISOString(),
          fields: "id,test,cancelled_at,financial_status,landing_site,line_items",
        },
        deadline,
      ),
      loadExclusions(storeId),
    ]);
    const excludedKeys = new Set(excluded.map((x) => x.key));
    const sales = new Map<string, number>();
    const landingSales = new Map<string, number>();
    for (const order of orders) {
      const id = landingPurchaseProduct(order, catalog, domains);
      if (id) landingSales.set(id, (landingSales.get(id) || 0) + 1);
    }
    for (const o of orders)
      if (
        !o.test &&
        ["paid", "partially_paid", "partially_refunded", "refunded"].includes(
          o.financial_status,
        )
      )
        for (const id of new Set(o.line_items.map((l) => String(l.product_id))))
          sales.set(id, (sales.get(id) || 0) + 1);
    const activity = new Map<
      string,
      { sessions: number; days: Set<string>; links: Set<string> }
    >();
    let analyticsComplete = true;
    try {
      let complete = false;
      for (let page = 0; page < 100; page++) {
        check(deadline);
        // UTC-6 midnight is exactly 11:30 IST year-round; no DST or half-hour rounding.
        const query = `FROM sessions SHOW sessions GROUP BY landing_page_path, day WITH TIMEZONE 'Etc/GMT+6' SINCE ${from} UNTIL ${to} ORDER BY landing_page_path, day LIMIT 1000 OFFSET ${page * 1000}`;
        const r = await shopifyGraphQL<{
          shopifyqlQuery: {
            parseErrors: string[];
            tableData: {
              rows: Array<{
                landing_page_path: string;
                day: string;
                sessions: string;
              }>;
            } | null;
          };
        }>(
          storeId,
          "query Activity($query:String!){shopifyqlQuery(query:$query){parseErrors tableData{rows}}}",
          { query },
        );
        if (r.shopifyqlQuery.parseErrors.length || !r.shopifyqlQuery.tableData)
          throw new Error("Shopify analytics query unavailable");
        const rows = r.shopifyqlQuery.tableData.rows;
        for (const row of rows) {
          const handle = productHandle(row.landing_page_path);
          if (!handle || Number(row.sessions) <= 0) continue;
          const item = activity.get(handle) || {
            sessions: 0,
            days: new Set<string>(),
            links: new Set<string>(),
          };
          item.sessions += Number(row.sessions);
          item.days.add(row.day);
          item.links.add(`https://${shop.domain}${row.landing_page_path}`);
          activity.set(handle, item);
        }
        if (rows.length < 1000) {
          complete = true;
          break;
        }
      }
      if (!complete) throw new Error("Analytics pagination limit exceeded");
    } catch {
      analyticsComplete = false;
      activity.clear();
      warnings.push(
        "Shopify landing-page analytics could not be read. Check read_reports and analytics access. Existing products remain saved; no products were automatically activated from incomplete sessions.",
      );
    }
    const products: SheetProduct[] = structuredClone(config.products);
    for (const p of catalog) {
      const id = String(p.id),
        a = activity.get(p.handle);
      if (!a) continue;
      const sold = sales.get(id) || 0,
        landingSold = landingSales.get(id) || 0,
        existing = products.find((x) => x.shopifyIds.includes(id)),
        blocked = excludedKeys.has(`product:${id}`);
      const qualifies =
        analyticsComplete &&
        a.days.size >= 3 &&
        landingSold > 0 &&
        p.status === "active";
      findings.push({
        key: `product:${id}`,
        kind: "product",
        productId: id,
        title: p.title,
        status: blocked ? "excluded" : qualifies ? "active" : "candidate",
        sessions: a.sessions,
        activeDays: a.days.size,
        sales: sold,
        landingSales: landingSold,
        links: [...a.links],
        detail: blocked
          ? "Unlinked by you; automatic discovery will not add it again."
          : `${a.sessions} sessions on ${a.days.size}/5 reporting days; ${sold} orders containing this product; ${landingSold} paid orders landed on this product and purchased it.${!landingSold ? " No qualifying landing-page purchase evidence; upsell/order-line sales alone do not activate a product." : ""}`,
      });
      if (blocked) continue;
      if (existing) {
        if (existing.source === "auto" && !existing.manualOverride)
          existing.discovery = {
            sessions: a.sessions,
            activeDays: a.days.size,
            sales: sold,
            checkedAt: new Date().toISOString(),
          };
        continue;
      }
      if (qualifies && products.length < 30)
        products.push({
          id: randomUUID(),
          source: "auto",
          manualOverride: false,
          name: p.title,
          links: [...a.links],
          shopifyIds: [id],
          startDate: day,
          assignments: [],
          discovery: {
            sessions: a.sessions,
            activeDays: a.days.size,
            sales: sold,
            checkedAt: new Date().toISOString(),
          },
        });
    }
    let metaComplete = true;
    let retryAt = 0;
    for (const account of config.accounts) {
      check(deadline);
      try {
        const ads = await recentCreatives(
          account.accessToken,
          account.adAccountId,
          addDays(from, -1),
          day,
          deadline,
          storeId,
        );
        const proposed = new Map<
          string,
          Array<{ adId: string; campaignId: string; from: string; to?: string }>
        >();
        for (const ad of ads) {
          const links = creativeLinks(ad.creative || {});
          if (!links.length) links.push(...(ad.destinationLinks || []));
          const owner = creativeOwner(links, products, catalog, domains);
          // Close mappings only after a complete scan, and never manufacture an
          // inverted interval when a creative changes twice on the same day.
          for (const product of products)
            if (product.source === "auto" && !product.manualOverride) {
              const assignment = product.assignments.find(a => a.accountId === account.adAccountId);
              if (assignment?.adLinks) assignment.adLinks = assignment.adLinks.flatMap(link => {
                if (link.adId !== ad.id || link.to || !links.length || owner?.id === product.id) return [link];
                return link.from >= day ? [] : [{ ...link, to: addDays(day, -1) }];
              });
            }
          const relevant = links.some((l) => {
            try {
              return domains.has(new URL(l).hostname.replace(/^www\./, ""));
            } catch {
              return false;
            }
          });
          if (!owner) {
            if (relevant || !links.length)
              findings.push({
                key: `ad:${account.adAccountId}:${ad.id}`,
                kind: "ad",
                status: "review",
                title: ad.name,
                links,
                accountId: account.adAccountId,
                campaignId: ad.campaign_id,
                adId: ad.id,
                detail: !links.length
                  ? "Meta did not expose a destination URL. Existing-post ads may require Page read permission; catalog ads may have dynamic destinations. Keep a manual mapping or reconnect with the necessary permission. No automatic spend allocation."
                  : "Destination is shared, unrecognized, or not a qualifying product. No automatic spend allocation.",
              });
            continue;
          }
          if (owner.source !== "auto" || owner.manualOverride) {
            if (!owner.assignments.some(a => assignmentMatches(a, { accountId: account.adAccountId, campaignId: ad.campaign_id, adId: ad.id }, day)))
              findings.push({ key: `ad:${account.adAccountId}:${ad.id}`, kind: "ad", status: "review", title: ad.name,
                links, accountId: account.adAccountId, campaignId: ad.campaign_id, adId: ad.id,
                detail: `Destination matches ${owner.name}, but this product uses manual selections. Enable automatic matching to include it.` });
            continue;
          }
          if (
            excludedKeys.has(`account:${owner.id}:${account.adAccountId}`) ||
            excludedKeys.has(
              `campaign:${owner.id}:${account.adAccountId}:${ad.campaign_id}`,
            )
          )
            continue;
          const conflict = products.find(
            (p) =>
              p.id !== owner.id &&
              p.assignments.some((a) =>
                assignmentMatches(
                  a,
                  {
                    accountId: account.adAccountId,
                    campaignId: ad.campaign_id,
                    adId: ad.id,
                  },
                  day,
                ),
              ),
          );
          if (conflict) {
            findings.push({
              key: `ad:${account.adAccountId}:${ad.id}`,
              kind: "ad",
              status: "review",
              title: ad.name,
              accountId: account.adAccountId,
              campaignId: ad.campaign_id,
              adId: ad.id,
              detail: `Already assigned to ${conflict.name}; kept existing mapping. Unlink it there before assigning to ${owner.name}.`,
            });
            continue;
          }
          const previous = owner.assignments
            .find((a) => a.accountId === account.adAccountId)
            ?.adLinks?.find((l) => l.adId === ad.id && !l.to);
          const list = proposed.get(owner.id) || [];
          list.push({
            adId: ad.id,
            campaignId: ad.campaign_id,
            from: previous?.from || day,
          });
          proposed.set(owner.id, list);
        }
        for (const product of products) {
          if (product.source !== "auto" || product.manualOverride) continue;
          const links = proposed.get(product.id) || [];
          const previous = product.assignments.find(
            (a) => a.accountId === account.adAccountId,
          );
          // Preserve earlier mappings and surface conflicts rather than rewrite history on URL changes.
          const merged = [
            ...new Map(
              [...(previous?.adLinks || []), ...links].map((l) => [
                `${l.adId}:${l.from}`,
                l,
              ]),
            ).values(),
          ];
          if (!merged.length) continue;
          const assignment = {
            accountId: account.adAccountId,
            mode: "ads" as const,
            campaignIds: [...new Set(merged.map((l) => l.campaignId))],
            adLinks: merged,
            excludedCampaignIds: previous?.excludedCampaignIds || [],
          };
          product.assignments = [
            ...product.assignments.filter(
              (a) => a.accountId !== account.adAccountId,
            ),
            assignment,
          ];
        }
      } catch (e) {
        metaComplete = false;
        const delay = e instanceof MetaRateLimitError ? e.retryAfterMs : Math.min(3600000, 60000 * 2 ** Math.min(job.attempts || 1, 6));
        // Retry transient failures with a durable cooldown. Authentication failures
        // need reconnection, rather than an endless background retry.
        const transient = e instanceof MetaRateLimitError || /timeout|time budget|fetch failed|network|Incomplete Meta|50[0234]|Settings changed/i.test(String(e));
        if (transient) retryAt = Math.max(retryAt, Date.now() + delay);
        warnings.push(`${account.name}: ${e instanceof MetaRateLimitError ? (e.reason === "scheduled" ? "Matching is queued while shared Meta request capacity recovers. Saved mappings remain available and matching will retry automatically." : "Meta temporarily limited requests. Saved mappings are retained; matching will retry automatically after the cooldown.") : `Creative scan incomplete. Saved mappings retained. ${safeSheetError(e)}${transient ? " Automatic retry scheduled." : ""}`}`);

      }
    }
    validateProducts(products, config.accounts);
    const changed =
      JSON.stringify(products.map((p) => ({ ...p, discovery: undefined }))) !==
      JSON.stringify(
        config.products.map((p) => ({ ...p, discovery: undefined })),
      );
    const report = {
      from,
      to,
      reportingTimezone: "Etc/GMT+6",
      checkedAt: new Date().toISOString(),
      findings,
      warnings,
      productsAdded: products.length - config.products.length,
      analyticsComplete,
      metaComplete,
      retryAt: retryAt ? new Date(retryAt).toISOString() : null,
    };
    await rest("/rpc/profit_sheet_finish_discovery", {
      method: "POST",
      body: JSON.stringify({
        p_store: storeId,
        p_lease: job.lease,
        p_version: config.version,
        p_accounts: config.accounts.map(({ accessToken, ...a }) => ({
          ...a,
          tokenCiphertext: encryptSecret(accessToken),
        })),
        p_products: changed ? products : null,
        p_report: report,
      }),
    });
    return { ok: true, ...report };
  } catch (e) {
    const error = safeSheetError(e);
    await rest(
      `/profit_sheet_discovery?store_id=eq.${encodeURIComponent(storeId)}&lease=eq.${job.lease}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: /Settings changed|time budget|timeout|fetch|network/i.test(String(e)) ? "queued" : "error",
          retry_at: /Settings changed|time budget|timeout|fetch|network/i.test(String(e)) ? new Date(Date.now() + 60000).toISOString() : null,
          lease_until: null,
          error,
          checked_at: new Date().toISOString(),
        }),
      },
    );
    return { ok: false, error };
  }
}
export async function queueDiscovery(storeId?: string) {
  await rest("/rpc/profit_sheet_queue_discovery", {
    method: "POST",
    body: JSON.stringify({ p_day: reportingDay(), p_store: storeId || null }),
  });
}
export async function processDiscovery(storeId?: string) {
  const job = (
    await rest<Job[]>("/rpc/profit_sheet_claim_discovery", {
      method: "POST",
      body: JSON.stringify({ p_store: storeId || null }),
    })
  )[0];
  return job ? runDiscovery(job) : { ok: true, idle: true };
}
