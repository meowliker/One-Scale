import { NextRequest, NextResponse } from 'next/server';
import { consumeOAuthState } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  consumePersistentOAuthState,
  getAllPersistentAppCredentials,
} from '@/app/api/lib/supabase-persistence';
import { getAllAppCredentials } from '@/app/api/lib/db';
import { setGoogleDriveToken } from '@/app/api/lib/tokens';
import { getAppUrl } from '@/app/api/lib/url';
import type { GoogleDriveTokenPayload } from '@/types/auth';

interface GoogleDriveAbout {
  user: {
    displayName: string;
    emailAddress: string;
    permissionId: string;
  };
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function resolveGoogleRedirectUri(savedRedirectUri: string | undefined, appUrl: string): string {
  const defaultRedirectUri = `${appUrl}/api/auth/google-drive/callback`;
  if (!savedRedirectUri) return defaultRedirectUri;

  const normalizedSaved = savedRedirectUri.trim();
  if (!normalizedSaved) return defaultRedirectUri;

  try {
    const saved = new URL(normalizedSaved);
    const current = new URL(appUrl);

    // Keep callback/token redirect URI aligned with the active local origin
    // when a stale localhost port was saved previously.
    if (
      isLocalHostname(saved.hostname) &&
      isLocalHostname(current.hostname) &&
      saved.host !== current.host
    ) {
      return defaultRedirectUri;
    }

    return normalizedSaved;
  } catch {
    return defaultRedirectUri;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  let appUrl: string;
  try {
    appUrl = getAppUrl(request);
  } catch {
    const reqUrl = new URL(request.url);
    appUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  }

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=error&message=missing_params`
    );
  }

  try {
    // Validate and consume the state token
    const sb = isSupabasePersistenceEnabled();
    const oauthState = sb
      ? await consumePersistentOAuthState(state)
      : consumeOAuthState(state);

    if (!oauthState) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=google_drive&status=error&message=invalid_state`
      );
    }

    const storeId = oauthState.store_id;

    // Read Client ID + Secret from saved app credentials (workspace-level, not per-store)
    // We use __global__ / workspaceId since these are app-level credentials
    const creds = sb
      ? await getAllPersistentAppCredentials()
      : getAllAppCredentials();

    const googleCreds = creds.google_drive;

    if (!googleCreds?.app_id || !googleCreds?.app_secret) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent('Google Drive credentials not configured. Please add them in Settings → API Credentials.')}`
      );
    }

    const clientId = googleCreds.app_id;
    const clientSecret = googleCreds.app_secret;
    const redirectUri = resolveGoogleRedirectUri(googleCreds.redirect_uri, appUrl);

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`Token exchange failed: ${errBody}`);
    }

    const tokenData: GoogleDriveTokenPayload = await tokenRes.json();

    // Fetch user info from Google Drive API
    const aboutRes = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    let accountName = 'Google Drive';
    let accountId = '';
    let userEmail = '';
    if (aboutRes.ok) {
      const about: GoogleDriveAbout = await aboutRes.json();
      userEmail = about.user.emailAddress || '';
      accountName = userEmail || about.user.displayName || 'Google Drive';
      accountId = about.user.permissionId || '';
    }

    // Store tokens (encrypted) — metadata stores the user email for display
    await setGoogleDriveToken(storeId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      platform: 'google_drive',
      storeId,
      accountId,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      metadata: JSON.stringify({ email: userEmail }),
    });

    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=connected&account=${encodeURIComponent(accountName)}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent(message)}`
    );
  }
}
