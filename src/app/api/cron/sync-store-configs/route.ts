import { NextRequest, NextResponse } from 'next/server';
import {
  rest,
  isSupabasePersistenceEnabled,
  listPersistentStores,
} from '@/app/api/lib/supabase-persistence';
import { getShopifyToken } from '@/app/api/lib/tokens';
import { detectAndSaveStoreConfig, handleShopConfigChange } from '@/lib/onboarding/stages/detectStoreConfig';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2024-01';

/**
 * GET /api/cron/sync-store-configs
 *
 * Daily safety net — catches any config drift not caught by the shop/update webhook.
 * Compares Shopify's current shop data against our stored config and applies changes.
 */
export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  const stores = await listPersistentStores();
  const results: Array<{ storeId: string; action: string; error?: string }> = [];

  for (const store of stores) {
    try {
      const token = await getShopifyToken(store.id);
      if (!token?.accessToken || !token?.shopDomain) {
        results.push({ storeId: store.id, action: 'skipped', error: 'no_shopify_connection' });
        continue;
      }

      // Fetch fresh shop data from Shopify
      const response = await fetch(
        `https://${token.shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
        { headers: { 'X-Shopify-Access-Token': token.accessToken, 'Content-Type': 'application/json' } },
      );

      if (!response.ok) {
        results.push({ storeId: store.id, action: 'error', error: `Shopify ${response.status}` });
        continue;
      }

      const { shop } = await response.json();

      // Check if config exists
      const stored = await rest<Array<{ currency: string; iana_timezone: string; taxes_included: boolean; config_version: number }>>(
        `/store_config?store_id=eq.${encodeURIComponent(store.id)}&select=currency,iana_timezone,taxes_included,config_version&limit=1`,
      ).catch(() => []);

      if (stored.length === 0) {
        // Config never saved — do full detection
        await detectAndSaveStoreConfig(store.id, token.accessToken, token.shopDomain);
        results.push({ storeId: store.id, action: 'created' });
        continue;
      }

      const current = stored[0];
      const drifted =
        current.currency !== shop.currency ||
        current.iana_timezone !== shop.iana_timezone ||
        current.taxes_included !== shop.taxes_included;

      if (drifted) {
        await handleShopConfigChange(store.id, shop);
        results.push({ storeId: store.id, action: 'updated' });
      } else {
        // Just update synced_at
        await rest(`/store_config?store_id=eq.${encodeURIComponent(store.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ config_synced_at: new Date().toISOString() }),
        }).catch(() => null);
        results.push({ storeId: store.id, action: 'verified' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      results.push({ storeId: store.id, action: 'error', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    cron: 'sync-store-configs',
    runAt: new Date().toISOString(),
    results,
  });
}
