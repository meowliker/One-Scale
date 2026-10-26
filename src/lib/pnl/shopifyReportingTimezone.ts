import { rest } from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { fetchFromShopify } from '@/app/api/lib/shopify-client';

// Shopify sales must be bucketed in the shop's calendar day, never the ad
// account's timezone or a guessed default. Verify before writing any reports.
export async function syncShopifyReportingTimezone(storeId: string): Promise<string> {
  const token = await getShopifyToken(storeId);
  if (!token?.accessToken || !token.shopDomain) throw new Error('No Shopify connection');
  const { shop } = await fetchFromShopify<{ shop?: { iana_timezone?: string; currency?: string } }>(
    token.accessToken, token.shopDomain, '/shop.json',
  );
  const timezone = shop?.iana_timezone;
  if (!timezone) throw new Error('Shopify did not return a store timezone. Reports were not rebuilt. Please retry.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); }
  catch { throw new Error('Shopify returned an invalid store timezone. Reports were not rebuilt.'); }

  const existing = await rest<Array<{ store_id: string }>>(
    `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=store_id&limit=1`,
  );
  if (existing.length) {
    // Preserve currency preferences, product settings, costs and saved reports.
    await rest(`/store_config?store_id=eq.${encodeURIComponent(storeId)}`, {
      method: 'PATCH', body: JSON.stringify({ iana_timezone: timezone }),
    });
  } else {
    if (!shop?.currency || !/^[A-Z]{3}$/.test(shop.currency)) throw new Error('Shopify did not return a valid store currency. Please retry.');
    await rest('/store_config?on_conflict=store_id', {
      method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ store_id: storeId, shopify_domain: token.shopDomain,
        iana_timezone: timezone, currency: shop.currency, reporting_currency: shop.currency }),
    });
  }
  return timezone;
}
