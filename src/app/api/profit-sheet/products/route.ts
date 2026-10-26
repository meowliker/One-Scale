import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import {
  sheetAccess,
  sheetJson,
  safeSheetError,
} from "@/app/api/lib/profit-sheet-access";
import {
  loadConfig,
  publicConfig,
  saveConfig,
} from "@/app/api/lib/profit-sheet-repository";
import { validateProducts, type SheetProduct } from "@/lib/profit-sheet/model";
import { getShopifyToken } from "@/app/api/lib/tokens";
import { fetchFromShopify } from "@/app/api/lib/shopify-client";
import { fetchFromMeta } from "@/app/api/lib/meta-client";
export const maxDuration = 60;
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = typeof body?.storeId === "string" ? body.storeId : "";
  const denied = await sheetAccess(req, id, true);
  if (denied) return denied;
  try {
    if (!Array.isArray(body.products) || body.products.length > 30)
      return sheetJson({ error: "Add up to 30 product tabs." }, 400);
    const config = await loadConfig(id);
    if (body.version !== config.version)
      return sheetJson({ error: "Settings changed. Reload and retry." }, 409);
    const products: SheetProduct[] = [];
    const token = await getShopifyToken(id);
    if (!token?.shopDomain)
      return sheetJson(
        { error: "Connect Shopify before adding product links." },
        409,
      );
    for (const input of body.products) {
      if (
        !input ||
        typeof input.name !== "string" ||
        !Array.isArray(input.links) ||
        input.links.length < 1 ||
        input.links.length > 20 ||
        !Array.isArray(input.assignments)
      )
        return sheetJson(
          {
            error:
              "Each product needs a name, 1–20 links, and account assignments.",
          },
          400,
        );
      input.links = input.links
        .map((link: unknown) => (typeof link === "string" ? link.trim() : ""))
        .filter(Boolean);
      if (!input.links.length)
        return sheetJson({ error: "Add at least one product link." }, 400);
      const previous = config.products.find((p) => p.id === input.id);
      if (input.startDate != null && typeof input.startDate !== "string")
        return sheetJson({ error: "Choose a valid product start date." }, 400);
      const ids = new Set<string>();
      if (
        previous &&
        JSON.stringify(previous.links) === JSON.stringify(input.links)
      )
        previous.shopifyIds.forEach((v) => ids.add(v));
      else
        for (const link of input.links) {
          let handle: string;
          try {
            const url = new URL(link);
            if (!["http:", "https:"].includes(url.protocol)) throw new Error();
            handle = decodeURIComponent(
              url.pathname.match(/\/products\/([^/]+)/)?.[1] || "",
            );
            if (!handle) throw new Error();
          } catch {
            return sheetJson(
              {
                error:
                  "Use Shopify product URLs containing /products/product-handle. Multiple URLs can map to one tab.",
              },
              400,
            );
          }
          const result = await fetchFromShopify<{
            products: Array<{ id: number; handle: string }>;
          }>(token.accessToken, token.shopDomain, "/products.json", {
            handle,
            fields: "id,handle",
            limit: "250",
          });
          const match = result.products.find((p) => p.handle === handle);
          if (!match)
            return sheetJson(
              {
                error: `No Shopify product matching “${handle}” was found in this store.`,
              },
              400,
            );
          ids.add(String(match.id));
        }
      for (const a of input.assignments) {
        if (
          !a ||
          typeof a.accountId !== "string" ||
          !Array.isArray(a.campaignIds) ||
          a.campaignIds.length > 10000 ||
          a.campaignIds.some((c: unknown) => typeof c !== "string")
        )
          return sheetJson({ error: "Invalid campaign assignment." }, 400);
      }
      // Client edits may remove verified ad mappings, but cannot invent ad IDs or dates.
      const assignments = input.assignments.map(
        (a: SheetProduct["assignments"][number]) => {
          const old = previous?.assignments.find(
            (b) => b.accountId === a.accountId,
          );
          if (
            a.mode === "ads" &&
            (!Array.isArray(a.adLinks) ||
              a.adLinks.some(
                (l) =>
                  !old?.adLinks?.some(
                    (o) => JSON.stringify(o) === JSON.stringify(l),
                  ),
              ))
          )
            throw new Error("Invalid automatic ad mapping");
          return {
            accountId: a.accountId,
            campaignIds: a.campaignIds,
            ...(a.mode ? { mode: a.mode } : {}),
            ...(Array.isArray(a.excludedCampaignIds)
              ? { excludedCampaignIds: a.excludedCampaignIds }
              : {}),
            ...(a.mode === "ads" ? { adLinks: a.adLinks } : {}),
          };
        },
      );
      products.push({
        id: previous?.id || randomUUID(),
        name: input.name.trim(),
        links: input.links,
        shopifyIds: [...ids],
        startDate:
          input.startDate === undefined
            ? previous?.startDate || null
            : input.startDate || null,
        source: input.source === "auto" ? "auto" : "manual",
        manualOverride:
          input.source !== "auto" || input.manualOverride !== false,
        ...(previous?.discovery ? { discovery: previous.discovery } : {}),
        assignments,
      });
    }
    try {
      validateProducts(products, config.accounts);
    } catch (error) {
      return sheetJson(
        {
          error:
            error instanceof Error ? error.message : "Invalid product mapping.",
        },
        400,
      );
    }
    // Verify selected campaign IDs against the assigned account, not a browser-supplied name.
    for (const product of products)
      for (const assignment of product.assignments) {
        const previous = config.products
          .find((p) => p.id === product.id)
          ?.assignments.find((a) => a.accountId === assignment.accountId);
        const added = assignment.campaignIds.filter(
          (c) => !previous?.campaignIds.includes(c),
        );
        if (!added.length) continue;
        const account = config.accounts.find(
          (a) => a.adAccountId === assignment.accountId,
        )!;
        // Bulk selection can include more IDs than one Meta request supports.
        for (let offset = 0; offset < added.length; offset += 200) {
          const batch = added.slice(offset, offset + 200);
          const result = await fetchFromMeta<{ data: Array<{ id: string }> }>(
            account.accessToken,
            `/${account.adAccountId}/campaigns`,
            {
              fields: "id",
              filtering: JSON.stringify([
                { field: "id", operator: "IN", value: batch },
              ]),
              limit: "250",
            },
            10000,
            0,
          );
          if (batch.some((c) => !result.data.some((r) => r.id === c)))
            return sheetJson(
              {
                error:
                  "A selected campaign does not belong to its assigned ad account. Reload campaigns.",
              },
              400,
            );
        }
      }
    await saveConfig(id, config, { products });
    return sheetJson(publicConfig(await loadConfig(id)));
  } catch (error) {
    return sheetJson({ error: safeSheetError(error) }, 502);
  }
}
