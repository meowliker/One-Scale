import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';
import {
  isSupabasePersistenceEnabled,
  hydrateStoreFromSupabase,
} from '@/app/api/lib/supabase-persistence';

interface ClickUpList {
  id: string;
  name: string;
  folder?: { id: string; name: string };
  space?: { id: string; name: string };
}

interface ClickUpFolder {
  id: string;
  name: string;
  lists: Array<{ id: string; name: string; isAdded: boolean }>;
}

interface ClickUpSpace {
  id: string;
  name: string;
  folders: ClickUpFolder[];
  lists: Array<{ id: string; name: string; isAdded: boolean }>; // Folderless lists
}

interface ClickUpMetadata {
  workspaceId?: string;
  workspaceName?: string;
  listIds?: string[];
  listNames?: string[];
}

// GET — fetch all available lists from ClickUp workspace with proper hierarchy
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // Hydrate from Supabase if needed
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
  }

  const clickupRow = getThirdPartyToken(storeId, 'clickup');
  if (!clickupRow) {
    return NextResponse.json({ error: 'ClickUp not connected' }, { status: 400 });
  }

  const token = clickupRow.access_token;
  const meta: ClickUpMetadata = clickupRow.metadata ? JSON.parse(clickupRow.metadata) : {};
  const workspaceId = meta.workspaceId;
  const currentListIds = new Set(meta.listIds || []);

  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace configured' }, { status: 400 });
  }

  // Build hierarchical structure: Spaces > Folders > Lists
  const spaces: ClickUpSpace[] = [];
  const allLists: ClickUpList[] = []; // Flat list for backward compatibility

  try {
    const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${workspaceId}/space?archived=false`, {
      headers: { Authorization: token },
    });

    if (!spacesRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch spaces' }, { status: 500 });
    }

    const spacesData = await spacesRes.json() as { spaces: Array<{ id: string; name: string }> };

    // For each space, fetch folders and folderless lists
    for (const space of spacesData.spaces || []) {
      const spaceData: ClickUpSpace = {
        id: space.id,
        name: space.name,
        folders: [],
        lists: [],
      };

      // Fetch folderless lists
      try {
        const listsRes = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/list?archived=false`, {
          headers: { Authorization: token },
        });
        if (listsRes.ok) {
          const listsData = await listsRes.json() as { lists: Array<{ id: string; name: string }> };
          for (const list of listsData.lists || []) {
            const isAdded = currentListIds.has(list.id);
            spaceData.lists.push({
              id: list.id,
              name: list.name,
              isAdded,
            });
            allLists.push({
              id: list.id,
              name: list.name,
              space: { id: space.id, name: space.name },
            });
          }
        }
      } catch {
        // Continue
      }

      // Fetch folders
      try {
        const foldersRes = await fetch(`https://api.clickup.com/api/v2/space/${space.id}/folder?archived=false`, {
          headers: { Authorization: token },
        });
        if (foldersRes.ok) {
          const foldersData = await foldersRes.json() as { folders: Array<{ id: string; name: string; lists: Array<{ id: string; name: string }> }> };
          for (const folder of foldersData.folders || []) {
            const folderData: ClickUpFolder = {
              id: folder.id,
              name: folder.name,
              lists: [],
            };
            for (const list of folder.lists || []) {
              const isAdded = currentListIds.has(list.id);
              folderData.lists.push({
                id: list.id,
                name: list.name,
                isAdded,
              });
              allLists.push({
                id: list.id,
                name: list.name,
                folder: { id: folder.id, name: folder.name },
                space: { id: space.id, name: space.name },
              });
            }
            if (folderData.lists.length > 0) {
              spaceData.folders.push(folderData);
            }
          }
        }
      } catch {
        // Continue
      }

      // Only add space if it has lists or folders with lists
      if (spaceData.lists.length > 0 || spaceData.folders.length > 0) {
        spaces.push(spaceData);
      }
    }
  } catch (err) {
    console.error('Error fetching ClickUp lists:', err);
    return NextResponse.json({ error: 'Failed to fetch lists' }, { status: 500 });
  }

  // Mark which lists are already added (flat list for backward compatibility)
  const listsWithStatus = allLists.map((list) => ({
    ...list,
    isAdded: currentListIds.has(list.id),
  }));

  return NextResponse.json({
    spaces, // Hierarchical structure
    lists: listsWithStatus, // Flat list for backward compatibility
    workspaceName: meta.workspaceName,
  });
}
