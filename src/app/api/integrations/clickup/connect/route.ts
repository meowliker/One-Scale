import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/auth/request-session';
import { getThirdPartyToken, upsertThirdPartyToken, deleteThirdPartyToken } from '@/app/api/lib/db';

// GET — check ClickUp connection status for a store
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ connected: false });

  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) return NextResponse.json({ connected: false });

  const meta = row.metadata ? JSON.parse(row.metadata) as Record<string, unknown> : {};
  // Support both old listId and new listIds[]
  const listIds: string[] = (meta.listIds as string[]) || (meta.listId ? [meta.listId as string] : []);
  return NextResponse.json({
    connected: true,
    workspaceId: meta.workspaceId ?? null,
    workspaceName: meta.workspaceName ?? null,
    listIds,
    listNames: meta.listNames ?? [],
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
      listIds?: string[];
      listNames?: string[];
      readyStatus?: string;
    };

    const { storeId, apiToken } = body;
    if (!storeId || !apiToken) {
      return NextResponse.json({ error: 'storeId and apiToken are required' }, { status: 400 });
    }
    if (!body.listIds || body.listIds.length === 0) {
      return NextResponse.json({ error: 'At least one list must be selected' }, { status: 400 });
    }

    // Verify the token works
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
        listIds: body.listIds,
        listNames: body.listNames || [],
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
