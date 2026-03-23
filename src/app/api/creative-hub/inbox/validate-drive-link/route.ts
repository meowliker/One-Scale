import { NextRequest, NextResponse } from 'next/server';

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/x-matroska',
  'application/octet-stream', // Drive sometimes returns this for videos
];
const ALLOWED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

const MAX_IMAGE_SIZE = 30 * 1024 * 1024; // 30 MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

/**
 * Convert a Google Drive share/view URL to a direct download URL
 * so we can issue a HEAD request that returns real file metadata.
 */
function toDirectDriveUrl(url: string): string {
  if (url.includes('export=download')) return url;

  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }

  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam) {
      return `https://drive.google.com/uc?export=download&id=${idParam}`;
    }
  } catch {
    // not a valid URL
  }

  return url;
}

function inferTypeFromUrl(url: string): 'image' | 'video' | null {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return 'image';
    if (VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) return 'video';
  } catch {
    // ignore
  }
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * POST /api/creative-hub/inbox/validate-drive-link
 *
 * Validates a Google Drive (or other) URL by performing a HEAD request.
 * Returns whether the file is accessible, its type, and size.
 *
 * Body: { url }
 */
export async function POST(request: NextRequest) {
  let body: { url?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { url } = body;

  if (!url) {
    return NextResponse.json(
      { valid: false, error: 'URL is required' },
      { status: 400 }
    );
  }

  // Basic URL validation
  try {
    new URL(url);
  } catch {
    return NextResponse.json({
      valid: false,
      error: 'Invalid URL format',
    });
  }

  const directUrl = toDirectDriveUrl(url);

  try {
    // Try HEAD first; some servers don't support it, so fall back to GET with range
    let res: Response;
    try {
      res = await fetch(directUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // HEAD may fail on some servers; try GET with range header
      res = await fetch(directUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(10_000),
      });
    }

    if (!res.ok && res.status !== 206) {
      return NextResponse.json({
        valid: false,
        error: `File not accessible (HTTP ${res.status}). Make sure the link is publicly shared.`,
      });
    }

    const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || '';
    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);

    // Determine file type from content-type or URL extension
    let fileType: 'image' | 'video' | null = null;
    if (IMAGE_TYPES.includes(contentType)) {
      fileType = 'image';
    } else if (VIDEO_TYPES.includes(contentType)) {
      fileType = 'video';
    } else {
      fileType = inferTypeFromUrl(url);
    }

    if (!fileType) {
      // If content-type is text/html, it's likely a sharing page, not the file itself
      if (contentType.includes('text/html')) {
        return NextResponse.json({
          valid: false,
          error: 'URL points to a web page, not a file. Make sure it is a direct download link or the file is publicly shared.',
        });
      }

      return NextResponse.json({
        valid: false,
        error: `Unsupported file type: ${contentType || 'unknown'}. Must be an image or video file.`,
      });
    }

    // Validate file size
    if (contentLength > 0) {
      const maxSize = fileType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
      if (contentLength > maxSize) {
        return NextResponse.json({
          valid: false,
          error: `File too large (${formatBytes(contentLength)}). Maximum for ${fileType}s is ${formatBytes(maxSize)}.`,
          fileType,
          fileSize: contentLength,
        });
      }
    }

    return NextResponse.json({
      valid: true,
      fileType,
      fileSize: contentLength || null,
      fileSizeFormatted: contentLength ? formatBytes(contentLength) : null,
      contentType: contentType || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to validate URL';
    // Distinguish timeout from other errors
    if (message.includes('timeout') || message.includes('aborted')) {
      return NextResponse.json({
        valid: false,
        error: 'Request timed out. The file server did not respond in time.',
      });
    }
    return NextResponse.json({
      valid: false,
      error: `Could not access URL: ${message}`,
    });
  }
}
