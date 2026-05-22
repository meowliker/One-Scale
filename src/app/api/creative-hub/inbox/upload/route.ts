import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { getGoogleDriveToken, getMetaToken } from '@/app/api/lib/tokens';
import { GOOGLE_DRIVE_BASE_URL, listDriveChildren } from '@/app/api/google-drive/shared';
import { getThirdPartyToken, upsertThirdPartyToken } from '@/app/api/lib/db';
import { getCachedInboxCreatives } from '@/app/api/lib/creative-hub-db';
import {
  getPersistentThirdPartyToken,
  hydrateStoreFromSupabase,
  isSupabasePersistenceEnabled,
} from '@/app/api/lib/supabase-persistence';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const GRAPH_VIDEO_BASE = 'https://graph-video.facebook.com/v21.0';

export const runtime = 'nodejs';

// Max file sizes
const MAX_IMAGE_SIZE = 30 * 1024 * 1024; // 30 MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'];

type SourceKind = 'clickup' | 'google_drive' | 'direct_url' | 'unknown';

type SourceFetchDiagnostics = {
  sourceKind: SourceKind;
  sourceHost: string | null;
  downloadHost: string | null;
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

type SourceFetchResult = {
  response: Response;
  diagnostics: SourceFetchDiagnostics;
};

const MEDIA_URL_RE = /https?:\/\/[^\s"'<>]+?\.(?:mp4|mov|avi|mkv|webm|m4v|jpg|jpeg|png|gif|bmp|webp)(?:\?[^\s"'<>]*)?/gi;

/** Resolve ClickUp token, hydrating from Supabase on Vercel if needed. */
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

function normalizeAccountId(value: string): string {
  const id = value.trim();
  if (!id) return '';
  return id.startsWith('act_') ? id : `act_${id}`;
}

function mediaTypeFromFilename(filename: string): 'image' | 'video' | null {
  const lower = filename.toLowerCase();
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  if (VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'video';
  return null;
}

function mediaTypeFromBuffer(fileBuffer: Buffer): 'image' | 'video' | null {
  if (fileBuffer.length < 12) return null;

  // JPEG
  if (fileBuffer[0] === 0xff && fileBuffer[1] === 0xd8 && fileBuffer[2] === 0xff) {
    return 'image';
  }
  // PNG
  if (
    fileBuffer[0] === 0x89 &&
    fileBuffer[1] === 0x50 &&
    fileBuffer[2] === 0x4e &&
    fileBuffer[3] === 0x47 &&
    fileBuffer[4] === 0x0d &&
    fileBuffer[5] === 0x0a &&
    fileBuffer[6] === 0x1a &&
    fileBuffer[7] === 0x0a
  ) {
    return 'image';
  }
  // GIF
  if (
    fileBuffer[0] === 0x47 &&
    fileBuffer[1] === 0x49 &&
    fileBuffer[2] === 0x46 &&
    fileBuffer[3] === 0x38
  ) {
    return 'image';
  }
  // BMP
  if (fileBuffer[0] === 0x42 && fileBuffer[1] === 0x4d) {
    return 'image';
  }
  // WEBP (RIFF....WEBP)
  if (
    fileBuffer[0] === 0x52 &&
    fileBuffer[1] === 0x49 &&
    fileBuffer[2] === 0x46 &&
    fileBuffer[3] === 0x46 &&
    fileBuffer[8] === 0x57 &&
    fileBuffer[9] === 0x45 &&
    fileBuffer[10] === 0x42 &&
    fileBuffer[11] === 0x50
  ) {
    return 'image';
  }
  // MP4/MOV/M4V family ("ftyp" at byte offset 4)
  if (
    fileBuffer[4] === 0x66 &&
    fileBuffer[5] === 0x74 &&
    fileBuffer[6] === 0x79 &&
    fileBuffer[7] === 0x70
  ) {
    return 'video';
  }
  // AVI (RIFF....AVI)
  if (
    fileBuffer[0] === 0x52 &&
    fileBuffer[1] === 0x49 &&
    fileBuffer[2] === 0x46 &&
    fileBuffer[3] === 0x46 &&
    fileBuffer[8] === 0x41 &&
    fileBuffer[9] === 0x56 &&
    fileBuffer[10] === 0x49
  ) {
    return 'video';
  }
  // MKV/WebM (EBML)
  if (
    fileBuffer[0] === 0x1a &&
    fileBuffer[1] === 0x45 &&
    fileBuffer[2] === 0xdf &&
    fileBuffer[3] === 0xa3
  ) {
    return 'video';
  }

  return null;
}

function filenameFromContentDisposition(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  const utf8 = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8?.[1]) {
    try {
      return decodeURIComponent(utf8[1].replace(/['"]/g, '').trim());
    } catch {
      return utf8[1].replace(/['"]/g, '').trim();
    }
  }
  const basic = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basic?.[1]?.trim() || null;
}

function detectMediaType(
  contentType: string | null,
  url: string,
  fileName: string,
  fileBuffer: Buffer,
  mediaTypeHint?: string | null,
): 'image' | 'video' | null {
  const normalizedContentType = (contentType || '').toLowerCase();

  if (contentType) {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
  }

  const byName = mediaTypeFromFilename(fileName);
  if (byName) return byName;

  try {
    const urlPath = new URL(url).pathname.toLowerCase();
    const byUrl = mediaTypeFromFilename(urlPath);
    if (byUrl) return byUrl;
  } catch {
    // ignore invalid URL paths
  }

  const byBytes = mediaTypeFromBuffer(fileBuffer);
  if (byBytes) return byBytes;

  // Avoid forcing media type from hints when upstream returned a non-media document.
  if (
    normalizedContentType.startsWith('text/html') ||
    normalizedContentType.startsWith('application/json') ||
    normalizedContentType.startsWith('text/plain')
  ) {
    return null;
  }

  if (mediaTypeHint === 'image' || mediaTypeHint === 'video') {
    return mediaTypeHint;
  }

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

function extractGoogleDriveFileId(url: string): string | null {
  const fileIdMatch = url.match(/\/file\/d\/([^/]+)/);
  if (fileIdMatch?.[1]) return fileIdMatch[1];

  try {
    const parsed = new URL(url);
    const idParam = parsed.searchParams.get('id');
    if (idParam) return idParam;
  } catch {
    // ignore invalid URL
  }

  return null;
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
  return mime.startsWith('image/') || mime.startsWith('video/');
}

async function resolveDriveMediaFileId(
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

    const directMedia = files.find((file) => isDriveMediaMime(file.mimeType));
    if (directMedia?.id) return directMedia.id;

    if (current.depth >= maxDepth) continue;

    for (const file of files) {
      if (file.mimeType === 'application/vnd.google-apps.folder' && file.id) {
        queue.push({ id: file.id, depth: current.depth + 1 });
      }
    }
  }

  return null;
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

function extractMediaUrlFromText(value?: string | null): string | null {
  if (!value) return null;
  const matches = value.match(MEDIA_URL_RE) || [];
  return matches[0]?.trim() || null;
}

async function getInboxFallbackSourceUrl(storeId: string, creativeId: string): Promise<string | null> {
  if (!creativeId) return null;
  try {
    const creatives = await getCachedInboxCreatives(storeId);
    const creative = creatives.find((item) => item.id === creativeId);
    if (!creative) return null;
    return (
      creative.clickupAttachmentUrl ||
      extractMediaUrlFromText(creative.clickupDescription) ||
      null
    );
  } catch {
    return null;
  }
}

function getSafeHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getSourceKind(url: string): SourceKind {
  if (!url) return 'unknown';
  if (isClickUpAttachmentUrl(url)) return 'clickup';
  const host = getSafeHost(url);
  if (!host) return 'unknown';
  if (host === 'drive.google.com' || host === 'docs.google.com') return 'google_drive';
  return 'direct_url';
}

function usesGoogleDriveProxy(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/api/google-drive/content';
  } catch {
    return false;
  }
}

function parseGoogleDriveProxyUrl(url: string): { storeId: string; fileId: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname !== '/api/google-drive/content') return null;
    const storeId = parsed.searchParams.get('storeId');
    const fileId = parsed.searchParams.get('fileId');
    if (!storeId || !fileId) return null;
    return { storeId, fileId };
  } catch {
    return null;
  }
}

function toAbsoluteUrl(url: string, requestUrl: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, requestUrl).toString();
  } catch {
    return url;
  }
}

function createFetchDiagnostics(input: {
  sourceUrl: string;
  downloadUrl: string;
  googleDriveFolderUsed: boolean;
  googleDriveAuthAttempted: boolean;
}): SourceFetchDiagnostics {
  const clickupDetected = isClickUpAttachmentUrl(input.downloadUrl);
  return {
    sourceKind: usesGoogleDriveProxy(input.downloadUrl)
      ? 'google_drive'
      : getSourceKind(input.sourceUrl),
    sourceHost: getSafeHost(input.sourceUrl),
    downloadHost: getSafeHost(input.downloadUrl),
    finalHost: null,
    clickupDetected,
    clickupTokenFound: false,
    clickupAuthAttempted: false,
    googleDriveProxyUsed: usesGoogleDriveProxy(input.downloadUrl),
    googleDriveFolderUsed: input.googleDriveFolderUsed,
    googleDriveAuthAttempted: input.googleDriveAuthAttempted,
    authedStatus: null,
    fallbackStatus: null,
    finalStatus: null,
  };
}

async function fetchSourceFile(input: {
  creativeId: string;
  sourceUrl: string;
  downloadUrl: string;
  storeId: string;
  requestCookie: string | null;
  googleDriveFolderUsed: boolean;
  googleDriveAuthAttempted: boolean;
}): Promise<SourceFetchResult> {
  const diagnostics = createFetchDiagnostics(input);
  const sameOriginProxyHeaders: HeadersInit =
    diagnostics.googleDriveProxyUsed && input.requestCookie
      ? { Cookie: input.requestCookie }
      : {};

  if (diagnostics.googleDriveProxyUsed) {
    const proxyTarget = parseGoogleDriveProxyUrl(input.downloadUrl);
    const driveStoreId = proxyTarget?.storeId || input.storeId;
    const driveToken = proxyTarget ? await getGoogleDriveToken(driveStoreId) : null;
    diagnostics.googleDriveAuthAttempted = true;

    if (proxyTarget && driveToken?.accessToken) {
      const driveMediaUrl = `${GOOGLE_DRIVE_BASE_URL}/files/${encodeURIComponent(
        proxyTarget.fileId,
      )}?alt=media&supportsAllDrives=true`;
      const directDriveResponse = await fetch(driveMediaUrl, {
        redirect: 'follow',
        headers: { Authorization: `Bearer ${driveToken.accessToken}` },
      });
      diagnostics.authedStatus = directDriveResponse.status;
      diagnostics.finalStatus = directDriveResponse.status;
      diagnostics.finalHost = getSafeHost(directDriveResponse.url || driveMediaUrl);
      if (directDriveResponse.ok) {
        return { response: directDriveResponse, diagnostics };
      }
    }

    const fallbackSourceUrl = await getInboxFallbackSourceUrl(input.storeId, input.creativeId);
    if (fallbackSourceUrl) {
      const fallbackIsClickUp = isClickUpAttachmentUrl(fallbackSourceUrl);
      diagnostics.clickupDetected = fallbackIsClickUp;

      if (fallbackIsClickUp) {
        const clickupToken = await getClickUpAccessToken(input.storeId);
        diagnostics.clickupTokenFound = Boolean(clickupToken);
        if (clickupToken) {
          diagnostics.clickupAuthAttempted = true;
          const authedRes = await fetch(fallbackSourceUrl, {
            redirect: 'follow',
            headers: { Authorization: clickupToken },
          });
          diagnostics.fallbackStatus = authedRes.status;
          diagnostics.finalStatus = authedRes.status;
          diagnostics.finalHost = getSafeHost(authedRes.url || fallbackSourceUrl);
          if (authedRes.ok) {
            return { response: authedRes, diagnostics };
          }
        }
      }

      const fallbackRes = await fetch(fallbackSourceUrl, { redirect: 'follow' });
      diagnostics.fallbackStatus = fallbackRes.status;
      diagnostics.finalStatus = fallbackRes.status;
      diagnostics.finalHost = getSafeHost(fallbackRes.url || fallbackSourceUrl);
      if (fallbackRes.ok) {
        return { response: fallbackRes, diagnostics };
      }
    }
  }

  if (!diagnostics.clickupDetected) {
    const response = await fetch(input.downloadUrl, {
      redirect: 'follow',
      headers: sameOriginProxyHeaders,
    });
    diagnostics.finalStatus = response.status;
    diagnostics.finalHost = getSafeHost(response.url || input.downloadUrl);
    return { response, diagnostics };
  }

  const clickupToken = await getClickUpAccessToken(input.storeId);
  diagnostics.clickupTokenFound = Boolean(clickupToken);
  if (!clickupToken) {
    const response = await fetch(input.downloadUrl, { redirect: 'follow' });
    diagnostics.fallbackStatus = response.status;
    diagnostics.finalStatus = response.status;
    diagnostics.finalHost = getSafeHost(response.url || input.downloadUrl);
    return { response, diagnostics };
  }

  diagnostics.clickupAuthAttempted = true;
  const authedRes = await fetch(input.downloadUrl, {
    redirect: 'follow',
    headers: { Authorization: clickupToken },
  });
  diagnostics.authedStatus = authedRes.status;

  // Some ClickUp attachment URLs are pre-signed and reject extra headers.
  if (authedRes.ok) {
    diagnostics.finalStatus = authedRes.status;
    diagnostics.finalHost = getSafeHost(authedRes.url || input.downloadUrl);
    return { response: authedRes, diagnostics };
  }

  const fallbackRes = await fetch(input.downloadUrl, { redirect: 'follow' });
  diagnostics.fallbackStatus = fallbackRes.status;
  diagnostics.finalStatus = fallbackRes.status;
  diagnostics.finalHost = getSafeHost(fallbackRes.url || input.downloadUrl);
  return { response: fallbackRes, diagnostics };
}

async function parseGraphError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        message?: string;
        type?: string;
        code?: number;
        error_subcode?: number;
        error_user_title?: string;
        error_user_msg?: string;
        fbtrace_id?: string;
      };
    };
    const err = parsed.error;
    if (!err) return text;
    return [
      err.message || 'Meta API error',
      err.type ? `type=${err.type}` : '',
      typeof err.code === 'number' ? `code=${err.code}` : '',
      typeof err.error_subcode === 'number' ? `subcode=${err.error_subcode}` : '',
      err.error_user_title ? `user_title=${err.error_user_title}` : '',
      err.error_user_msg ? `user_msg=${err.error_user_msg}` : '',
      err.fbtrace_id ? `fbtrace=${err.fbtrace_id}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  } catch {
    return text;
  }
}

function isUnsupportedVideoFormatMetaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('unsupported video format') ||
    lower.includes('subcode=1363024') ||
    lower.includes("video you're trying to upload is in a format that isn't supported")
  );
}

async function uploadVideoToMeta(
  accessToken: string,
  accountNode: string,
  fileBuffer: Buffer,
  fileName: string,
  contentType?: string | null,
): Promise<Response> {
  const uploadForm = new FormData();
  uploadForm.set('access_token', accessToken);
  const blobBytes = new Uint8Array(fileBuffer);
  uploadForm.set(
    'source',
    new File([new Blob([blobBytes], { type: contentType || 'video/mp4' })], fileName),
    fileName,
  );
  uploadForm.set('title', fileName);

  return fetch(`${GRAPH_VIDEO_BASE}/${accountNode}/advideos`, {
    method: 'POST',
    body: uploadForm,
  });
}

async function transcodeVideoForMeta(fileBuffer: Buffer, fileName: string): Promise<{ buffer: Buffer; fileName: string }> {
  if (!ffmpegPath) {
    throw new Error('Video transcoding is not available in this deployment.');
  }
  const binaryPath = ffmpegPath;

  const workDir = await mkdtemp(path.join(tmpdir(), 'creative-upload-'));
  const inputPath = path.join(workDir, fileName || 'input-video');
  const outputPath = path.join(workDir, `${path.parse(fileName || 'creative').name || 'creative'}-meta.mp4`);

  try {
    await writeFile(inputPath, fileBuffer);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binaryPath, [
        '-y',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v',
        'libx264',
        '-profile:v',
        'main',
        '-level',
        '4.1',
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outputPath,
      ]);

      let stderr = '';
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      });
    });

    return {
      buffer: await readFile(outputPath),
      fileName: path.basename(outputPath),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
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
    mediaTypeHint?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { creativeId, driveUrl, adAccountId, storeId, mediaTypeHint } = body;

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
    const absoluteSourceUrl = toAbsoluteUrl(driveUrl, request.url);

    let googleDriveFolderUsed = false;
    let googleDriveAuthAttempted = false;
    let downloadUrl = maybeProxyGoogleDriveUrl(
      toDirectDriveUrl(absoluteSourceUrl),
      storeId,
      request.url,
    );

    if (isGoogleDriveFolderUrl(absoluteSourceUrl)) {
      googleDriveFolderUsed = true;
      const folderId = extractGoogleDriveFolderId(absoluteSourceUrl);
      if (!folderId) {
        return NextResponse.json(
          { error: 'Invalid Google Drive folder URL.' },
          { status: 422 }
        );
      }

      googleDriveAuthAttempted = true;
      const driveToken = await getGoogleDriveToken(storeId);
      if (!driveToken) {
        return NextResponse.json(
          {
            error:
              'Google Drive is not connected for this store. Please connect Google Drive to launch creatives from folder links.',
          },
          { status: 422 }
        );
      }

      const mediaFileId = await resolveDriveMediaFileId(driveToken.accessToken, folderId);
      if (!mediaFileId) {
        return NextResponse.json(
          {
            error:
              'No image/video file found inside the linked Google Drive folder.',
          },
          { status: 422 }
        );
      }

      downloadUrl = new URL(
        `/api/google-drive/content?storeId=${encodeURIComponent(storeId)}&fileId=${encodeURIComponent(
          mediaFileId,
        )}&mode=content&download=1`,
        request.url,
      ).toString();
    }
    const { response: fileRes, diagnostics } = await fetchSourceFile({
      creativeId,
      sourceUrl: absoluteSourceUrl,
      downloadUrl,
      storeId,
      requestCookie: request.headers.get('cookie'),
      googleDriveFolderUsed,
      googleDriveAuthAttempted: googleDriveAuthAttempted || usesGoogleDriveProxy(downloadUrl),
    });

    if (!fileRes.ok) {
      console.warn('[creative-hub] source media download failed', {
        creativeId,
        status: fileRes.status,
        diagnostics,
      });
      return NextResponse.json(
        {
          error: `Failed to download file: HTTP ${fileRes.status}`,
          diagnostics,
        },
        { status: 422 }
      );
    }

    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
    const contentType = fileRes.headers.get('content-type');
    const fileName =
      filenameFromContentDisposition(fileRes.headers.get('content-disposition')) ||
      filenameFromUrl(fileRes.url || driveUrl) ||
      filenameFromUrl(driveUrl) ||
      `${creativeId || 'creative'}`;
    const mediaType = detectMediaType(contentType, fileRes.url || driveUrl, fileName, fileBuffer, mediaTypeHint);

    if (!mediaType) {
      return NextResponse.json(
        {
          error:
            'Could not determine file type. Must be an image or video. Please ensure the source is a direct media file URL.',
        },
        { status: 422 }
      );
    }
    const maxSize = mediaType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;

    if (fileBuffer.byteLength > maxSize) {
      const limitMb = Math.round(maxSize / (1024 * 1024));
      return NextResponse.json(
        { error: `File too large (${limitMb} MB limit for ${mediaType}s)` },
        { status: 422 }
      );
    }

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

    // Video upload. If Meta rejects the source codec/container, normalize it
    // to a conservative H.264/AAC MP4 and retry once.
    let metaRes = await uploadVideoToMeta(
      tokenData.accessToken,
      accountNode,
      fileBuffer,
      fileName,
      contentType,
    );

    if (!metaRes.ok) {
      const msg = await parseGraphError(metaRes);
      if (isUnsupportedVideoFormatMetaError(msg)) {
        try {
          const normalized = await transcodeVideoForMeta(fileBuffer, fileName);
          metaRes = await uploadVideoToMeta(
            tokenData.accessToken,
            accountNode,
            normalized.buffer,
            normalized.fileName,
            'video/mp4',
          );
          if (metaRes.ok) {
            const metaBody = (await metaRes.json()) as { id?: string };
            const videoId = metaBody.id;

            if (!videoId) {
              return NextResponse.json(
                { error: 'Meta did not return a video ID after transcoding' },
                { status: 500 }
              );
            }

            return NextResponse.json({
              creativeId,
              metaAssetId: videoId,
              metaAssetType: 'VIDEO' as const,
              videoProcessing: true,
              normalizedForMeta: true,
            });
          }

          const retryMsg = await parseGraphError(metaRes);
          return NextResponse.json({ error: `${msg} | retry_after_transcode=${retryMsg}` }, { status: 500 });
        } catch (transcodeErr) {
          const transcodeMessage = transcodeErr instanceof Error ? transcodeErr.message : String(transcodeErr);
          return NextResponse.json(
            { error: `${msg} | transcode_failed=${transcodeMessage}` },
            { status: 500 },
          );
        }
      }
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
