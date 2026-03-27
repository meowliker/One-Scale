import { NextRequest, NextResponse } from 'next/server';
import { getGoogleDriveToken } from '@/app/api/lib/tokens';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  thumbnailLink?: string;
  webViewLink?: string;
  webContentLink?: string;
  createdTime?: string;
  modifiedTime?: string;
}

interface DriveFilesResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

interface DriveFolderMeta {
  id: string;
  name: string;
  mimeType: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const folderId = searchParams.get('folderId') || 'root';
  const fileId = searchParams.get('fileId');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const tokenData = await getGoogleDriveToken(storeId);
  if (!tokenData) {
    return NextResponse.json(
      { error: 'Google Drive not connected or token expired. Please reconnect.' },
      { status: 401 }
    );
  }

  const authHeader = { Authorization: `Bearer ${tokenData.accessToken}` };

  try {
    // Single file detail mode
    if (fileId) {
      const fileRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime`,
        { headers: authHeader }
      );

      if (!fileRes.ok) {
        const errBody = await fileRes.text();
        return NextResponse.json(
          { error: `Failed to fetch file: ${errBody}` },
          { status: fileRes.status }
        );
      }

      const file: GoogleDriveFile = await fileRes.json();
      return NextResponse.json({ file });
    }

    // List files in folder
    const q = `'${folderId}' in parents and trashed=false`;
    const fields = 'files(id,name,mimeType,size,thumbnailLink,webViewLink,webContentLink,createdTime,modifiedTime),nextPageToken';

    const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
    listUrl.searchParams.set('q', q);
    listUrl.searchParams.set('fields', fields);
    listUrl.searchParams.set('orderBy', 'name');
    listUrl.searchParams.set('pageSize', '100');

    const listRes = await fetch(listUrl.toString(), { headers: authHeader });

    if (!listRes.ok) {
      const errBody = await listRes.text();
      return NextResponse.json(
        { error: `Failed to list files: ${errBody}` },
        { status: listRes.status }
      );
    }

    const data: DriveFilesResponse = await listRes.json();

    // Optionally fetch folder name for display
    let folderName: string | undefined;
    if (folderId !== 'root') {
      try {
        const folderRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`,
          { headers: authHeader }
        );
        if (folderRes.ok) {
          const folderMeta: DriveFolderMeta = await folderRes.json();
          folderName = folderMeta.name;
        }
      } catch {
        // Non-critical — skip folder name
      }
    }

    return NextResponse.json({
      files: data.files ?? [],
      folderName,
      nextPageToken: data.nextPageToken,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
