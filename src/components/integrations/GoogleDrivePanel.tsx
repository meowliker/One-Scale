'use client';

import { useState, useMemo } from 'react';
import {
  ChevronRight,
  Folder,
  Image,
  Video,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GoogleDriveFile } from '@/types/integrations';

interface GoogleDrivePanelProps {
  files: GoogleDriveFile[];
  onUseAsCreative: (file: GoogleDriveFile) => void;
}

export function GoogleDrivePanel({ files, onUseAsCreative }: GoogleDrivePanelProps) {
  const [currentPath, setCurrentPath] = useState('/Ad Creatives');

  // Derive unique folders from the root
  const currentItems = useMemo(() => {
    return files.filter((f) => f.folderPath === currentPath);
  }, [files, currentPath]);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    const crumbs: { label: string; path: string }[] = [];
    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      crumbs.push({ label: part, path: accumulated });
    }
    return crumbs;
  }, [currentPath]);

  const parentPath = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    if (parts.length <= 1) return null;
    return '/' + parts.slice(0, -1).join('/');
  }, [currentPath]);

  const handleFolderClick = (folder: GoogleDriveFile) => {
    setCurrentPath(folder.folderPath + '/' + folder.name);
  };

  const fileTypeIcon = (type: GoogleDriveFile['type']) => {
    switch (type) {
      case 'folder':
        return <Folder className="h-8 w-8 text-blue-400" />;
      case 'image':
        return <Image className="h-8 w-8 text-green-400" />;
      case 'video':
        return <Video className="h-8 w-8 text-pink-400" />;
      default:
        return <FileText className="h-8 w-8 text-gray-400" />;
    }
  };

  const typeBadgeClasses: Record<string, string> = {
    image: 'bg-green-50 text-green-700',
    video: 'bg-pink-50 text-pink-700',
    folder: 'bg-blue-50 text-blue-700',
  };

  return (
    <div className="space-y-4">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-1 text-sm">
        {parentPath && (
          <button
            onClick={() => setCurrentPath(parentPath)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        )}
        <div className="flex items-center gap-1">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-300" />}
              <button
                onClick={() => setCurrentPath(crumb.path)}
                className={cn(
                  'rounded px-1.5 py-0.5 text-sm transition-colors',
                  i === breadcrumbs.length - 1
                    ? 'font-medium text-gray-900'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                )}
              >
                {crumb.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* File Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {currentItems.map((file) => (
          <div
            key={file.id}
            className={cn(
              'group relative flex flex-col items-center rounded-lg border border-gray-200 bg-white p-4 transition-all hover:shadow-md',
              file.type === 'folder' && 'cursor-pointer hover:border-blue-300'
            )}
            onClick={() => {
              if (file.type === 'folder') handleFolderClick(file);
            }}
          >
            {/* Thumbnail / Icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-50">
              {fileTypeIcon(file.type)}
            </div>

            {/* File Info */}
            <div className="mt-3 w-full text-center">
              <p className="truncate text-xs font-medium text-gray-900" title={file.name}>
                {file.name}
              </p>
              <div className="mt-1 flex items-center justify-center gap-2">
                <span
                  className={cn(
                    'inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize',
                    typeBadgeClasses[file.type] || 'bg-gray-100 text-gray-600'
                  )}
                >
                  {file.type}
                </span>
                {file.type !== 'folder' && (
                  <span className="text-[10px] text-gray-400">{file.size}</span>
                )}
              </div>
              {file.type !== 'folder' && (
                <p className="mt-1 text-[10px] text-gray-400">
                  {new Date(file.modifiedAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
            </div>

            {/* Use as Creative Button (files only) */}
            {file.type !== 'folder' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUseAsCreative(file);
                }}
                className="mt-3 w-full rounded-md bg-blue-600 px-2 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-blue-700"
              >
                Use as Creative
              </button>
            )}
          </div>
        ))}
      </div>

      {currentItems.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
          No files found in this folder.
        </div>
      )}
    </div>
  );
}
