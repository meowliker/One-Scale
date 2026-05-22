'use client';

import { useCallback, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  ExternalLink,
  Eye,
  FolderTree,
  Image as ImageIcon,
  Play,
  TestTube2,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreativeFormat, InboxCreative } from '@/types/creativeHub';
import type { BrowserMode } from '@/components/creative-hub/launch-center/CreativeLaunchStudioChrome';

interface SourceGroup {
  id: string;
  label: string;
  count: number;
  kind: 'task' | 'folder';
  assets: InboxCreative[];
  subtitle?: string;
  selectedCount: number;
}

function truncate(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isVideoCreative(creative: InboxCreative): boolean {
  return (
    creative.creativeFormat === 'video' ||
    creative.driveMimeType?.startsWith('video/') ||
    false
  );
}

function getThumbnailUrl(creative: InboxCreative): string | undefined {
  return creative.thumbnailUrl || creative.driveContentUrl || creative.drivePreviewUrl || creative.clickupAttachmentUrl;
}

function getCreativeSourceLabel(creative: InboxCreative): string {
  if (creative.sourceType === 'clickup_attachment') return 'ClickUp attachment';
  if (creative.driveSourceType === 'folder_item') return 'Drive folder item';
  if (creative.driveSourceType === 'folder') return 'Drive folder';
  if (creative.driveSourceType === 'file') return 'Drive file';
  if (creative.sourceType === 'drive_asset') return 'Drive asset';
  return 'ClickUp task';
}

function getCreativeCustomFieldCount(creative: InboxCreative): number {
  return creative.clickupCustomFields?.length || 0;
}

function getAssetUploadedAt(creative: InboxCreative): string | undefined {
  return creative.uploadedAt || creative.driveCreatedAt || creative.clickupCreatedAt;
}

function formatAssetDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getFormatClasses(format: CreativeFormat): string {
  switch (format) {
    case 'video':
      return 'bg-rose-50 text-rose-700 ring-rose-200';
    case 'image':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'carousel':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-slate-50 text-slate-700 ring-slate-200';
  }
}

function getPastResultClasses(status?: string): string {
  switch (status) {
    case 'winner':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'killed':
      return 'bg-slate-100 text-slate-600 ring-slate-200';
    case 'inconclusive':
      return 'bg-amber-50 text-amber-700 ring-amber-200';
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-200';
  }
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function CollectionButton({
  group,
  active,
  onClick,
}: {
  group: SourceGroup;
  active: boolean;
  onClick: () => void;
}) {
  const showSubtitle = Boolean(group.subtitle && group.subtitle.trim() && group.subtitle !== group.label);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-[14px] border px-3 py-2 text-left transition-all',
        active
          ? 'border-slate-900 bg-slate-950 text-white shadow-[0_12px_22px_rgba(15,23,42,0.14)]'
          : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50',
      )}
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                active ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {group.kind}
            </span>
          </div>
          <p className="mt-1 whitespace-normal break-words text-[13px] font-semibold leading-5">
            {group.label}
          </p>
          {showSubtitle ? (
            <p
              className={cn(
                'mt-0.5 whitespace-normal break-words text-[11px] leading-4',
                active ? 'text-slate-300' : 'text-slate-500',
              )}
            >
              {group.subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 md:justify-end">
          <span
            className={cn(
              'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold',
              active ? 'bg-white/14 text-white' : 'bg-slate-100 text-slate-700',
            )}
          >
            {group.count}
          </span>
          <span
            className={cn(
              'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap',
              active ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600',
            )}
          >
            {group.selectedCount}/{group.count} selected
          </span>
        </div>
      </div>
    </button>
  );
}

export function SourceRail({
  browserMode,
  setBrowserMode,
  activeGroupId,
  setActiveGroupId,
  taskGroups,
  folderGroups,
  totalAssets,
  selectedCount,
  driveConnected,
}: {
  browserMode: BrowserMode;
  setBrowserMode: (value: BrowserMode) => void;
  activeGroupId: string | null;
  setActiveGroupId: (value: string | null) => void;
  taskGroups: SourceGroup[];
  folderGroups: SourceGroup[];
  totalAssets: number;
  selectedCount: number;
  driveConnected: boolean;
}) {
  const browserModes: Array<{ id: BrowserMode; label: string }> = [
    { id: 'all_assets', label: 'All Assets' },
    { id: 'by_task', label: 'By Task' },
    { id: 'by_folder', label: 'By Folder' },
  ];

  const visibleGroups = browserMode === 'by_folder' ? folderGroups : taskGroups;

  return (
    <div className="border-r border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] lg:sticky lg:top-[96px] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto">
      <div className="space-y-3 border-b border-slate-200 px-4 py-4">
        <div className="rounded-[16px] border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                Finder browser
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">Task, folder, and asset structure</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-600">
              <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200">{totalAssets}</span>
              <span className="rounded-full bg-slate-50 px-2.5 py-1 ring-1 ring-slate-200">{selectedCount} selected</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-slate-700 ring-1 ring-slate-200">
              Drive {driveConnected ? 'connected' : 'fallback'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5 rounded-[14px] border border-slate-200 bg-slate-50 p-1">
          {browserModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                setBrowserMode(mode.id);
                if (mode.id === 'all_assets') {
                  setActiveGroupId(null);
                } else {
                  const nextGroups = mode.id === 'by_folder' ? folderGroups : taskGroups;
                  setActiveGroupId(nextGroups[0]?.id || null);
                }
              }}
              className={cn(
                'rounded-[12px] px-3 py-2 text-xs font-semibold transition-all',
                browserMode === mode.id
                  ? 'bg-slate-900 text-white shadow-[0_8px_16px_rgba(15,23,42,0.14)]'
                  : 'bg-transparent text-slate-600 hover:bg-slate-50',
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 pb-10">
        {browserMode === 'all_assets' ? (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <TestTube2 className="h-3.5 w-3.5" />
                Task list
              </div>
              <div className="space-y-2">
                {taskGroups.map((group) => (
                  <CollectionButton
                    key={group.id}
                    group={group}
                    active={false}
                    onClick={() => {
                      setBrowserMode('by_task');
                      setActiveGroupId(group.id);
                    }}
                  />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <FolderTree className="h-3.5 w-3.5" />
                Drive folders
              </div>
              {folderGroups.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-slate-200 bg-white px-4 py-5 text-center text-sm text-slate-500">
                  No folder groups found yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {folderGroups.map((group) => (
                    <CollectionButton
                      key={group.id}
                      group={group}
                      active={false}
                      onClick={() => {
                        setBrowserMode('by_folder');
                        setActiveGroupId(group.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map((group) => (
              <CollectionButton
                key={group.id}
                group={group}
                active={activeGroupId === group.id}
                onClick={() => setActiveGroupId(group.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompactAssetCard(props: {
  creative: InboxCreative;
  selected: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onPreview: () => void;
  onBrowseFolder?: () => void;
}) {
  const { creative, selected, focused, onToggle, onFocus, onPreview, onBrowseFolder } = props;
  const previewUrl = getThumbnailUrl(creative);
  const hasVideo = isVideoCreative(creative);
  const uploadedLabel = formatAssetDate(getAssetUploadedAt(creative));
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (!hasVideo || !previewVideoRef.current) return;
    void previewVideoRef.current.play().catch(() => undefined);
  }, [hasVideo]);

  const handleMouseLeave = useCallback(() => {
    if (!previewVideoRef.current) return;
    previewVideoRef.current.pause();
    previewVideoRef.current.currentTime = 0;
  }, []);

  return (
    <div
      onClick={onFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'cursor-pointer overflow-hidden rounded-[14px] border bg-white text-left transition-all shadow-[0_8px_18px_rgba(15,23,42,0.04)]',
        focused || selected
          ? 'border-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.10)]'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="relative aspect-[5/4] bg-slate-100">
        {previewUrl && hasVideo ? (
          <video
            ref={previewVideoRef}
            src={previewUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : previewUrl ? (
          <img src={previewUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {hasVideo ? <Video className="h-5 w-5 text-slate-400" /> : <ImageIcon className="h-5 w-5 text-slate-400" />}
          </div>
        )}
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className={cn(
            'absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm',
            selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/80 bg-white/95 text-slate-700',
          )}
        >
          {selected ? <Check className="h-4 w-4" /> : <span className="h-3 w-3 rounded-full border border-current" />}
        </button>
        {hasVideo ? (
          <div className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-sm">
            <Play className="h-3.5 w-3.5 fill-current" />
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5 p-2">
        <p className="whitespace-normal break-words text-[13px] font-semibold leading-4 text-slate-900">
          {creative.clickupTaskName}
        </p>
        <p className="line-clamp-1 whitespace-normal break-words text-[11px] leading-4 text-slate-500">
          {creative.creativeName}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase ring-1', getFormatClasses(creative.creativeFormat))}>
            {creative.creativeFormat}
          </span>
          {uploadedLabel ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
              {uploadedLabel}
            </span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
            {getCreativeCustomFieldCount(creative)} fields
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onPreview();
            }}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
          >
            Preview
          </button>
          {onBrowseFolder ? (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onBrowseFolder();
              }}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
            >
              Folder
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function AssetCard({
  creative,
  selected,
  focused,
  onToggle,
  onFocus,
  onPreview,
  onBrowseFolder,
}: {
  creative: InboxCreative;
  selected: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onPreview: () => void;
  onBrowseFolder?: () => void;
}) {
  const previewUrl = getThumbnailUrl(creative);
  const hasVideo = isVideoCreative(creative);
  const resultStatus = creative.pastTestResult?.status;
  const customFieldCount = getCreativeCustomFieldCount(creative);
  const uploadedLabel = formatAssetDate(getAssetUploadedAt(creative));
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (!hasVideo || !previewVideoRef.current) return;
    void previewVideoRef.current.play().catch(() => undefined);
  }, [hasVideo]);

  const handleMouseLeave = useCallback(() => {
    if (!previewVideoRef.current) return;
    previewVideoRef.current.pause();
    previewVideoRef.current.currentTime = 0;
  }, []);

  return (
    <motion.div
      layout
      whileHover={{ y: -2 }}
      onClick={onFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'group cursor-pointer overflow-hidden rounded-[16px] border bg-white shadow-[0_8px_20px_rgba(15,23,42,0.05)] transition-all',
        selected || focused
          ? 'border-slate-900 shadow-[0_12px_28px_rgba(15,23,42,0.10)]'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-[radial-gradient(circle_at_top,#f8fafc_0%,#eef2f7_55%,#e2e8f0_100%)]">
        {previewUrl && hasVideo ? (
          <video
            ref={previewVideoRef}
            src={previewUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
        ) : previewUrl ? (
          <img src={previewUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {hasVideo ? (
              <Video className="h-10 w-10 text-slate-500" />
            ) : (
              <ImageIcon className="h-10 w-10 text-slate-500" />
            )}
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <button
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur',
              selected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-white/70 bg-white/80 text-slate-700 hover:bg-white',
            )}
          >
            {selected ? <Check className="h-4 w-4" /> : <span className="h-3 w-3 rounded-full border border-current" />}
          </button>

          <div className="flex items-center gap-2">
            {hasVideo ? (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-slate-950/65 text-white backdrop-blur">
                <Play className="h-3.5 w-3.5 fill-current" />
              </div>
            ) : null}
            <button
              onClick={(event) => {
                event.stopPropagation();
                onPreview();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70 bg-white/80 text-slate-700 shadow-sm backdrop-blur hover:bg-white"
            >
              <Eye className="h-4 w-4" />
            </button>
            {onBrowseFolder && creative.driveFolderId ? (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onBrowseFolder();
                }}
                className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[10px] font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
              >
                <FolderTree className="h-3.5 w-3.5" />
                Folder
              </button>
            ) : null}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-transparent px-3 pb-3 pt-10 text-white">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase ring-1', getFormatClasses(creative.creativeFormat))}>
                {creative.creativeFormat}
              </span>
              {resultStatus ? (
                <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase ring-1', getPastResultClasses(resultStatus))}>
                  {resultStatus}
                </span>
              ) : null}
              <span className="rounded-full bg-white/12 px-2 py-1 text-[10px] font-semibold uppercase ring-1 ring-white/10">
                {getCreativeSourceLabel(creative)}
              </span>
            </div>
            {uploadedLabel ? (
              <p className="mt-1 text-[10px] font-medium text-white/80">Uploaded {uploadedLabel}</p>
            ) : null}
            <p className="mt-1 truncate text-[13px] font-semibold">{creative.clickupTaskName}</p>
            <p className="mt-0.5 truncate text-[11px] text-white/70">
              {creative.driveParentFolderName || creative.clickupListName || 'Creative source'}
            </p>
          </div>

          {creative.driveUrl ? (
            <a
              href={creative.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-white/20 bg-white/10 p-2 text-white/90 hover:bg-white/20"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 p-2.5">
        <div>
          <h4 className="line-clamp-2 text-[13px] font-semibold text-slate-900">
            {creative.creativeName}
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">{creative.clickupTaskName}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {creative.hook ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">
              Hook: {truncate(creative.hook, 22)}
            </span>
          ) : null}
          {creative.angle ? (
            <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
              Angle: {truncate(creative.angle, 22)}
            </span>
          ) : null}
          {creative.creator ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-700">
              {creative.creator}
            </span>
          ) : null}
          {customFieldCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">
              {customFieldCount} fields
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
            {creative.alreadyTested ? 'Previously tested' : 'Untested'}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
            {creative.driveParentFolderName || 'Direct asset'}
          </span>
          {uploadedLabel ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
              Uploaded {uploadedLabel}
            </span>
          ) : null}
          {creative.pastTestResult?.status ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
              {creative.pastTestResult.status}
            </span>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
