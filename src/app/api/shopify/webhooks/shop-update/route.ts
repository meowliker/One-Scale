import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { rest, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';
import { handleShopConfigChange, detectAndSaveStoreConfig } from '@/lib/onboarding/stages/detectStoreConfig';
import { getShopifyToken } from '@/app/api/lib/tokens';

export const dynamic = 'force-dynamic';

function verifyShopifyHmac(rawBody: string, secret: string, hmacHeader: string): boolean {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  return digest === hmacHeader;
}

/**
 * POST /api/shopify/webhooks/shop-update
 *
 * Fires when the merchant changes ANY store setting in Shopify admin.
 * Detects currency/timezone/tax changes and updates store_config in real time.
 */
export async function POST(request: Request) {
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
  const shopDomain = request.headers.get('x-shopify-shop-domain');
  const rawBody = await request.text();

  if (!hmacHeader || !shopDomain) {
    return NextResponse.json({ error: 'Missing headers' }, { status: 400 });
  }

  // Verify HMAC — try DB credentials then env
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret || !verifyShopifyHmac(rawBody, apiSecret, hmacHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabasePersistenceEnabled()) {
    return NextResponse.json({ received: true });
  }

  try {
    const shopData = JSON.parse(rawBody);

    // Find store by domain
    const stores = await rest<Array<{ store_id: string }>>(
      `/store_config?shopify_domain=eq.${encodeURIComponent(shopDomain)}&select=store_id&limit=1`,
    ).catch(() => []);

    // Also try myshopify_domain
    let storeId = stores[0]?.store_id;
    if (!storeId) {
      const byMyshopify = await rest<Array<{ store_id: string }>>(
        `/store_config?myshopify_domain=eq.${encodeURIComponent(shopDomain)}&select=store_id&limit=1`,
      ).catch(() => []);
      storeId = byMyshopify[0]?.store_id;
    }

    if (!storeId) {
      console.warn(`[shop-update] Store not found for domain ${shopDomain}`);
      return NextResponse.json({ received: true, warning: 'store_not_found' });
    }

    // Check if we have an existing config
    const existing = await rest<Array<{ store_id: string }>>(
      `/store_config?store_id=eq.${encodeURIComponent(storeId)}&select=store_id&limit=1`,
    ).catch(() => []);

    if (existing.length === 0) {
      // No config yet — do full detection
      const token = await getShopifyToken(storeId);
      if (token?.accessToken && token?.shopDomain) {
        await detectAndSaveStoreConfig(storeId, token.accessToken, token.shopDomain);
      }
    } else {
      // Diff against existing config
      await handleShopConfigChange(storeId, shopData);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('[shop-update] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ received: true, error: 'processing_failed' });
  }
}
