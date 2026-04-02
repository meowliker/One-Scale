import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatClickUpFieldValue,
  getClickUpFieldHref,
} from '@/lib/creative-hub/clickupFieldFormatting';
import type {
  CreativeFormat,
  InboxCreative,
} from '@/types/creativeHub';
import type { BrowserMode } from '@/components/creative-hub/launch-center/CreativeLaunchStudioChrome';

type TestedFilter = 'all' | 'untested' | 'winner' | 'tested';
type SortMode = 'recommended' | 'name' | 'format' | 'tested';
type SelectionSourceChip =
  | 'all'
  | 'tasks'
  | 'folders'
  | 'untested'
  | 'testing'
  | 'winners'
  | 'fresh'
  | 'images'
  | 'videos';

interface SourceGroup {
  id: string;
  label: string;
  count: number;
  kind: 'task' | 'folder';
  assets: InboxCreative[];
  subtitle?: string;
  selectedCount: number;
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] shadow-[0_18px_42px_rgba(148,163,184,0.16)] backdrop-blur">
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

export function isVideoCreative(creative: InboxCreative): boolean {
  return creative.creativeFormat === 'video' || creative.driveMimeType?.startsWith('video/') || false;
}

export function getPreviewUrl(creative: InboxCreative): string | undefined {
  return (
    creative.driveContentUrl ||
    creative.drivePreviewUrl ||
    creative.thumbnailUrl ||
    creative.driveUrl ||
    undefined
  );
}

function getThumbnailUrl(creative: InboxCreative): string | undefined {
  return creative.thumbnailUrl || creative.driveContentUrl || creative.drivePreviewUrl;
}

