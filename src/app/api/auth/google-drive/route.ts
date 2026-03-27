import { NextRequest, NextResponse } from 'next/server';
import { createOAuthState } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  createPersistentOAuthState,
  getAllPersistentAppCredentials,
} from '@/app/api/lib/supabase-persistence';
import { getAllAppCredentials } from '@/app/api/lib/db';
import { getAppUrl } from '@/app/api/lib/url';
import { readSessionFromRequest } from '@/lib/auth/request-session';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  const appUrl = getAppUrl(request);

  if (!storeId) {
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent('storeId is required')}`
    );
  }

  try {
    // Read Client ID from saved app credentials (set in Settings → API Credentials)
    const session = await readSessionFromRequest(request);
    const workspaceId = session?.workspaceId;

    const creds = isSupabasePersistenceEnabled()
      ? await getAllPersistentAppCredentials(workspaceId)
      : getAllAppCredentials(workspaceId);

    const googleCreds = creds.google_drive;

    if (!googleCreds?.app_id || !googleCreds?.app_secret) {
      return NextResponse.redirect(
        `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent('Google Drive credentials not configured. Please add your Client ID and Client Secret in Settings → API Credentials first.')}`
      );
    }

    const clientId = googleCreds.app_id;
    const redirectUri = googleCreds.redirect_uri || `${appUrl}/api/auth/google-drive/callback`;

    // Create CSRF state token
    const sb = isSupabasePersistenceEnabled();
    const state = sb
      ? await createPersistentOAuthState({ storeId, platform: 'google_drive' })
      : createOAuthState({ storeId, platform: 'google_drive' });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_DRIVE_SCOPE);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);

    return NextResponse.redirect(authUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error during Google Drive OAuth initiation';
    return NextResponse.redirect(
      `${appUrl}/auth/callback?platform=google_drive&status=error&message=${encodeURIComponent(message)}`
    );
  }
}
