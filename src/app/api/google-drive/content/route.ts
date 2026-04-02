import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';
import {
  fetchDriveFileMetadata,
  GOOGLE_DRIVE_FOLDER_MIME,
  GOOGLE_DRIVE_BASE_URL,
  GoogleDriveApiFile,
  GoogleDriveRequestError,
} from '../shared';

function buildProxyHeaders(upstream: Response, fileName: string): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === 'content-length' ||
      lower === 'content-range' ||
      lower === 'content-type' ||
      lower === 'accept-ranges' ||
      lower === 'etag' ||
      lower === 'last-modified' ||
      lower === 'cache-control' ||
      lower === 'expires'
    ) {
      headers.set(key, value);
    }
  });
  if (!headers.has('Accept-Ranges')) {
    headers.set('Accept-Ranges', 'bytes');
  }
  headers.set('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

async function fetchThumbnail(
  file: GoogleDriveApiFile,
  token: string,
): Promise<Response | null> {
  if (!file.thumbnailLink) return null;

  const thumbRes = await fetch(file.thumbnailLink);
  if (thumbRes.ok) {
    return thumbRes;
  }

  if (file.mimeType.startsWith('image/')) {
    return fetch(`${GOOGLE_DRIVE_BASE_URL}/files/${encodeURIComponent(file.id)}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const fileId = searchParams.get('fileId');
  const mode = searchParams.get('mode') === 'thumbnail' ? 'thumbnail' : 'content';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  if (!fileId) {
    return NextResponse.json({ error: 'fileId is required' }, { status: 400 });
  }

  const tokenData = await getGoogleDriveToken(storeId);
  if (!tokenData) {
    return NextResponse.json(
      { error: 'Google Drive not connected or token expired. Please reconnect.' },
      { status: 401 },
    );
  }

  let file: GoogleDriveApiFile;
  try {
    file = await fetchDriveFileMetadata(
      tokenData.accessToken,
      fileId,
      'id,name,mimeType,thumbnailLink,webViewLink,webContentLink',
    );
  } catch (err) {
    if (err instanceof GoogleDriveRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to fetch file metadata';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (file.mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
    return NextResponse.json(
      { error: 'Folders cannot be proxied as media content' },
      { status: 400 },
    );
  }

  try {
    if (mode === 'thumbnail') {
      const thumbRes = await fetchThumbnail(file, tokenData.accessToken);
      if (!thumbRes) {
        return NextResponse.json(
          { error: 'No thumbnail available for this file' },
          { status: 404 },
        );
      }

      if (!thumbRes.ok) {
        const errBody = await thumbRes.text().catch(() => '');
        return NextResponse.json(
          { error: errBody || `Thumbnail request failed (${thumbRes.status})` },
          { status: thumbRes.status },
        );
      }

      const headers = buildProxyHeaders(thumbRes, file.name);
      return new NextResponse(thumbRes.body, {
        status: thumbRes.status,
        headers,
      });
    }

    const contentUrl = `${GOOGLE_DRIVE_BASE_URL}/files/${encodeURIComponent(file.id)}?alt=media&supportsAllDrives=true`;
    const rangeHeader = request.headers.get('range');
    const res = await fetch(contentUrl, {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
        ...(rangeHeader ? { Range: rangeHeader } : {}),
      },
    });

    if (!res.ok && res.status !== 206) {
      const errBody = await res.text().catch(() => '');
      return NextResponse.json(
        { error: errBody || `Failed to fetch media (${res.status})` },
        { status: res.status },
      );
    }

    const headers = buildProxyHeaders(res, file.name);
    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch (err) {
    if (err instanceof GoogleDriveRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Failed to proxy Google Drive content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
