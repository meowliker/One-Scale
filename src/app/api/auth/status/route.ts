import { NextRequest, NextResponse } from 'next/server';
import { getConnectionStatus } from '@/app/api/lib/db';
import { canWorkspaceAccessStore } from '@/app/api/lib/auth-users';
import { isSupabasePersistenceEnabled, getPersistentConnectionStatus } from '@/app/api/lib/supabase-persistence';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { getMetaToken, getShopifyToken, getGoogleDriveToken } from '@/app/api/lib/tokens';

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session.authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!session.legacy && session.workspaceId && !(await canWorkspaceAccessStore(session.workspaceId, storeId))) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const sb = isSupabasePersistenceEnabled();
  const baseStatus = sb
    ? await getPersistentConnectionStatus(storeId)
    : getConnectionStatus(storeId);

  // Token-aware validity: a connection row may exist while token is expired/invalid.
  // Surface that as disconnected so UI and launch behavior stay consistent.
  let metaConnected = false;
  let shopifyConnected = false;
  let googleDriveConnected = false;
  try {
    [metaConnected, shopifyConnected, googleDriveConnected] = await Promise.all([
      getMetaToken(storeId).then(Boolean).catch(() => false),
      getShopifyToken(storeId).then(Boolean).catch(() => false),
      getGoogleDriveToken(storeId).then(Boolean).catch(() => false),
    ]);
  } catch {
    // Keep defaults false if token checks fail unexpectedly.
  }

  return NextResponse.json({
    ...baseStatus,
    meta: {
      ...baseStatus.meta,
      connected: metaConnected,
    },
    shopify: {
      ...baseStatus.shopify,
      connected: shopifyConnected,
    },
    google_drive: {
      ...baseStatus.google_drive,
      connected: googleDriveConnected,
    },
  });
}
