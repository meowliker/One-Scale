/**
 * PRISM — COGS Sync
 *
 * Reads product variant costs from Shopify and saves to pnl_product_costs.
 * Only runs for physical stores (cogs_applicable = true).
 * Digital stores skip entirely — no COGS in P&L.
 */

import { rest } from '@/app/api/lib/supabase-persistence';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';
import { getShopifyToken } from '@/app/api/lib/tokens';

const enc = (v: string) => encodeURIComponent(v);

export async function syncProductCosts(storeId: string): Promise<{
  synced: number;
  skipped: number;
  isDigital: boolean;
}> {
  // Check store type
  const config = await rest<Array<{ is_digital_store: boolean; cogs_applicable: boolean }>>(
    `/store_config?store_id=eq.${enc(storeId)}&select=is_digital_store,cogs_applicable&limit=1`
  ).catch(() => []);

  const isDigital = config[0]?.is_digital_store ?? false;
  if (isDigital || config[0]?.cogs_applicable === false) {
    console.log(`[PRISM:COGS] Digital store ${storeId} — skipping cost sync`);
    return { synced: 0, skipped: 0, isDigital: true };
  }

  // Get Shopify token
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token?.shopDomain) {
    return { synced: 0, skipped: 0, isDigital: false };
  }

  // Fetch products with variant costs
  let synced = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  try {
    const productsResponse = await fetchFromShopify(
      token.accessToken,
      token.shopDomain,
      '/admin/api/2024-01/products.json?fields=id,variants&limit=250'
    ) as { products?: Array<{ id: number | string; variants?: Array<{ id: number | string; cost?: string }> }> };

    const products = productsResponse?.products ?? [];

    for (const product of products) {
      for (const variant of product.variants ?? []) {
        const cost = parseFloat(variant.cost || '0');
        if (cost > 0) {
          await rest(
            '/pnl_product_costs?on_conflict=store_id,product_id',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
              body: JSON.stringify({
                store_id: storeId,
                product_id: String(product.id),
                cost_type: 'fixed',
                cost_per_unit: cost,
                source: 'shopify_variant_cost',
                variant_id: String(variant.id),
                updated_at: now,
              }),
            }
          ).catch(() => null);
          synced++;
        } else {
          skipped++;
        }
      }
    }
  } catch (err) {
    console.warn(`[PRISM:COGS] Error syncing costs for ${storeId}:`, err instanceof Error ? err.message : 'Unknown');
  }

  console.log(`[PRISM:COGS] ${storeId}: ${synced} costs synced, ${skipped} skipped (no cost data)`);
  return { synced, skipped, isDigital: false };
}
