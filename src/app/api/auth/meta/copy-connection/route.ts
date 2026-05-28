import { NextRequest, NextResponse } from 'next/server';
import { copyMetaConnection, getStore } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, getPersistentStore, copyPersistentMetaConnection } from '@/app/api/lib/supabase-persistence';
import { getMetaToken } from '@/app/api/lib/tokens';

/**
 * POST /api/auth/meta/copy-connection
 * Body: { fromStoreId: string, toStoreId: string }
 *
 * Copies the Meta connection (access token, scopes, etc.) from one store to another.
 * This allows users to reuse their existing Facebook connection across multiple stores
 * without having to OAuth again.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromStoreId, toStoreId } = body;

    if (!fromStoreId || !toStoreId) {
      return NextResponse.json(
        { error: 'fromStoreId and toStoreId are required' },
        { status: 400 }
      );
    }

    if (fromStoreId === toStoreId) {
      return NextResponse.json(
        { error: 'Source and target stores must be different' },
        { status: 400 }
      );
    }

    const sb = isSupabasePersistenceEnabled();

    // Validate both stores exist
    const fromStore = sb ? await getPersistentStore(fromStoreId) : getStore(fromStoreId);
    const toStore = sb ? await getPersistentStore(toStoreId) : getStore(toStoreId);

    if (!fromStore) {
      return NextResponse.json({ error: 'Source store not found' }, { status: 404 });
    }
    if (!toStore) {
      return NextResponse.json({ error: 'Target store not found' }, { status: 404 });
    }

    const sourceToken = await getMetaToken(fromStoreId);
    if (!sourceToken) {
      return NextResponse.json(
        { error: 'The selected Meta connection is expired or no longer valid. Reconnect Meta on that store, then try again.' },
        { status: 400 },
      );
    }

    // Copy the connection
    if (sb) {
      await copyPersistentMetaConnection(fromStoreId, toStoreId);
    } else {
      copyMetaConnection(fromStoreId, toStoreId);
    }

    const copiedToken = await getMetaToken(toStoreId);
    if (!copiedToken) {
      return NextResponse.json(
        { error: 'Meta connection was copied, but the copied token is not valid for this store. Reconnect Meta directly.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Meta connection copied from "${fromStore.name}" to "${toStore.name}"`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to copy connection';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
