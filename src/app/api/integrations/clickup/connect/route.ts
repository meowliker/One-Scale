import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { getThirdPartyToken, upsertThirdPartyToken, deleteThirdPartyToken } from '@/app/api/lib/db';
import { useStoreStore } from '@/stores/storeStore';

// GET — check ClickUp connection status for a store
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ connected: false });

  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) return NextResponse.json({ connected: false });

  const meta = row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : {};
  return NextResponse.json({
    connected: true,
    workspaceId: meta.workspaceId ?? null,
    workspaceName: meta.workspaceName ?? null,
    listId: meta.listId ?? null,
    listName: meta.listName ?? null,
    readyStatus: meta.readyStatus ?? 'ready to launch',
    connectedAt: row.connected_at,
  });
}

// POST — save ClickUp API token + config
export async function POST(request: NextRequest) {
  try {
    await readSessionFromRequest(request);
    const body = await request.json() as {
      storeId: string;
      apiToken: string;
      workspaceId?: string;
      workspaceName?: string;
      listId?: string;
      listName?: string;
      readyStatus?: string;
    };

    const { storeId, apiToken } = body;
    if (!storeId || !apiToken) {
      return NextResponse.json({ error: 'storeId and apiToken are required' }, { status: 400 });
    }

    // Verify the token works by calling ClickUp API
    const verifyRes = await fetch('https://api.clickup.com/api/v2/user', {
      headers: { Authorization: apiToken },
    });
    if (!verifyRes.ok) {
      return NextResponse.json({ error: 'Invalid ClickUp API token' }, { status: 400 });
    }

    upsertThirdPartyToken({
      storeId,
      platform: 'clickup',
      accessToken: apiToken,
      metadata: {
        workspaceId: body.workspaceId,
        workspaceName: body.workspaceName,
        listId: body.listId,
        listName: body.listName,
        readyStatus: body.readyStatus || 'ready to launch',
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — disconnect ClickUp
export async function DELETE(request: NextRequest) {
  try {
    await readSessionFromRequest(request);
    const body = await request.json() as { storeId: string };
    if (!body.storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
    deleteThirdPartyToken(body.storeId, 'clickup');
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
