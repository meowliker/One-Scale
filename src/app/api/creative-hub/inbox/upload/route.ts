import { NextRequest, NextResponse } from 'next/server';
import { getMetaToken } from '@/app/api/lib/tokens';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const GRAPH_VIDEO_BASE = 'https://graph-video.facebook.com/v21.0';

// Max file sizes
const MAX_IMAGE_SIZE = 30 * 1024 * 1024; // 30 MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

function normalizeAccountId(value: string): string {
  const id = value.trim();
  if (!id) return '';
  return id.startsWith('act_') ? id : `act_${id}`;
}

function detectMediaType(
  contentType: string | null,
  url: string
): 'image' | 'video' | null {
  if (contentType) {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
  }
  const urlPath = new URL(url).pathname.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => urlPath.endsWith(ext))) return 'image';
  if (VIDEO_EXTENSIONS.some((ext) => urlPath.endsWith(ext))) return 'video';
  return null;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/').filter(Boolean);
    return segments[segments.length - 1] || 'creative';
  } catch {
    return 'creative';
  }
}

/**
 * Convert a Google Drive share/view URL to a direct download URL.
 * Handles:
 *   - https://drive.google.com/file/d/{FILE_ID}/view...
 *   - https://drive.google.com/open?id={FILE_ID}
 *   - Already-direct links (uc?export=download)
 */
function toDirectDriveUrl(url: string): string {
  // Already a direct download link
  if (url.includes('export=download')) return url;

  // /file/d/{id}/...
  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }

  // ?id={id}
  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam) {
      return `https://drive.google.com/uc?export=download&id=${idParam}`;
    }
  } catch {
    // not a valid URL, return as-is
  }

  return url;
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

/**
 * POST /api/creative-hub/inbox/upload
 *
 * Downloads a creative file from a Google Drive (or other) URL and uploads
 * it to the specified Meta ad account. Returns the Meta asset ID and type.
 *
 * Body: { creativeId, driveUrl, adAccountId, storeId }
 */
export async function POST(request: NextRequest) {
  let body: {
    creativeId?: string;
    driveUrl?: string;
    adAccountId?: string;
    storeId?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { creativeId, driveUrl, adAccountId, storeId } = body;

  if (!creativeId || !driveUrl || !adAccountId || !storeId) {
    return NextResponse.json(
      { error: 'creativeId, driveUrl, adAccountId, and storeId are all required' },
      { status: 400 }
    );
  }

  // Get Meta token
  const tokenData = await getMetaToken(storeId);
  if (!tokenData) {
    return NextResponse.json(
      { error: 'Not authenticated with Meta' },
      { status: 401 }
    );
  }

  const accountNode = normalizeAccountId(adAccountId);
  if (!accountNode) {
    return NextResponse.json(
      { error: 'Invalid adAccountId' },
      { status: 400 }
    );
  }

  try {
    // Download file from Drive URL
    const downloadUrl = toDirectDriveUrl(driveUrl);
    const fileRes = await fetch(downloadUrl, { redirect: 'follow' });

    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Failed to download file: HTTP ${fileRes.status}` },
        { status: 422 }
      );
    }

    const contentType = fileRes.headers.get('content-type');
    const mediaType = detectMediaType(contentType, driveUrl);

    if (!mediaType) {
      return NextResponse.json(
        { error: 'Could not determine file type. Must be an image or video.' },
        { status: 422 }
      );
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const maxSize = mediaType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

    if (fileBuffer.byteLength > maxSize) {
      const limitMb = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File too large (${limitMb} MB limit for ${mediaType}s)` },
        { status: 422 }
      );
    }

    const fileName = filenameFromUrl(driveUrl);
    const blob = new Blob([fileBuffer], { type: contentType || undefined });
    const file = new File([blob], fileName);

    if (mediaType === 'image') {
      const uploadForm = new FormData();
      uploadForm.set('access_token', tokenData.accessToken);
      uploadForm.set('filename', file, fileName);

      const metaRes = await fetch(`${GRAPH_BASE}/${accountNode}/adimages`, {
        method: 'POST',
        body: uploadForm,
      });

      if (!metaRes.ok) {
        const msg = await parseGraphError(metaRes);
        return NextResponse.json({ error: msg }, { status: 500 });
      }

      const metaBody = (await metaRes.json()) as {
        images?: Record<string, { hash?: string; url?: string }>;
      };

      const firstImage = metaBody.images
        ? Object.values(metaBody.images)[0]
        : undefined;
      const imageHash = firstImage?.hash;

      if (!imageHash) {
        return NextResponse.json(
          { error: 'Meta did not return an image hash' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        creativeId,
        metaAssetId: imageHash,
        metaAssetType: 'IMAGE' as const,
        thumbnailUrl: firstImage?.url,
      });
    }

    // Video upload
    const uploadForm = new FormData();
    uploadForm.set('access_token', tokenData.accessToken);
    uploadForm.set('source', file, fileName);
    uploadForm.set('title', fileName);

    const metaRes = await fetch(
      `${GRAPH_VIDEO_BASE}/${accountNode}/advideos`,
      { method: 'POST', body: uploadForm }
    );

    if (!metaRes.ok) {
      const msg = await parseGraphError(metaRes);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const metaBody = (await metaRes.json()) as { id?: string };
    const videoId = metaBody.id;

    if (!videoId) {
      return NextResponse.json(
        { error: 'Meta did not return a video ID' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      creativeId,
      metaAssetId: videoId,
      metaAssetType: 'VIDEO' as const,
      // Video processing is async; caller should poll status separately
      videoProcessing: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to upload creative';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
