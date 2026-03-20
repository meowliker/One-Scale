import { NextRequest, NextResponse } from 'next/server';

interface ClickUpStatus {
  id: string;
  status: string;
  color: string;
  orderindex: number;
  type: string;
}

interface ClickUpListResponse {
  id: string;
  name: string;
  statuses: ClickUpStatus[];
}

// GET — fetch all statuses from selected ClickUp lists
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const apiToken = searchParams.get('apiToken') || '';
  const listIdsParam = searchParams.get('listIds') || '';

  if (!apiToken) {
    return NextResponse.json({ error: 'apiToken is required' }, { status: 400 });
  }

  if (!listIdsParam) {
    return NextResponse.json({ error: 'listIds is required' }, { status: 400 });
  }

  const listIds = listIdsParam.split(',').filter(Boolean);

  if (listIds.length === 0) {
    return NextResponse.json({ error: 'At least one listId is required' }, { status: 400 });
  }

  try {
    // Fetch list details for each list to get statuses
    const statusesMap = new Map<string, { name: string; color: string }>();

    await Promise.all(
      listIds.map(async (listId) => {
        try {
          const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
            headers: { Authorization: apiToken },
          });

          if (!res.ok) return;

          const data = (await res.json()) as ClickUpListResponse;

          if (data.statuses) {
            for (const status of data.statuses) {
              // Use lowercase status name as key to dedupe
              const key = status.status.toLowerCase();
              if (!statusesMap.has(key)) {
                statusesMap.set(key, {
                  name: status.status,
                  color: status.color,
                });
              }
            }
          }
        } catch {
          // Ignore individual list fetch errors
        }
      })
    );

    // Convert to array and sort alphabetically
    const statuses = Array.from(statusesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ statuses });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch statuses';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
