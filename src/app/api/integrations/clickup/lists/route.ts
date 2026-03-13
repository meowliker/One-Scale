import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

interface ClickUpList {
  id: string;
  name: string;
  task_count: number | null;
  space?: { id: string; name: string };
}

// GET — list all lists in a ClickUp workspace (searches all spaces)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const apiToken = searchParams.get('apiToken') || '';
  const workspaceId = searchParams.get('workspaceId') || '';

  let token = apiToken;
  if (!token && storeId) {
    const row = getThirdPartyToken(storeId, 'clickup');
    if (!row) return NextResponse.json({ error: 'ClickUp not connected' }, { status: 400 });
    token = row.access_token;
  }
  if (!token) return NextResponse.json({ error: 'No ClickUp token' }, { status: 400 });
  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 });

  // Fetch all spaces in the workspace
  const spacesRes = await fetch(
    `https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`,
    { headers: { Authorization: token } }
  );
  if (!spacesRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: spacesRes.status });
  }
  const spacesData = await spacesRes.json() as { spaces: Array<{ id: string; name: string }> };

  // Fetch lists in all spaces in parallel
  const allLists: Array<{ id: string; name: string; taskCount: number | null; spaceName: string }> = [];
  await Promise.all(
    (spacesData.spaces || []).map(async (space) => {
      const listsRes = await fetch(
        `https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`,
        { headers: { Authorization: token } }
      );
      if (!listsRes.ok) return;
      const listsData = await listsRes.json() as { lists: ClickUpList[] };
      for (const list of listsData.lists || []) {
        allLists.push({
          id: list.id,
          name: list.name,
          taskCount: list.task_count ?? null,
          spaceName: space.name,
        });
      }

      // Also fetch folderless lists
      const folderlessRes = await fetch(
        `https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`,
        { headers: { Authorization: token } }
      );
      if (!folderlessRes.ok) return;
    })
  );

  return NextResponse.json({ lists: allLists });
}
