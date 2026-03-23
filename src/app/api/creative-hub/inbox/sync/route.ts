import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';
import { getProductProfiles } from '@/app/api/lib/creative-hub-db';

/**
 * POST /api/creative-hub/inbox/sync?storeId=X
 *
 * Triggers a fresh sync from ClickUp by fetching tasks from all mapped
 * product profile ClickUp lists and returning the updated creatives list.
 * Delegates to the GET /api/creative-hub/inbox endpoint internally.
 */
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Verify ClickUp is connected
  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) {
    return NextResponse.json(
      { error: 'ClickUp not connected', notConnected: true },
      { status: 200 }
    );
  }

  // Verify at least one profile has a ClickUp list
  const profiles = getProductProfiles(storeId);
  const hasClickupList = profiles.some((p) => p.clickupListId);
  if (!hasClickupList) {
    return NextResponse.json(
      { error: 'No product profiles have a ClickUp list configured', notConfigured: true },
      { status: 200 }
    );
  }

  // Perform fresh fetch by calling our own inbox GET endpoint
  const origin = new URL(request.url).origin;
  const inboxUrl = `${origin}/api/creative-hub/inbox?storeId=${encodeURIComponent(storeId)}`;

  try {
    const res = await fetch(inboxUrl, {
      method: 'GET',
      headers: {
        cookie: request.headers.get('cookie') || '',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Sync failed: ${text}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { creatives: unknown[] };

    return NextResponse.json({
      creatives: data.creatives,
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
