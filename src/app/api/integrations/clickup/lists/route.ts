import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

interface ClickUpList {
  id: string;
  name: string;
  task_count: number | null;
}

interface ClickUpFolder {
  id: string;
  name: string;
  lists: ClickUpList[];
}

export interface ListTreeItem {
  type: 'space' | 'folder' | 'list';
  id: string;
  name: string;
  taskCount?: number | null;
  spaceId?: string;
  spaceName?: string;
  folderId?: string;
  folderName?: string;
  children?: ListTreeItem[];
}

// GET — fetch full hierarchy: Workspace → Space → Folder → List
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

  // 1. Fetch all spaces
  const spacesRes = await fetch(
    `https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`,
    { headers: { Authorization: token } }
  );
  if (!spacesRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: spacesRes.status });
  }
  const spacesData = await spacesRes.json() as { spaces: Array<{ id: string; name: string }> };
  const spaces = spacesData.spaces || [];

  // 2. For each space, fetch folders + folderless lists in parallel
  const tree: ListTreeItem[] = await Promise.all(
    spaces.map(async (space): Promise<ListTreeItem> => {
      const [foldersRes, folderlessRes] = await Promise.all([
        fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder?archived=false`, { headers: { Authorization: token } }),
        fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, { headers: { Authorization: token } }),
      ]);

      const spaceChildren: ListTreeItem[] = [];

      // Folders with their lists
      if (foldersRes.ok) {
        const foldersData = await foldersRes.json() as { folders: ClickUpFolder[] };
        for (const folder of foldersData.folders || []) {
          const folderItem: ListTreeItem = {
            type: 'folder',
            id: folder.id,
            name: folder.name,
            spaceId: space.id,
            spaceName: space.name,
            children: (folder.lists || []).map((list): ListTreeItem => ({
              type: 'list',
              id: list.id,
              name: list.name,
              taskCount: list.task_count,
              spaceId: space.id,
              spaceName: space.name,
              folderId: folder.id,
              folderName: folder.name,
            })),
          };
          spaceChildren.push(folderItem);
        }
      }

      // Folderless lists directly in the space
      if (folderlessRes.ok) {
        const folderlessData = await folderlessRes.json() as { lists: ClickUpList[] };
        for (const list of folderlessData.lists || []) {
          spaceChildren.push({
            type: 'list',
            id: list.id,
            name: list.name,
            taskCount: list.task_count,
            spaceId: space.id,
            spaceName: space.name,
          });
        }
      }

      return {
        type: 'space',
        id: space.id,
        name: space.name,
        children: spaceChildren,
      };
    })
  );

  // Also return flat list
  const flat: Array<{ id: string; name: string; taskCount: number | null; spaceName: string; folderName?: string }> = [];
  for (const space of tree) {
    for (const child of space.children || []) {
      if (child.type === 'folder') {
        for (const list of child.children || []) {
          flat.push({ id: list.id, name: list.name, taskCount: list.taskCount ?? null, spaceName: space.name, folderName: child.name });
        }
      } else {
        flat.push({ id: child.id, name: child.name, taskCount: child.taskCount ?? null, spaceName: space.name });
      }
    }
  }

  return NextResponse.json({ tree, lists: flat });
}
