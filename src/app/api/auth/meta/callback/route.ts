import { NextRequest, NextResponse } from 'next/server';
import { consumeOAuthState, getAppCredentials } from '@/app/api/lib/db';
import { setMetaToken } from '@/app/api/lib/tokens';
import { getAppUrl } from '@/app/api/lib/url';
import type { MetaTokenPayload } from '@/types/auth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Derive external-facing URL (handles ngrok, proxies, etc.)
  const appUrl = getAppUrl(request);

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=meta&status=error&message=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=meta&status=error&message=missing_params`
    );
  }

  try {
    // Validate and consume the state token from DB
    const oauthState = consumeOAuthState(state);
    if (!oauthState) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=meta&status=error&message=invalid_state`
      );
    }

    const storeId = oauthState.store_id;

    // Read credentials from DB first, fallback to env
    const dbCreds = getAppCredentials('meta');
    const appId = dbCreds?.app_id || process.env.META_APP_ID!;
    const appSecret = dbCreds?.app_secret || process.env.META_APP_SECRET!;
    // Build redirect URI dynamically — must match what was sent
    // in the initial OAuth request (/api/auth/meta/route.ts)
    const redirectUri = `${appUrl}/api/auth/meta/callback`;

    // Exchange code for short-lived token
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', appId);
    tokenUrl.searchParams.set('client_secret', appSecret);
    tokenUrl.searchParams.set('redirect_uri', redirectUri);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errBody}`);
    }
    const shortLivedToken: MetaTokenPayload = await tokenResponse.json();

    // Exchange short-lived for long-lived token (60 days)
    const longLivedUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken.access_token);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    if (!longLivedResponse.ok) {
      const errBody = await longLivedResponse.text();
      throw new Error(`Long-lived token exchange failed: ${errBody}`);
    }
    const longLivedToken: MetaTokenPayload = await longLivedResponse.json();

    // Store token in database
    setMetaToken(storeId, {
      accessToken: longLivedToken.access_token,
      platform: 'meta',
      storeId,
      expiresAt: Date.now() + longLivedToken.expires_in * 1000,
    });

    // Redirect to popup callback page (closes popup and notifies parent)
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=meta&status=connected`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=meta&status=error&message=${encodeURIComponent(message)}`
    );
  }
}
