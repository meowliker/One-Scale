import { NextRequest, NextResponse } from 'next/server';
import { createOAuthState, getAppCredentials } from '@/app/api/lib/db';
import { getAppUrl } from '@/app/api/lib/url';

const DEFAULT_META_SCOPES = [
  'ads_management',
  'ads_read',
  'read_insights',
  'business_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
  'instagram_basic',
  'instagram_manage_insights',
].join(',');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  // Derive the external-facing URL (handles ngrok, proxies, etc.)
  const appUrl = getAppUrl(request);

  // Read credentials from DB first, fallback to env
  const dbCreds = getAppCredentials('meta');
  const appId = dbCreds?.app_id || process.env.META_APP_ID;

  if (!appId) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=meta&status=error&message=${encodeURIComponent('Meta app credentials not configured. Go to Settings → API Credentials to set them up.')}`
    );
  }

  // Always build redirect URI dynamically from the current host
  const redirectUri = `${appUrl}/api/auth/meta/callback`;

  // Create a random state token in DB for CSRF protection
  const state = createOAuthState({ storeId, platform: 'meta' });

  const scopes = dbCreds?.scopes || process.env.META_SCOPES || DEFAULT_META_SCOPES;
  const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('response_type', 'code');

  return NextResponse.redirect(authUrl.toString());
}
