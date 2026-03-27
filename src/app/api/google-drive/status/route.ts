import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';
import { getPersistentConnection } from '@/app/api/lib/supabase-persistence';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  try {
    // Check if we have a valid token
    const tokenData = await getGoogleDriveToken(storeId);

    if (!tokenData) {
      return NextResponse.json({ connected: false });
    }

    // Try to get the stored email from the persistent connection metadata
    let email: string | null = null;
    let lastSynced: string | null = null;

    try {
      const conn = await getPersistentConnection(storeId, 'google_drive');
      if (conn?.metadata) {
        const meta = typeof conn.metadata === 'string'
          ? JSON.parse(conn.metadata)
          : conn.metadata;
        email = meta?.email ?? null;
      }
      lastSynced = conn?.last_synced ?? null;
    } catch {
      // Non-critical — skip
    }

    return NextResponse.json({
      connected: true,
      email,
      lastSynced,
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
