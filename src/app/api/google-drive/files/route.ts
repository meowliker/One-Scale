import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';
import {
  fetchDriveFolderMeta,
  fetchDriveFileMetadata,
  GoogleDriveNormalizedFile,
  GoogleDriveRequestError,
  listDriveChildren,
  normalizeDriveFile,
} from '../shared';

export type GoogleDriveFile = GoogleDriveNormalizedFile;

interface DriveListingPayload {
  files: GoogleDriveFile[];
  items: GoogleDriveFile[];
  nextPageToken?: string;
  folderName?: string;
  folder?: {
    id: string;
    name: string;
    mimeType: string;
  } | null;
  recursive: boolean;
}

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseDepth(value: string | null): number {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed < 0) return 20;
  return Math.min(parsed, 50);
}

async function collectFolderItems(args: {
  token: string;
  storeId: string;
  folderId: string;
  folderPath: string;
  depth: number;
  recursive: boolean;
  includeFolders: boolean;
  maxDepth: number;
  seen: Set<string>;
}): Promise<GoogleDriveFile[]> {
  const {
    token,
    storeId,
    folderId,
    folderPath,
    depth,
    recursive,
    includeFolders,
    maxDepth,
    seen,
  } = args;

  const items: GoogleDriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const page = await listDriveChildren(token, folderId, pageToken);
    for (const rawFile of page.files || []) {
      const normalized = normalizeDriveFile(rawFile, storeId, {
        folderPath,
        depth,
        parentId: folderId === 'root' ? undefined : folderId,
      });

      if (!normalized.isFolder || includeFolders) {
        items.push(normalized);
      }

      if (
        recursive &&
        normalized.isFolder &&
        depth < maxDepth &&
        !seen.has(normalized.id)
      ) {
        seen.add(normalized.id);
        const childPath = folderPath ? `${folderPath}/${normalized.name}` : normalized.name;
        const childItems = await collectFolderItems({
          token,
          storeId,
          folderId: normalized.id,
          folderPath: childPath,
          depth: depth + 1,
          recursive,
          includeFolders,
          maxDepth,
          seen,
        });
        items.push(...childItems);
      }
    }
    pageToken = page.nextPageToken;
  } while (pageToken);

  return items;
}

async function listCurrentFolderItems(args: {
  token: string;
  storeId: string;
  folderId: string;
  folderPath: string;
  includeFolders: boolean;
}): Promise<{ items: GoogleDriveFile[]; nextPageToken?: string }> {
  const page = await listDriveChildren(args.token, args.folderId);
  return {
    items: (page.files || [])
      .map((rawFile) =>
        normalizeDriveFile(rawFile, args.storeId, {
          folderPath: args.folderPath,
          depth: 0,
          parentId: args.folderId === 'root' ? undefined : args.folderId,
        })
      )
      .filter((item) => args.includeFolders || !item.isFolder),
    nextPageToken: page.nextPageToken,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const folderId = searchParams.get('folderId') || 'root';
  const fileId = searchParams.get('fileId');
  const recursive = parseBoolean(searchParams.get('recursive') || searchParams.get('flatten'));
  const includeFolders = searchParams.get('includeFolders') !== 'false';
  const maxDepth = parseDepth(searchParams.get('maxDepth'));

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const tokenData = await getGoogleDriveToken(storeId);
  if (!tokenData) {
    return NextResponse.json(
      { error: 'Google Drive not connected or token expired. Please reconnect.' },
      { status: 401 },
    );
  }

  try {
    if (fileId) {
      const file = await fetchDriveFileMetadata(
        tokenData.accessToken,
        fileId,
        'id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime,parents,shortcutDetails(targetId,targetMimeType)',
      );

      if (!file) {
        return NextResponse.json(
          { error: 'Failed to fetch file' },
          { status: 404 },
        );
      }

      const normalized = normalizeDriveFile(file, storeId, {
        folderPath: '',
        depth: 0,
      });

      return NextResponse.json({ file: normalized });
    }

    const folderMeta =
      folderId === 'root'
        ? null
        : await fetchDriveFolderMeta(tokenData.accessToken, folderId);

    const folderPath = folderId === 'root' ? '' : folderMeta?.name || '';
    const currentFolder = recursive
      ? {
          items: await collectFolderItems({
            token: tokenData.accessToken,
            storeId,
            folderId,
            folderPath,
            depth: 0,
            recursive,
            includeFolders,
            maxDepth,
            seen: new Set<string>(folderId === 'root' ? [] : [folderId]),
          }),
          nextPageToken: undefined,
        }
      : await listCurrentFolderItems({
          token: tokenData.accessToken,
          storeId,
          folderId,
          folderPath,
          includeFolders,
        });

    const payload: DriveListingPayload = {
      files: currentFolder.items,
      items: currentFolder.items,
      nextPageToken: currentFolder.nextPageToken,
      folderName: folderId === 'root' ? undefined : folderMeta?.name,
      folder: folderMeta
        ? {
            id: folderMeta.id,
            name: folderMeta.name,
            mimeType: folderMeta.mimeType,
          }
        : null,
      recursive,
    };

    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof GoogleDriveRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
