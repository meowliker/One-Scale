import { NextRequest, NextResponse } from 'next/server';
import { getThirdPartyToken } from '@/app/api/lib/db';

// GET — list ClickUp workspaces (teams) using stored token
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const apiToken = searchParams.get('apiToken') || '';

  // Allow passing token directly (during setup flow) or use stored token
  let token = apiToken;
  if (!token && storeId) {
    const row = getThirdPartyToken(storeId, 'clickup');
    if (!row) return NextResponse.json({ error: 'ClickUp not connected' }, { status: 400 });
    token = row.access_token;
  }
  if (!token) return NextResponse.json({ error: 'No ClickUp token' }, { status: 400 });

  const res = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  });
  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `ClickUp API error: ${text}` }, { status: res.status });
  }

  const data = await res.json() as { teams: Array<{ id: string; name: string; color: string }> };
  return NextResponse.json({
    workspaces: (data.teams || []).map((t) => ({ id: t.id, name: t.name })),
  });
}
