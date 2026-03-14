import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { consumeOAuthState, getAppCredentials } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  rest,
  getPersistentAppCredentials,
  consumePersistentOAuthState,
} from '@/app/api/lib/supabase-persistence';
import { setShopifyToken } from '@/app/api/lib/tokens';
import { getAppUrl } from '@/app/api/lib/url';
import type { ShopifyTokenPayload } from '@/types/auth';

const SHOPIFY_API_VERSION = '2024-01';

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
    // Consume the OAuth state first to get workspace_id for credential lookup
    const sb = isSupabasePersistenceEnabled();
    const oauthState = sb
      ? await consumePersistentOAuthState(state)
      : consumeOAuthState(state);
    if (!oauthState) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=shopify&status=error&message=invalid_state`
      );
    }

    const storeId = oauthState.store_id;
    const workspaceId = oauthState.workspace_id || undefined;

    // Read credentials from DB first, fallback to env
    const dbCreds = isSupabasePersistenceEnabled()
      ? await getPersistentAppCredentials('shopify', workspaceId)
      : getAppCredentials('shopify', workspaceId);
    // Use DB credentials atomically (both or neither) to avoid mixing sources
    const apiKey = (dbCreds?.app_id && dbCreds?.app_secret) ? dbCreds.app_id : process.env.SHOPIFY_API_KEY!;
    const apiSecret = (dbCreds?.app_id && dbCreds?.app_secret) ? dbCreds.app_secret : process.env.SHOPIFY_API_SECRET!;

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

    // ── PRISM Fast-Track: pre-fetch data BEFORE merchant sees dashboard ──
    // Runs synchronously during OAuth redirect. Fetches 30 days of orders,
    // balance transactions, classifies products, builds P&L snapshots.
    // Merchant waits 5-8 seconds here, but dashboard loads instantly after.
    if (isSupabasePersistenceEnabled()) {
      try {
        const { fastTrackOnboarding } = await import('@/lib/onboarding/orchestrator');
        const result = await fastTrackOnboarding(storeId, tokenData.access_token, shop);
        console.log(`[PRISM:OAuth] Fast-track complete: ${result.orders} orders, ${result.classified} classified, ${result.pnlDays} P&L days`);
      } catch (err) {
        console.error('[PRISM:OAuth] Fast-track failed (will retry via onboarding):', err instanceof Error ? err.message : err);
      }
    }

    // Fire-and-forget: full historical onboarding continues in background
    // Merchant already has 30 days of data — this fills the rest silently
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || appUrl;
    fetch(`${baseUrl}/api/onboarding/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
    }).catch(() => { /* resume cron will pick up stalled onboarding */ });

    // Intelligence init (fire-and-forget)
    fetch(`${baseUrl}/api/intelligence/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId }),
    }).catch(() => { /* can be initialized later */ });

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
