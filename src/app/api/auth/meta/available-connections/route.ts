import { NextRequest, NextResponse } from 'next/server';
import { getAllMetaConnections } from '@/app/api/lib/db';
import { isSupabasePersistenceEnabled, getAllPersistentMetaConnections } from '@/app/api/lib/supabase-persistence';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { listStoreIdsForWorkspace } from '@/app/api/lib/auth-users';
import { getMetaToken } from '@/app/api/lib/tokens';

/**
 * GET /api/auth/meta/available-connections?excludeStoreId=xxx
 *
 * Returns stores that have an active Meta connection within the current workspace.
 * Used to offer "reuse existing connection" when connecting a new store.
 * Optionally excludes the specified store from results (the current store).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const excludeStoreId = searchParams.get('excludeStoreId');

  try {
    const session = await readSessionFromRequest(request);
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sb = isSupabasePersistenceEnabled();
    let connections = sb ? await getAllPersistentMetaConnections() : getAllMetaConnections();

    // Filter to only stores belonging to the current workspace
    const allowedStoreIds = !session.legacy && session.workspaceId
      ? new Set(await listStoreIdsForWorkspace(session.workspaceId))
      : null;
    if (allowedStoreIds) {
      connections = connections.filter((c) => allowedStoreIds.has(c.storeId));
    }

    // Exclude the current store (no need to show "copy from yourself")
    if (excludeStoreId) {
      connections = connections.filter((c) => c.storeId !== excludeStoreId);
    }

    const validConnections = [];
    for (const connection of connections) {
      const token = await getMetaToken(connection.storeId);
      if (token) validConnections.push(connection);
    }

    return NextResponse.json({ connections: validConnections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch connections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