function getCreativeSourceLabel(creative: InboxCreative): string {
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

function getAssetUpdatedAt(creative: InboxCreative): string | undefined {
  return creative.driveModifiedAt || creative.clickupUpdatedAt;
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

function buildSourceGroups(
  creatives: InboxCreative[],
  selectedIds: Set<string>,
  kind: SourceGroup['kind'],
): SourceGroup[] {
  const map = new Map<string, SourceGroup>();

  for (const creative of creatives) {
    const groupId =
      kind === 'task'
        ? creative.clickupTaskId
        : creative.driveFolderId ||
          creative.driveParentFolderName ||
          `${creative.clickupTaskId}-ungrouped`;

    const label =
      kind === 'task'
        ? creative.clickupTaskName
        : creative.driveParentFolderName || creative.clickupTaskName;

    if (!map.has(groupId)) {
      map.set(groupId, {
        id: groupId,
        label,
        count: 0,
        kind,
        assets: [],
        subtitle:
          kind === 'folder'
            ? creative.clickupTaskName
            : creative.clickupListName || creative.clickupTaskStatus,
        selectedCount: 0,
      });
    }

    const group = map.get(groupId);
    if (!group) continue;
    group.assets.push(creative);
    group.count += 1;
    if (selectedIds.has(creative.id)) group.selectedCount += 1;
  }

  return [...map.values()].sort((a, b) => {
    if (b.selectedCount !== a.selectedCount) return b.selectedCount - a.selectedCount;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

function matchesSearch(creative: InboxCreative, query: string): boolean {
  if (!query) return true;
  const haystack = [
    creative.creativeName,
    creative.hook,
    creative.angle,
    creative.creator,
    creative.clickupTaskName,
    creative.clickupDescription,
    creative.driveParentFolderName,
    ...(creative.clickupTags || []),
    ...(creative.clickupCustomFields || []).map((field) => `${field.name} ${field.value}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function filterAssets(args: {
  assets: InboxCreative[];
  search: string;
  formatFilter: CreativeFormat | 'all';
  testedFilter: TestedFilter;
  sortMode: SortMode;
  selectedIds: Set<string>;
}): InboxCreative[] {
  const { assets, search, formatFilter, testedFilter, sortMode, selectedIds } = args;

  const filtered = assets.filter((creative) => {
    if (!matchesSearch(creative, search)) return false;
    if (formatFilter !== 'all' && creative.creativeFormat !== formatFilter) return false;
    if (testedFilter === 'untested' && creative.alreadyTested) return false;
    if (testedFilter === 'winner' && creative.pastTestResult?.status !== 'winner') return false;
    if (testedFilter === 'tested' && !creative.alreadyTested) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sortMode === 'name') return a.creativeName.localeCompare(b.creativeName);
    if (sortMode === 'format') {
      if (a.creativeFormat !== b.creativeFormat) return a.creativeFormat.localeCompare(b.creativeFormat);
      return a.creativeName.localeCompare(b.creativeName);
    }
    if (sortMode === 'tested') {
      const score = (creative: InboxCreative) => {
        if (creative.pastTestResult?.status === 'winner') return 3;
        if (creative.alreadyTested) return 2;
        return 1;
      };
      return score(b) - score(a) || a.creativeName.localeCompare(b.creativeName);
    }

    const score = (creative: InboxCreative) => {
      let value = 0;
      if (selectedIds.has(creative.id)) value += 20;
      if (creative.pastTestResult?.status === 'winner') value += 10;
      else if (!creative.alreadyTested) value += 7;
      if (creative.sourceType === 'drive_asset') value += 2;
      if (creative.hook) value += 1;
      if (creative.angle) value += 1;
      return value;
    };

    return score(b) - score(a) || a.creativeName.localeCompare(b.creativeName);
  });
}

function matchesFacet(creative: InboxCreative, facetId: string | null): boolean {
  if (!facetId) return true;
  return (creative.clickupCustomFields || []).some((field) => {
    if (field.hasValue === false) return false;
    const value = formatClickUpFieldValue(field).trim();
    return `${field.name}::${value}`.toLowerCase() === facetId;
  });
}

function applyStudioFilters(args: {
  assets: InboxCreative[];
  search: string;
  formatFilter: CreativeFormat | 'all';
  testedFilter: TestedFilter;
  sortMode: SortMode;
  selectedIds: Set<string>;
  sourceChip: SelectionSourceChip;
  activeFacetId: string | null;
}): InboxCreative[] {
  const { assets, search, formatFilter, testedFilter, sortMode, selectedIds, sourceChip, activeFacetId } = args;

  let nextAssets = filterAssets({
    assets,
    search,
    formatFilter,
    testedFilter,
    sortMode,
    selectedIds,
  });

  if (sourceChip === 'testing') {
    nextAssets = nextAssets.filter(
      (creative) => creative.alreadyTested && creative.pastTestResult?.status !== 'winner',
    );
  }

  if (sourceChip === 'fresh') {
    nextAssets = [...nextAssets]
      .sort((a, b) => {
        const aTime = new Date(getAssetUploadedAt(a) || 0).getTime();
        const bTime = new Date(getAssetUploadedAt(b) || 0).getTime();
        return bTime - aTime;
      })
      .slice(0, 24);
  }

  if (activeFacetId) {
    nextAssets = nextAssets.filter((creative) => matchesFacet(creative, activeFacetId));
  }

  return nextAssets;
}

export function AssetListRow({
  creative,
  selected,
  focused,
  onToggle,
  onFocus,
  onPreview,
}: {
  creative: InboxCreative;
  selected: boolean;
  focused: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onPreview: () => void;
}) {
  const previewUrl = getThumbnailUrl(creative);
  const uploadedLabel = formatAssetDate(getAssetUploadedAt(creative));
  const description =
    creative.clickupDescription ||
    creative.hook ||
    creative.angle ||
    creative.driveParentFolderName ||
    creative.clickupListName ||
    'No task description';

  return (
    <div
      onClick={onFocus}
      className={cn(
        'grid cursor-pointer gap-2.5 rounded-[14px] border bg-white p-2 transition-all lg:grid-cols-[64px_minmax(0,1.15fr)_minmax(180px,0.9fr)_auto]',
        focused || selected
          ? 'border-[#8c7bff] shadow-[0_14px_28px_rgba(124,108,255,0.12)]'
          : 'border-slate-200 hover:border-slate-300',
      )}
    >
      <div className="relative overflow-hidden rounded-[12px] bg-slate-100">
        <div className="aspect-square">
          {previewUrl ? (
            <img src={previewUrl} alt={creative.creativeName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              {isVideoCreative(creative) ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-1 text-[10px] font-semibold uppercase ring-1', getFormatClasses(creative.creativeFormat))}>
            {creative.creativeFormat}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {creative.alreadyTested ? 'Tested' : 'Untested'}
          </span>
          {uploadedLabel ? (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
              Uploaded {uploadedLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-1 break-words text-[13px] font-semibold leading-5 text-slate-950">
          {creative.clickupTaskName}
        </p>
        <p className="mt-0.5 break-words text-[13px] text-slate-500">{creative.creativeName}</p>
      </div>

      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-[13px] leading-5 text-slate-600">{description}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {creative.creator ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
              {creative.creator}
            </span>
          ) : null}
          {creative.hook ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
              Hook
            </span>
          ) : null}
          {creative.angle ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
              Angle
            </span>
          ) : null}
          {getCreativeCustomFieldCount(creative) > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
              {getCreativeCustomFieldCount(creative)} fields
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-end gap-2">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
            selected ? 'bg-[#8c7bff] text-white' : 'bg-slate-900 text-white hover:bg-slate-800',
          )}
        >
          {selected ? 'Selected' : 'Select'}
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onPreview();
          }}
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Preview
        </button>
      </div>
    </div>
  );
}

export function ColumnBrowserPanel({
  browserMode,
  taskGroups,
  folderGroups,
  activeGroupId,
  selectedIds,
  search,
  formatFilter,
  testedFilter,
  sortMode,
  sourceChip,
  activeFacetId,
  focusedCreative,
  onChangeGrouping,
  onSelectPrimaryGroup,
  onToggle,
  onFocus,
  onPreview,
}: {
  browserMode: BrowserMode;
  taskGroups: SourceGroup[];
  folderGroups: SourceGroup[];
  activeGroupId: string | null;
  selectedIds: Set<string>;
  search: string;
  formatFilter: CreativeFormat | 'all';
  testedFilter: TestedFilter;
  sortMode: SortMode;
  sourceChip: SelectionSourceChip;
  activeFacetId: string | null;
  focusedCreative: InboxCreative | null;
  onChangeGrouping: (kind: SourceGroup['kind']) => void;
  onSelectPrimaryGroup: (groupId: string) => void;
  onToggle: (creativeId: string) => void;
  onFocus: (creativeId: string) => void;
  onPreview: (creative: InboxCreative) => void;
}) {
  const primaryKind: SourceGroup['kind'] =
    browserMode === 'by_folder' || sourceChip === 'folders' ? 'folder' : 'task';
  const primaryGroups = primaryKind === 'folder' ? folderGroups : taskGroups;
  const activePrimaryGroup =
    primaryGroups.find((group) => group.id === activeGroupId) || primaryGroups[0] || null;
  const secondaryKind: SourceGroup['kind'] = primaryKind === 'task' ? 'folder' : 'task';
  const [activeSecondaryGroupId, setActiveSecondaryGroupId] = useState<string>('all');

  useEffect(() => {
    setActiveSecondaryGroupId('all');
  }, [activePrimaryGroup?.id, primaryKind]);

  const secondaryGroups = useMemo(() => {
    if (!activePrimaryGroup) return [];
    const baseAssets =
      secondaryKind === 'folder'
        ? activePrimaryGroup.assets.filter(
            (creative) => !!creative.driveFolderId || !!creative.driveParentFolderName,
          )
        : activePrimaryGroup.assets;
    return buildSourceGroups(baseAssets, selectedIds, secondaryKind);
  }, [activePrimaryGroup, secondaryKind, selectedIds]);

  const scopedAssets = useMemo(() => {
    if (!activePrimaryGroup) return [];
    if (activeSecondaryGroupId === 'all') return activePrimaryGroup.assets;
    return secondaryGroups.find((group) => group.id === activeSecondaryGroupId)?.assets || [];
  }, [activePrimaryGroup, activeSecondaryGroupId, secondaryGroups]);

  const columnAssets = useMemo(
    () =>
      applyStudioFilters({
        assets: scopedAssets,
        search,
        formatFilter,
        testedFilter,
        sortMode,
        selectedIds,
        sourceChip,
        activeFacetId,
      }),
    [
      activeFacetId,
      formatFilter,
      scopedAssets,
      search,
      selectedIds,
      sortMode,
      sourceChip,
      testedFilter,
    ],
  );

  return (
    <div className="grid gap-3 xl:grid-cols-[220px_220px_minmax(0,1fr)]">
      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-2.5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Collections</p>
            <p className="mt-1 text-xs text-slate-500">Pick the main task or folder first.</p>
          </div>
          <div className="flex rounded-full bg-white p-1 ring-1 ring-slate-200">
            <button
              onClick={() => onChangeGrouping('task')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
                primaryKind === 'task' ? 'bg-slate-900 text-white' : 'text-slate-600',
              )}
            >
              Tasks
            </button>
            <button
              onClick={() => onChangeGrouping('folder')}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
                primaryKind === 'folder' ? 'bg-slate-900 text-white' : 'text-slate-600',
              )}
            >
              Folders
            </button>
          </div>
        </div>

        <div className="space-y-2">
          {primaryGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => onSelectPrimaryGroup(group.id)}
              className={cn(
                'w-full rounded-[18px] border px-3 py-3 text-left transition-all',
                activePrimaryGroup?.id === group.id
                  ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_30px_rgba(15,23,42,0.16)]'
                  : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold leading-5">{group.label}</p>
                  {group.subtitle ? (
                    <p
                      className={cn(
                        'mt-1 break-words text-xs leading-5',
                        activePrimaryGroup?.id === group.id ? 'text-slate-300' : 'text-slate-500',
                      )}
                    >
                      {group.subtitle}
                    </p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    activePrimaryGroup?.id === group.id
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-700',
                  )}
                >
                  {group.count}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-2.5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-slate-900">
            {secondaryKind === 'folder' ? 'Folders inside task' : 'Tasks inside folder'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Narrow to a concept cluster before reading individual assets.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setActiveSecondaryGroupId('all')}
            className={cn(
              'w-full rounded-[18px] border px-3 py-3 text-left transition-all',
              activeSecondaryGroupId === 'all'
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">All assets in this {primaryKind}</p>
                <p
                  className={cn(
                    'mt-1 text-xs',
                    activeSecondaryGroupId === 'all' ? 'text-blue-100' : 'text-slate-500',
                  )}
                >
                  Use this to scan the full collection before drilling in.
                </p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                  activeSecondaryGroupId === 'all'
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-100 text-slate-700',
                )}
              >
                {activePrimaryGroup?.count || 0}
              </span>
            </div>
          </button>

          {secondaryGroups.length > 0 ? (
            secondaryGroups.map((group) => (
              <button
                key={group.id}
                onClick={() => setActiveSecondaryGroupId(group.id)}
                className={cn(
                  'w-full rounded-[18px] border px-3 py-3 text-left transition-all',
                  activeSecondaryGroupId === group.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold leading-5">{group.label}</p>
                    {group.subtitle ? (
                      <p
                        className={cn(
                          'mt-1 break-words text-xs leading-5',
                          activeSecondaryGroupId === group.id ? 'text-slate-300' : 'text-slate-500',
                        )}
                      >
                        {group.subtitle}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                      activeSecondaryGroupId === group.id
                        ? 'bg-white/15 text-white'
                        : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {group.count}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm leading-6 text-slate-500">
              No nested {secondaryKind === 'folder' ? 'folders' : 'tasks'} were available for this collection.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-2.5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Assets</p>
            <p className="mt-1 text-xs text-slate-500">
              Full task names stay visible here, with ClickUp and Drive context preserved.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
            {columnAssets.length} visible
          </span>
        </div>

        {columnAssets.length > 0 ? (
          <div className="space-y-3">
            {columnAssets.map((creative) => (
              <AssetListRow
                key={creative.id}
                creative={creative}
                selected={selectedIds.has(creative.id)}
                focused={focusedCreative?.id === creative.id}
                onToggle={() => onToggle(creative.id)}
                onFocus={() => onFocus(creative.id)}
                onPreview={() => onPreview(creative)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
            No creatives match the current filters in this column browser selection.
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskDataPanel({
  creative,
  selectedCreatives,
}: {
  creative: InboxCreative | null;
  selectedCreatives: InboxCreative[];
}) {
  const activeCreative = creative || selectedCreatives[0] || null;

  if (!activeCreative) {
    return (
      <SectionCard title="Task Data">
        <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
          Pick a creative to inspect its ClickUp task description, fields, and the data being sent into the AI tagging flow.
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Task Data">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <div className="space-y-4">
          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task name</p>
            <p className="mt-2 break-words text-base font-semibold leading-7 text-slate-900">
              {activeCreative.clickupTaskName}
            </p>
          </div>

          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Description and creative context</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">
              {activeCreative.clickupDescription || 'No task description available for this asset.'}
            </p>
          </div>

          {activeCreative.clickupCustomFields && activeCreative.clickupCustomFields.length > 0 ? (
            <div className="rounded-[18px] border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Custom fields</p>
                <div className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">
                    {activeCreative.clickupCustomFields.length} total
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                    {activeCreative.clickupCustomFields.filter((field) => field.hasValue !== false).length} with values
                  </span>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {activeCreative.clickupCustomFields.map((field) => (
                  <div
                    key={field.id}
                    className={cn(
                      'rounded-2xl px-3 py-2.5',
                      field.hasValue === false ? 'bg-slate-50/80' : 'bg-slate-50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.name}</p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
                          field.hasValue === false
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-sky-100 text-sky-700',
                        )}
                      >
                        {field.hasValue === false ? 'Empty' : field.type}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-sm text-slate-800">{formatClickUpFieldValue(field)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task metadata</p>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {[
                ['Status', activeCreative.clickupTaskContext?.status?.name || activeCreative.clickupTaskStatus || 'Unknown'],
                ['Creator', activeCreative.clickupTaskContext?.creator?.username || activeCreative.creator || 'Unknown'],
                ['Assignees', (activeCreative.clickupTaskContext?.assignees || activeCreative.clickupAssignees || []).map((person) => person.username).filter(Boolean).join(', ') || 'None'],
                ['Due date', activeCreative.clickupTaskContext?.dueDate || 'Not set'],
                ['Start date', activeCreative.clickupTaskContext?.startDate || 'Not set'],
                ['Completed', activeCreative.clickupTaskContext?.dateDone || activeCreative.clickupTaskContext?.dateClosed || 'Not completed'],
                ['Priority', activeCreative.clickupTaskContext?.priority?.label || 'Not set'],
                ['Folder', activeCreative.clickupTaskContext?.folder?.name || 'Not set'],
                ['Space', activeCreative.clickupTaskContext?.space?.name || 'Not set'],
                ['List', activeCreative.clickupTaskContext?.list?.name || activeCreative.clickupListName || 'Not set'],
                ['Parent task', activeCreative.clickupTaskContext?.parentTaskId || 'None'],
                ['Time estimate', typeof activeCreative.clickupTaskContext?.timeEstimate === 'number' ? `${activeCreative.clickupTaskContext.timeEstimate} ms` : 'Not set'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
                  <p className="mt-1 break-words text-sm text-slate-800">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Gemini context</p>
            <p className="mt-2 text-sm leading-6 text-emerald-800">
              Selected creatives now send the full shared ClickUp task context for that task, including description, tags, creator, assignees, dates, custom fields, and asset metadata into the launch AI requests.
            </p>
          </div>
          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signals included</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['Task name', 'Description', 'Tags', 'Creator', 'Assignees', 'Dates', 'Folder', 'Space', 'List', 'Hook', 'Angle', 'Uploaded date', 'Asset metadata', 'Custom fields'].map((item) => (
                <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

export function AssetInspector({
  creative,
  onPreview,
}: {
  creative: InboxCreative | null;
  onPreview: (creative: InboxCreative) => void;
}) {
  if (!creative) {
    return (
      <SectionCard title="Selected Asset">
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
          <LayoutGrid className="h-9 w-9 text-slate-400" />
          <p className="mt-4 text-sm font-medium text-slate-700">Pick an asset to inspect</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Preview the creative, check its ClickUp context, and review every custom field here.
          </p>
        </div>
      </SectionCard>
    );
  }

  const previewUrl = getPreviewUrl(creative);
  const hasVideo = isVideoCreative(creative);
  const customFieldCount = getCreativeCustomFieldCount(creative);
  const uploadedLabel = formatAssetDate(getAssetUploadedAt(creative));
  const updatedLabel = formatAssetDate(getAssetUpdatedAt(creative));

  return (
    <SectionCard
      title="Selected Asset"
      action={
        <button
          onClick={() => onPreview(creative)}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Full Preview
        </button>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[22px] border border-slate-200 bg-slate-950">
          <div className="relative aspect-video">
            {previewUrl ? (
              hasVideo ? (
                <video src={previewUrl} controls playsInline className="h-full w-full bg-slate-950 object-contain" />
              ) : (
                <img src={previewUrl} alt={creative.creativeName} className="h-full w-full object-contain" />
              )
            ) : (
              <div className="flex h-full items-center justify-center">
                {hasVideo ? <Video className="h-10 w-10 text-slate-400" /> : <ImageIcon className="h-10 w-10 text-slate-400" />}
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-[15px] font-semibold text-slate-900">{creative.creativeName}</h3>
          <p className="mt-1 text-sm text-slate-500">{creative.clickupTaskName}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Format</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{creative.creativeFormat}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Test status</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {creative.pastTestResult?.status || (creative.alreadyTested ? 'tested' : 'untested')}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Source</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{getCreativeSourceLabel(creative)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Creator</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{creative.creator || 'Unassigned'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Uploaded</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{uploadedLabel || 'Unknown'}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Updated</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{updatedLabel || uploadedLabel || 'Unknown'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Source trail</p>
              <p className="mt-2 text-sm font-medium text-slate-900">
                {creative.driveParentFolderName || creative.clickupListName || 'Direct ClickUp task'}
              </p>
              {creative.driveParentFolderUrl && (
                <p className="mt-1 text-xs text-slate-500">
                  Folder provenance is available from the Drive source link.
                </p>
              )}
            </div>
            {creative.driveParentFolderUrl && (
              <a
                href={creative.driveParentFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open folder
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Fields</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{customFieldCount}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Tags</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{creative.clickupTags?.length || 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Drive</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{creative.driveSourceType || 'n/a'}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Task context</p>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p><span className="font-medium text-slate-900">List:</span> {creative.clickupListName || 'Not available'}</p>
              <p><span className="font-medium text-slate-900">Status:</span> {creative.clickupTaskStatus || 'Not available'}</p>
              {creative.hook && <p><span className="font-medium text-slate-900">Hook:</span> {creative.hook}</p>}
              {creative.angle && <p><span className="font-medium text-slate-900">Angle:</span> {creative.angle}</p>}
            </div>
          </div>

          {creative.clickupTags && creative.clickupTags.length > 0 && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Tags</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {creative.clickupTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {creative.clickupCustomFields && creative.clickupCustomFields.length > 0 && (
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">ClickUp custom fields</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {creative.clickupCustomFields.map((field) => (
                  <div key={field.id} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.name}</p>
                    {getClickUpFieldHref(field) ? (
                      <a
                        href={getClickUpFieldHref(field) || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block break-all text-sm text-blue-700 hover:text-blue-800"
                      >
                        {formatClickUpFieldValue(field)}
                      </a>
                    ) : (
                      <p className="mt-1 break-words text-sm text-slate-800">{formatClickUpFieldValue(field)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {creative.clickupTaskUrl && (
            <a
              href={creative.clickupTaskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open ClickUp
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {creative.driveUrl && (
            <a
              href={creative.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Open Drive
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export function CreativeDetailsPanel({
  creative,
}: {
  creative: InboxCreative | null;
}) {
  if (!creative) {
    return (
      <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-sm leading-6 text-slate-500">
        Pick a creative to inspect its upload date, folder lineage, creator tags, and testing metadata.
      </div>
    );
  }

  const uploadedLabel = formatAssetDate(getAssetUploadedAt(creative));
  const updatedLabel = formatAssetDate(getAssetUpdatedAt(creative));
  const sourceLabel = getCreativeSourceLabel(creative);

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(320px,1fr)_340px]">
      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Asset details</p>
          <h4 className="mt-2 break-words text-lg font-semibold text-slate-900">{creative.creativeName}</h4>
          <p className="mt-2 break-words text-sm leading-6 text-slate-600">{creative.clickupTaskName}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Uploaded', value: uploadedLabel || 'Unknown' },
              { label: 'Updated', value: updatedLabel || uploadedLabel || 'Unknown' },
              { label: 'Source', value: sourceLabel },
              { label: 'Folder', value: creative.driveParentFolderName || 'Direct asset' },
              { label: 'Task list', value: creative.clickupListName || 'No list' },
              { label: 'Status', value: creative.clickupTaskStatus || creative.uploadStatus || 'Unknown' },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-[18px] bg-slate-50 px-3 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Creative signals</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {creative.hook ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">Hook: {creative.hook}</span> : null}
            {creative.angle ? <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">Angle: {creative.angle}</span> : null}
            {creative.creator ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">Creator: {creative.creator}</span> : null}
            {(creative.clickupTags || []).map((tag) => (
              <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Testing history</p>
          {creative.pastTestResult ? (
            <div className="mt-4 rounded-[18px] bg-slate-50 px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">{creative.pastTestResult.status}</p>
              <p className="mt-1 text-sm text-slate-600">ROAS {creative.pastTestResult.roas.toFixed(2)}x</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatAssetDate(creative.pastTestResult.testDate) || creative.pastTestResult.testDate}
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] bg-slate-50 px-4 py-4 text-sm text-slate-500">
              No historical test result is attached to this creative yet.
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Links</p>
          <div className="mt-4 space-y-2">
            {creative.clickupTaskUrl ? (
              <a
                href={creative.clickupTaskUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Open ClickUp task
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {creative.driveUrl ? (
              <a
                href={creative.driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Open Drive asset
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
            {creative.driveParentFolderUrl ? (
              <a
                href={creative.driveParentFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-[18px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Open Drive folder
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
