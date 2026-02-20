import { NextRequest, NextResponse } from 'next/server';
import { getConnectionStatus } from '@/app/api/lib/db';
import { canWorkspaceAccessStore } from '@/app/api/lib/auth-users';
import { isSupabasePersistenceEnabled, getPersistentConnectionStatus } from '@/app/api/lib/supabase-persistence';
import { readSessionFromRequest } from '@/lib/auth/request-session';

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
  if (sb) {
    const status = await getPersistentConnectionStatus(storeId);
    return NextResponse.json(status);
  }
  const status = getConnectionStatus(storeId);
  return NextResponse.json(status);
}
