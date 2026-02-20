import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { consumeOAuthState, getAppCredentials } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  getPersistentAppCredentials,
} from '@/app/api/lib/supabase-persistence';
import { setShopifyToken } from '@/app/api/lib/tokens';
import { getAppUrl } from '@/app/api/lib/url';
import type { ShopifyTokenPayload } from '@/types/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  // Derive external-facing URL (handles ngrok, proxies, etc.)
  const appUrl = getAppUrl(request);

  if (!code || !shop || !state || !hmac) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=shopify&status=error&message=missing_params`
    );
  }

  try {
    // Read credentials from DB first, fallback to env
    const dbCreds = isSupabasePersistenceEnabled()
      ? await getPersistentAppCredentials('shopify')
      : getAppCredentials('shopify');
    const apiSecret = dbCreds?.app_secret || process.env.SHOPIFY_API_SECRET!;
    const apiKey = dbCreds?.app_id || process.env.SHOPIFY_API_KEY!;

    // Validate HMAC
    const queryParams = new URLSearchParams(searchParams.toString());
    queryParams.delete('hmac');
    queryParams.delete('signature');

    const sortedParams = Array.from(queryParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    const computedHmac = createHmac('sha256', apiSecret)
      .update(sortedParams)
      .digest('hex');

    if (computedHmac !== hmac) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=shopify&status=error&message=invalid_hmac`
      );
    }

    // Validate and consume the state token from DB
    const oauthState = consumeOAuthState(state);
    if (!oauthState) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=shopify&status=error&message=invalid_state`
      );
    }

    const storeId = oauthState.store_id;

    // Exchange code for permanent access token
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errBody}`);
    }

    const tokenData: ShopifyTokenPayload = await tokenResponse.json();

    // Store token in database
    await setShopifyToken(storeId, {
      accessToken: tokenData.access_token,
      platform: 'shopify',
      storeId,
      shopDomain: shop,
    });

    // Redirect to popup callback page (closes popup and notifies parent)
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=shopify&status=connected`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=shopify&status=error&message=${encodeURIComponent(message)}`
    );
  }
}
