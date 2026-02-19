import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';
import { fetchFromMeta } from '@/app/api/lib/meta-client';
import type { CampaignUploadedAsset } from '@/types/campaignCreate';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const GRAPH_VIDEO_BASE = 'https://graph-video.facebook.com/v21.0';

function normalizeAccountNode(value: string): string {
  const node = value.trim();
  if (!node) return '';
  if (node.startsWith('act_')) return node;
  return `act_${node.replace(/^act_/, '')}`;
}

async function parseGraphError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    return parsed.error?.message || text;
  } catch {
    return text;
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const token = await getMetaToken(storeId);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated with Meta' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const accountId = normalizeAccountNode(String(formData.get('accountId') || ''));
    const mediaType = String(formData.get('mediaType') || '');
    const fileValue = formData.get('file');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    if (mediaType !== 'image' && mediaType !== 'video') {
      return NextResponse.json({ error: 'mediaType must be image or video' }, { status: 400 });
    }

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    if (mediaType === 'image') {
      const uploadForm = new FormData();
      uploadForm.set('access_token', token.accessToken);
      uploadForm.set('filename', fileValue, fileValue.name);

      const response = await fetch(`${GRAPH_BASE}/${accountId}/adimages`, {
        method: 'POST',
        body: uploadForm,
      });

      if (!response.ok) {
        const message = await parseGraphError(response);
        return NextResponse.json({ error: message }, { status: 500 });
      }

      const body = await response.json() as {
        images?: Record<string, { hash?: string; url?: string }>;
      };

      const firstImage = body.images ? Object.values(body.images)[0] : undefined;
      const imageHash = firstImage?.hash;
      if (!imageHash) {
        return NextResponse.json({ error: 'Meta did not return an image hash' }, { status: 500 });
      }

      const asset: CampaignUploadedAsset = {
        mediaType: 'image',
        fileName: fileValue.name,
        imageHash,
        thumbnailUrl: firstImage?.url,
      };

      return NextResponse.json(asset);
    }

    const uploadForm = new FormData();
    uploadForm.set('access_token', token.accessToken);
    uploadForm.set('source', fileValue, fileValue.name);
    uploadForm.set('title', fileValue.name);

    const response = await fetch(`${GRAPH_VIDEO_BASE}/${accountId}/advideos`, {
      method: 'POST',
      body: uploadForm,
    });

    if (!response.ok) {
      const message = await parseGraphError(response);
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const body = await response.json() as { id?: string };
    const videoId = body.id;
    if (!videoId) {
      return NextResponse.json({ error: 'Meta did not return a video ID' }, { status: 500 });
    }

    let thumbnailUrl = '';
    try {
      const thumb = await fetchFromMeta<{ thumbnails?: { data?: Array<{ uri?: string }> } }>(
        token.accessToken,
        `/${videoId}`,
        { fields: 'thumbnails' },
        12_000,
        0
      );
      thumbnailUrl = thumb.thumbnails?.data?.[0]?.uri || '';
    } catch {
      // non-blocking
    }

    const asset: CampaignUploadedAsset = {
      mediaType: 'video',
      fileName: fileValue.name,
      videoId,
      thumbnailUrl: thumbnailUrl || undefined,
    };

    return NextResponse.json(asset);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to upload creative asset';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
