import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const MAX_THUMBNAIL_SIZE = 30 * 1024 * 1024;

function normalizeAccountId(value: string): string {
  const id = value.trim();
  if (!id) return '';
  return id.startsWith('act_') ? id : `act_${id}`;
}

async function parseGraphError(response: Response): Promise<string> {
  const fallback = `Meta API error ${response.status}`;
  try {
    const body = (await response.json()) as {
      error?: { message?: string; error_user_msg?: string; error_user_title?: string };
    };
    const message = body.error?.error_user_msg || body.error?.message || fallback;
    return body.error?.error_user_title ? `${body.error.error_user_title}: ${message}` : message;
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const storeId = String(form.get('storeId') || '').trim();
  const adAccountId = String(form.get('adAccountId') || '').trim();
  const creativeId = String(form.get('creativeId') || '').trim();
  const file = form.get('file');

  if (!storeId || !adAccountId || !creativeId || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'storeId, adAccountId, creativeId, and file are required' },
      { status: 400 },
    );
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Thumbnail must be an image file' }, { status: 422 });
  }

  if (file.size > MAX_THUMBNAIL_SIZE) {
    return NextResponse.json({ error: 'Thumbnail image is too large. Use an image under 30 MB.' }, { status: 422 });
  }

  const tokenData = await getMetaToken(storeId);
  if (!tokenData) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  const accountNode = normalizeAccountId(adAccountId);
  if (!accountNode) {
    return NextResponse.json({ error: 'Invalid adAccountId' }, { status: 400 });
  }

  const uploadForm = new FormData();
  uploadForm.set('access_token', tokenData.accessToken);
  uploadForm.set('filename', file, file.name || `${creativeId}-thumbnail.jpg`);

  const metaRes = await fetch(`${GRAPH_BASE}/${accountNode}/adimages`, {
    method: 'POST',
    body: uploadForm,
  });

  if (!metaRes.ok) {
    const message = await parseGraphError(metaRes);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const metaBody = (await metaRes.json()) as {
    images?: Record<string, { hash?: string; url?: string }>;
  };
  const firstImage = metaBody.images ? Object.values(metaBody.images)[0] : undefined;
  const imageHash = firstImage?.hash;

  if (!imageHash) {
    return NextResponse.json({ error: 'Meta did not return an image hash' }, { status: 500 });
  }

  return NextResponse.json({
    creativeId,
    imageHash,
    thumbnailUrl: firstImage?.url,
    fileName: file.name,
  });
}
