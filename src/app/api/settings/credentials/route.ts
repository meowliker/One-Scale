import { NextRequest, NextResponse } from 'next/server';
import {
  getAllAppCredentials,
  upsertAppCredentials,
  deleteAppCredentials,
} from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  getAllPersistentAppCredentials,
  upsertPersistentAppCredentials,
  deletePersistentAppCredentials,
} from '@/app/api/lib/supabase-persistence';
import { readSessionFromRequest } from '@/lib/auth/request-session';

// GET — return saved credentials (mask secrets)
export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  const workspaceId = session.workspaceId;

  const creds = isSupabasePersistenceEnabled()
    ? await getAllPersistentAppCredentials(workspaceId)
    : getAllAppCredentials(workspaceId);

  return NextResponse.json({
    meta: creds.meta
      ? {
          appId: creds.meta.app_id,
          appSecret: maskSecret(creds.meta.app_secret),
          redirectUri: creds.meta.redirect_uri,
          configured: true,
          updatedAt: creds.meta.updated_at,
        }
      : { appId: '', appSecret: '', redirectUri: '', configured: false },
    shopify: creds.shopify
      ? {
          appId: creds.shopify.app_id,
          appSecret: maskSecret(creds.shopify.app_secret),
          redirectUri: creds.shopify.redirect_uri,
          scopes: creds.shopify.scopes || 'read_orders,read_products,read_customers',
          configured: true,
          updatedAt: creds.shopify.updated_at,
        }
      : { appId: '', appSecret: '', redirectUri: '', scopes: 'read_orders,read_products,read_customers', configured: false },
    google_drive: creds.google_drive
      ? {
          appId: creds.google_drive.app_id,
          appSecret: maskSecret(creds.google_drive.app_secret),
          redirectUri: creds.google_drive.redirect_uri,
          configured: true,
          updatedAt: creds.google_drive.updated_at,
        }
      : { appId: '', appSecret: '', redirectUri: '', configured: false },
  });
}

// POST — save credentials for a platform
export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    const workspaceId = session.workspaceId;

    const body = await request.json();
    const { platform, appId, appSecret, redirectUri, scopes } = body as {
      platform: 'meta' | 'shopify' | 'google_drive';
      appId: string;
      appSecret: string;
      redirectUri: string;
      scopes?: string;
    };

    if (!platform || !appId || !appSecret || !redirectUri) {
      return NextResponse.json(
        { error: 'platform, appId, appSecret, and redirectUri are required' },
        { status: 400 }
      );
    }

    if (platform !== 'meta' && platform !== 'shopify' && platform !== 'google_drive') {
      return NextResponse.json(
        { error: 'platform must be "meta", "shopify", or "google_drive"' },
        { status: 400 }
      );
    }

    if (isSupabasePersistenceEnabled()) {
      await upsertPersistentAppCredentials({ platform, appId, appSecret, redirectUri, scopes, workspaceId });
    } else {
      upsertAppCredentials({ platform, appId, appSecret, redirectUri, scopes, workspaceId });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[credentials POST] Failed to save:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to save credentials: ${message}` },
      { status: 500 }
    );
  }
}

// DELETE — remove credentials for a platform
export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    const workspaceId = session.workspaceId;

    const body = await request.json();
    const { platform } = body as { platform: 'meta' | 'shopify' | 'google_drive' };

    if (!platform || (platform !== 'meta' && platform !== 'shopify' && platform !== 'google_drive')) {
      return NextResponse.json(
        { error: 'platform must be "meta", "shopify", or "google_drive"' },
        { status: 400 }
      );
    }

    if (isSupabasePersistenceEnabled()) {
      await deletePersistentAppCredentials(platform, workspaceId);
    } else {
      deleteAppCredentials(platform, workspaceId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[credentials DELETE] Failed to delete:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to delete credentials: ${message}` },
      { status: 500 }
    );
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••••••';
  return secret.slice(0, 4) + '••••••••' + secret.slice(-4);
}
