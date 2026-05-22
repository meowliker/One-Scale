import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import {
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';
import { listDriveChildren } from '@/app/api/google-drive/shared';

async function getClickUpAccessToken(storeId: string): Promise<string | null> {
  if (isSupabasePersistenceEnabled()) {
    await hydrateStoreFromSupabase(storeId);
    const row = getThirdPartyToken(storeId, 'clickup');
    if (row?.access_token) return row.access_token;

    const persistent = await getPersistentThirdPartyToken(storeId, 'clickup');
    if (persistent?.access_token) {
      upsertThirdPartyToken({
        storeId,
        platform: 'clickup',
        accessToken: persistent.access_token,
        metadata: persistent.metadata
          ? (JSON.parse(persistent.metadata) as Record<string, unknown>)
          : undefined,
      });
      return persistent.access_token;
    }
    return null;
  }

  return getThirdPartyToken(storeId, 'clickup')?.access_token || null;
}

function extractGoogleDriveFileId(url: string): string | null {
  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch?.[1]) return fileIdMatch[1];

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('id');
  } catch {
    return null;
  }
}

function isGoogleDriveFolderUrl(url: string): boolean {
  return url.includes('/folders/') || url.includes('/drive/folders/');
}

function extractGoogleDriveFolderId(url: string): string | null {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function isDriveMediaMime(mimeType?: string | null): boolean {
  const mime = (mimeType || '').toLowerCase();
  return mime.startsWith('video/');
}

async function resolveDriveVideoFileId(
  driveAccessToken: string,
  folderId: string,
  maxDepth = 2,
): Promise<string | null> {
  const queue: Array<{ id: string; depth: number }> = [{ id: folderId, depth: 0 }];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const page = await listDriveChildren(driveAccessToken, current.id);
    const files = page.files || [];
    const video = files.find((file) => isDriveMediaMime(file.mimeType));
    if (video?.id) return video.id;

    if (current.depth >= maxDepth) continue;
    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder' && file.id) {
        queue.push({ id: file.id, depth: current.depth + 1 });
      }
    }
  }

  return null;
}

function toDirectDriveUrl(url: string): string {
  if (url.includes('export=download')) return url;
  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch) return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;

  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam) return `https://drive.google.com/uc?export=download&id=${idParam}`;
  } catch {
    return url;
  }

  return url;
}

function maybeProxyGoogleDriveUrl(url: string, storeId: string, requestUrl: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'drive.google.com') return url;
    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) return url;
    return new URL(
      `/api/google-drive/content?storeId=${encodeURIComponent(storeId)}&fileId=${encodeURIComponent(
        fileId,
      )}&mode=content&download=1`,
      requestUrl,
    ).toString();
  } catch {
    return url;
  }
}

function isClickUpAttachmentUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return (
      hostname === 'clickup.com' ||
      hostname.endsWith('.clickup.com') ||
      hostname.startsWith('clickup-') ||
      hostname.includes('clickup-attachments')
    );
  } catch {
    return false;
  }
}

type VideoPreviewDiagnostics = {
  sourceKind: 'clickup' | 'google_drive' | 'direct_url' | 'unknown';
  sourceHost: string | null;
  previewHost: string | null;
  finalHost: string | null;
  clickupDetected: boolean;
  clickupTokenFound: boolean;
  clickupAuthAttempted: boolean;
  googleDriveProxyUsed: boolean;
  googleDriveFolderUsed: boolean;
  googleDriveAuthAttempted: boolean;
  authedStatus: number | null;
  fallbackStatus: number | null;
  finalStatus: number | null;
};

function getSafeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function usesGoogleDriveProxy(url: string): boolean {
  try {
    return new URL(url).pathname === '/api/google-drive/content';
  } catch {
    return false;
  }
}

function getSourceKind(url: string): VideoPreviewDiagnostics['sourceKind'] {
  if (isClickUpAttachmentUrl(url)) return 'clickup';
  const host = getSafeHost(url);
  if (!host) return 'unknown';
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'google_drive';
  return 'direct_url';
}

