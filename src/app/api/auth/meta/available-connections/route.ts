import { NextRequest, NextResponse } from 'next/server';
import { getAllMetaConnections } from '@/app/api/lib/db';

/**
 * GET /api/auth/meta/available-connections?excludeStoreId=xxx
 *
 * Returns all stores that have an active Meta connection.
 * Used to offer "reuse existing connection" when connecting a new store.
 * Optionally excludes the specified store from results (the current store).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const excludeStoreId = searchParams.get('excludeStoreId');

  try {
    let connections = getAllMetaConnections();

    // Exclude the current store (no need to show "copy from yourself")
    if (excludeStoreId) {
      connections = connections.filter((c) => c.storeId !== excludeStoreId);
    }

    return NextResponse.json({ connections });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch connections';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
