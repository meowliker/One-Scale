import { NextRequest, NextResponse } from 'next/server';
import { createOAuthState, getAppCredentials } from '@/app/api/lib/db';
import { getAppUrl } from '@/app/api/lib/url';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const shop = searchParams.get('shop');

  if (!storeId || !shop) {
    return NextResponse.json(
      { error: 'storeId and shop are required' },
      { status: 400 }
    );
  }

  // Derive external-facing URL (handles ngrok, proxies, etc.)
  const appUrl = getAppUrl(request);

  // Read credentials from DB first, fallback to env
  const dbCreds = getAppCredentials('shopify');
  const apiKey = dbCreds?.app_id || process.env.SHOPIFY_API_KEY;
  const scopes = dbCreds?.scopes || process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers';

  if (!apiKey) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=shopify&status=error&message=${encodeURIComponent('Shopify app credentials not configured. Go to Settings → API Credentials to set them up.')}`
    );
  }

  // Always build redirect URI dynamically from the current host
  const redirectUri = `${appUrl}/api/auth/shopify/callback`;

  // Create a random state token in DB for CSRF protection
  const state = createOAuthState({ storeId, platform: 'shopify', shopDomain: shop });

  // Clean shop domain (ensure no protocol)
  const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const authUrl = new URL(`https://${cleanShop}/admin/oauth/authorize`);
  authUrl.searchParams.set('client_id', apiKey);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl.toString());
}
