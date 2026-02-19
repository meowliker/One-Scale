import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';
const ALLOWED_STATUSES = new Set(['ACTIVE', 'PAUSED']);

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  let body: { adSetId?: string; status?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const adSetId = typeof body.adSetId === 'string' ? body.adSetId.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : '';

  if (!adSetId) {
    return NextResponse.json({ error: 'adSetId is required' }, { status: 400 });
  }
  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: 'status must be ACTIVE or PAUSED' }, { status: 400 });
  }

  try {
    const form = new URLSearchParams();
    form.set('status', status);

    const response = await fetch(
      `${META_GRAPH_URL}/${encodeURIComponent(adSetId)}?access_token=${encodeURIComponent(token.accessToken)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      }
    );

    if (!response.ok) {
      const raw = await response.text();
      return NextResponse.json(
        { error: `Meta API error (${response.status}): ${raw}` },
        { status: response.status >= 500 ? 502 : 400 }
      );
    }

    const payload = await response.json().catch(() => ({}));
    return NextResponse.json({
      success: true,
      adSetId,
      status,
      result: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update ad set status';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
