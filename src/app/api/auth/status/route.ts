import { NextRequest, NextResponse } from 'next/server';
import { getConnectionStatus } from '@/app/api/lib/db';
import { hydrateStoreFromSupabase, isSupabasePersistenceEnabled } from '@/app/api/lib/supabase-persistence';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
  }
  const status = getConnectionStatus(storeId);
  return NextResponse.json(status);
}
