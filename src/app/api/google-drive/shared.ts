export const GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export type GoogleDriveProxyMode = 'content' | 'thumbnail';

export interface GoogleDriveApiFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
  };
}

export interface GoogleDriveNormalizedFile extends GoogleDriveApiFile {
  isFolder: boolean;
  parentId?: string;
  folderPath: string;
  depth: number;
  thumbnailUrl?: string;
  previewUrl?: string;
  contentUrl?: string;
}

export interface GoogleDriveListResponse {
  files: GoogleDriveApiFile[];
  nextPageToken?: string;
}

export interface GoogleDriveFolderMeta {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

export const GOOGLE_DRIVE_BASE_URL = 'https://www.googleapis.com/drive/v3';

export class GoogleDriveRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GoogleDriveRequestError';
    this.status = status;
  }
}

export function isGoogleDriveFolder(file: Pick<GoogleDriveApiFile, 'mimeType'>): boolean {
  return file.mimeType === GOOGLE_DRIVE_FOLDER_MIME;
}

export function buildDriveProxyUrl(
  storeId: string,
  fileId: string,
  mode: GoogleDriveProxyMode = 'content',
): string {
  const params = new URLSearchParams({ storeId, fileId, mode });
  return `/api/google-drive/content?${params.toString()}`;
}

export function normalizeDriveFile(
  file: GoogleDriveApiFile,
  storeId: string,
  opts: {
    folderPath: string;
    depth: number;
    parentId?: string;
  },
): GoogleDriveNormalizedFile {
  const isFolder = isGoogleDriveFolder(file);
  const contentUrl = isFolder ? undefined : buildDriveProxyUrl(storeId, file.id, 'content');
  const thumbnailUrl = isFolder ? undefined : buildDriveProxyUrl(storeId, file.id, 'thumbnail');

  return {
    ...file,
    isFolder,
    parentId: opts.parentId || file.parents?.[0],
    folderPath: opts.folderPath,
    depth: opts.depth,
    thumbnailUrl,
    previewUrl: isFolder ? file.webViewLink : contentUrl,
    contentUrl,
  };
}

export async function fetchDriveFileMetadata(
  token: string,
  fileId: string,
  fields:
    | string
    | 'id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime,parents,shortcutDetails(targetId,targetMimeType)',
): Promise<GoogleDriveApiFile> {
  const url = new URL(`${GOOGLE_DRIVE_BASE_URL}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', fields);
  url.searchParams.set('supportsAllDrives', 'true');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new GoogleDriveRequestError(
      errBody || `Failed to fetch file (${res.status})`,
      res.status,
    );
  }

  return (await res.json()) as GoogleDriveApiFile;
}

export async function fetchDriveFolderMeta(
  token: string,
  folderId: string,
): Promise<GoogleDriveFolderMeta> {
  const meta = await fetchDriveFileMetadata(
    token,
    folderId,
    'id,name,mimeType,parents',
  );

  return meta as GoogleDriveFolderMeta;
}

export async function listDriveChildren(
  token: string,
  folderId: string,
  pageToken?: string,
): Promise<GoogleDriveListResponse> {
  const url = new URL(`${GOOGLE_DRIVE_BASE_URL}/files`);
  url.searchParams.set('q', `'${folderId}' in parents and trashed=false`);
  url.searchParams.set(
    'fields',
    'nextPageToken,files(id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime,parents,shortcutDetails(targetId,targetMimeType))',
  );
  url.searchParams.set('orderBy', 'folder,name');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  url.searchParams.set('corpora', 'allDrives');
  if (pageToken) {
    url.searchParams.set('pageToken', pageToken);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new GoogleDriveRequestError(
      errBody || `Failed to list folder ${folderId}`,
      res.status,
    );
  }

  return (await res.json()) as GoogleDriveListResponse;
}
