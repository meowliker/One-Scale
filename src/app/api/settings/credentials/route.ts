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

// GET — return saved credentials (mask secrets)
export async function GET() {
  const creds = isSupabasePersistenceEnabled()
    ? await getAllPersistentAppCredentials()
    : getAllAppCredentials();

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
  });
}

// POST — save credentials for a platform
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, appId, appSecret, redirectUri, scopes } = body as {
      platform: 'meta' | 'shopify';
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

    if (platform !== 'meta' && platform !== 'shopify') {
      return NextResponse.json(
        { error: 'platform must be "meta" or "shopify"' },
        { status: 400 }
      );
    }

    if (isSupabasePersistenceEnabled()) {
      await upsertPersistentAppCredentials({ platform, appId, appSecret, redirectUri, scopes });
    } else {
      upsertAppCredentials({ platform, appId, appSecret, redirectUri, scopes });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    );
  }
}

// DELETE — remove credentials for a platform
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform } = body as { platform: 'meta' | 'shopify' };

    if (!platform || (platform !== 'meta' && platform !== 'shopify')) {
      return NextResponse.json(
        { error: 'platform must be "meta" or "shopify"' },
        { status: 400 }
      );
    }

    if (isSupabasePersistenceEnabled()) {
      await deletePersistentAppCredentials(platform);
    } else {
      deleteAppCredentials(platform);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete credentials' },
      { status: 500 }
    );
  }
}

function maskSecret(secret: string): string {
  if (secret.length <= 8) return '••••••••';
  return secret.slice(0, 4) + '••••••••' + secret.slice(-4);
}