async function fetchVideoSource(input: {
  sourceUrl: string;
  previewUrl: string;
  storeId: string;
  rangeHeader: string | null;
  googleDriveFolderUsed: boolean;
  googleDriveAuthAttempted: boolean;
}): Promise<{ response: Response; diagnostics: VideoPreviewDiagnostics }> {
  const headers: HeadersInit = {};
  if (input.rangeHeader) headers.Range = input.rangeHeader;
  const diagnostics: VideoPreviewDiagnostics = {
    sourceKind: usesGoogleDriveProxy(input.previewUrl) ? 'google_drive' : getSourceKind(input.sourceUrl),
    sourceHost: getSafeHost(input.sourceUrl),
    previewHost: getSafeHost(input.previewUrl),
    finalHost: null,
    clickupDetected: isClickUpAttachmentUrl(input.previewUrl),
    clickupTokenFound: false,
    clickupAuthAttempted: false,
    googleDriveProxyUsed: usesGoogleDriveProxy(input.previewUrl),
    googleDriveFolderUsed: input.googleDriveFolderUsed,
    googleDriveAuthAttempted: input.googleDriveAuthAttempted,
    authedStatus: null,
    fallbackStatus: null,
    finalStatus: null,
  };

  if (!diagnostics.clickupDetected) {
    const response = await fetch(input.previewUrl, { redirect: 'follow', headers });
    diagnostics.finalStatus = response.status;
    diagnostics.finalHost = getSafeHost(response.url || input.previewUrl);
    return { response, diagnostics };
  }

  const clickupToken = await getClickUpAccessToken(input.storeId);
  diagnostics.clickupTokenFound = Boolean(clickupToken);
  if (!clickupToken) {
    const response = await fetch(input.previewUrl, { redirect: 'follow', headers });
    diagnostics.fallbackStatus = response.status;
    diagnostics.finalStatus = response.status;
    diagnostics.finalHost = getSafeHost(response.url || input.previewUrl);
    return { response, diagnostics };
  }

  diagnostics.clickupAuthAttempted = true;
  const authedRes = await fetch(input.previewUrl, {
    redirect: 'follow',
    headers: { ...headers, Authorization: clickupToken },
  });
  diagnostics.authedStatus = authedRes.status;
  if (authedRes.ok) {
    diagnostics.finalStatus = authedRes.status;
    diagnostics.finalHost = getSafeHost(authedRes.url || input.previewUrl);
    return { response: authedRes, diagnostics };
  }

  const fallbackRes = await fetch(input.previewUrl, { redirect: 'follow', headers });
  diagnostics.fallbackStatus = fallbackRes.status;
  diagnostics.finalStatus = fallbackRes.status;
  diagnostics.finalHost = getSafeHost(fallbackRes.url || input.previewUrl);
  return { response: fallbackRes, diagnostics };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId') || '';
  const sourceUrl = searchParams.get('sourceUrl') || '';

  if (!storeId || !sourceUrl) {
    return NextResponse.json({ error: 'storeId and sourceUrl are required' }, { status: 400 });
  }

  let absoluteSourceUrl: string;
  try {
    absoluteSourceUrl = new URL(sourceUrl, request.url).toString();
  } catch {
    return NextResponse.json({ error: 'Invalid sourceUrl' }, { status: 400 });
  }

  let googleDriveFolderUsed = false;
  let googleDriveAuthAttempted = false;
  let videoUrl = maybeProxyGoogleDriveUrl(toDirectDriveUrl(absoluteSourceUrl), storeId, request.url);

  if (isGoogleDriveFolderUrl(absoluteSourceUrl)) {
    googleDriveFolderUsed = true;
    const folderId = extractGoogleDriveFolderId(absoluteSourceUrl);
    if (!folderId) {
      return NextResponse.json({ error: 'Invalid Google Drive folder URL.' }, { status: 422 });
    }

    googleDriveAuthAttempted = true;
    const driveToken = await getGoogleDriveToken(storeId);
    if (!driveToken) {
      return NextResponse.json({ error: 'Google Drive is not connected for this store.' }, { status: 422 });
    }

    const mediaFileId = await resolveDriveVideoFileId(driveToken.accessToken, folderId);
    if (!mediaFileId) {
      return NextResponse.json({ error: 'No video file found inside the linked Google Drive folder.' }, { status: 422 });
    }

    videoUrl = new URL(
      `/api/google-drive/content?storeId=${encodeURIComponent(storeId)}&fileId=${encodeURIComponent(
        mediaFileId,
      )}&mode=content&download=1`,
      request.url,
    ).toString();
  }

  const { response: upstream, diagnostics } = await fetchVideoSource({
    sourceUrl: absoluteSourceUrl,
    previewUrl: videoUrl,
    storeId,
    rangeHeader: request.headers.get('range'),
    googleDriveFolderUsed,
    googleDriveAuthAttempted: googleDriveAuthAttempted || usesGoogleDriveProxy(videoUrl),
  });
  if (!upstream.ok && upstream.status !== 206) {
    console.warn('[creative-hub] video preview source failed', {
      status: upstream.status,
      diagnostics,
    });
    return NextResponse.json(
      {
        error: `Could not prepare video preview (${upstream.status})`,
        diagnostics,
      },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type') || 'video/mp4';
  headers.set('content-type', contentType);
  headers.set('accept-ranges', upstream.headers.get('accept-ranges') || 'bytes');
  for (const key of ['content-length', 'content-range']) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }

  return new Response(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
