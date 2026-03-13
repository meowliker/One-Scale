import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

// PATCH — update a ClickUp task status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json() as { storeId: string; status: string };
  const { storeId, status } = body;

  if (!storeId || !status) {
    return NextResponse.json({ error: 'storeId and status are required' }, { status: 400 });
  }

  const row = getThirdPartyToken(storeId, 'clickup');
  if (!row) return NextResponse.json({ error: 'ClickUp not connected' }, { status: 400 });

  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: 'PUT',
    headers: {
      Authorization: row.access_token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `ClickUp API error: ${text}` }, { status: res.status });
  }

  return NextResponse.json({ success: true });
}
