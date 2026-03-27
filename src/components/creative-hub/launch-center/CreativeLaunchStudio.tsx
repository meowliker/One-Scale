'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Search, Image as ImageIcon, Video, LayoutGrid, FolderOpen, FolderClosed,
  ChevronRight, Eye, Play, Pause, ExternalLink, Check, Sparkles,
  MessageSquare, BarChart3, Zap, Shuffle, ArrowRight, Rocket,
  Send, Loader2, AlertCircle, Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { InboxCreative, ProductProfile, CreativeBatch } from '@/types/creativeHub';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CreativeLaunchStudioProps {
  storeId?: string;
}

interface CreativeGroup {
  id: string;
  label: string;
  driveUrl?: string;
  isFolder: boolean;
  creatives: InboxCreative[];
}

type FormatFilter = 'all' | 'image' | 'video' | 'carousel';
type BatchMode = 'sequential' | 'by_format' | 'shuffle' | 'auto';
type AiTab = 'insights' | 'chat';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const isFolderUrl = (url: string): boolean =>
  url.includes('/folders/') || url.includes('/drive/folders/');

const truncate = (s: string, n: number) =>
  s.length > n ? s.slice(0, n) + '\u2026' : s;

/** Extract Google Drive file ID from a Drive URL */
const extractDriveFileId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

/** Extract Google Drive folder ID from a Drive URL */
const extractDriveFolderId = (url: string): string | null => {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
};

const formatBadgeColor = (fmt: string): string => {
  switch (fmt) {
    case 'video': return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'image': return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'carousel': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Animation variants
// ────────────────────────────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const panelVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.98 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.35 },
  },
  exit: {
    opacity: 0, y: 16, scale: 0.98,
    transition: { duration: 0.2 },
  },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

const staggerChild = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

// ────────────────────────────────────────────────────────────────────────────
// Sub-component: Creative Card
// ────────────────────────────────────────────────────────────────────────────

function CreativeCard({
  creative,
  selected,
  onToggle,
  onPreview,
  driveConnected = false,
  storeId,
}: {
  creative: InboxCreative;
  selected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  driveConnected?: boolean;
  storeId?: string;
}) {
  const isVideo = creative.creativeFormat === 'video';
  const [driveThumbnail, setDriveThumbnail] = useState<string | null>(null);
  const [driveThumbLoading, setDriveThumbLoading] = useState(false);
  const [driveVideoPreview, setDriveVideoPreview] = useState(false);

  // Resolve Drive thumbnail
  useEffect(() => {
    if (creative.thumbnailUrl || !creative.driveUrl) return;
    const fileId = extractDriveFileId(creative.driveUrl);
    if (!fileId) return;

    if (driveConnected && storeId) {
      // Fetch real thumbnail via API
      setDriveThumbLoading(true);
      fetch(`/api/google-drive/files?storeId=${encodeURIComponent(storeId)}&fileId=${encodeURIComponent(fileId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.thumbnailUrl) {
            setDriveThumbnail(data.thumbnailUrl);
          } else {
            // Fallback to public embed thumbnail
            setDriveThumbnail(`https://drive.google.com/thumbnail?id=${fileId}&sz=w200`);
          }
        })
        .catch(() => {
          setDriveThumbnail(`https://drive.google.com/thumbnail?id=${fileId}&sz=w200`);
        })
        .finally(() => setDriveThumbLoading(false));
    } else {
      // Not connected — use public embed URL as fallback
      setDriveThumbnail(`https://drive.google.com/thumbnail?id=${fileId}&sz=w200`);
    }
  }, [creative.thumbnailUrl, creative.driveUrl, driveConnected, storeId]);

  const resolvedThumbnail = creative.thumbnailUrl || driveThumbnail;
  const driveFileId = creative.driveUrl ? extractDriveFileId(creative.driveUrl) : null;

  return (
    <motion.div
      layout
      variants={staggerChild}
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150',
        selected
          ? 'bg-blue-50 border border-blue-200'
          : 'bg-white border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50',
      )}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div
        className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all',
          selected
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300 group-hover:border-gray-400',
        )}
      >
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </div>

      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 overflow-hidden">
        {driveVideoPreview && driveFileId ? (
          <iframe
            src={`https://drive.google.com/file/d/${driveFileId}/preview`}
            className="w-full h-full border-0"
            allow="autoplay"
            title={creative.creativeName}
          />
        ) : driveThumbLoading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          </div>
        ) : resolvedThumbnail ? (
          <img
            src={resolvedThumbnail}
            alt={creative.creativeName}
            className="w-full h-full object-cover"
            onError={(e) => {
              // If thumbnail fails, show icon fallback
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Video className="w-5 h-5 text-gray-400" />
            ) : (
              <ImageIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
        )}
        {isVideo && !driveVideoPreview && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (driveFileId) setDriveVideoPreview(true);
            }}
          >
            <Play className="w-4 h-4 text-white" fill="white" />
          </div>
        )}
      </div>

      {/* Name + badge */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {truncate(creative.creativeName, 28)}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full border',
              formatBadgeColor(creative.creativeFormat),
            )}
          >
            {creative.creativeFormat}
          </span>
          {creative.hook && (
            <span className="text-[10px] text-gray-400 truncate">
              {truncate(creative.hook, 16)}
            </span>
          )}
        </div>
        {/* Drive hint when not connected but has Drive URL */}
        {creative.driveUrl && !driveConnected && !creative.thumbnailUrl && (
          <p className="text-[9px] text-amber-500 mt-0.5 truncate">
            Connect Google Drive for better previews
          </p>
        )}
      </div>

      {/* Preview button */}
      <button
        onClick={(e) => { e.stopPropagation(); onPreview(); }}
        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-white/80 transition-all"
      >
        <Eye className="w-4 h-4 text-gray-500" />
      </button>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-component: Left Panel — Creative Browser
// ────────────────────────────────────────────────────────────────────────────

/** Drive folder file item */
interface DriveFolderFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl?: string;
}

function CreativeBrowser({
  creatives,
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
  onPreview,
  driveConnected = false,
  storeId,
}: {
  creatives: InboxCreative[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreview: (c: InboxCreative) => void;
  driveConnected?: boolean;
  storeId?: string;
}) {
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [folderFiles, setFolderFiles] = useState<Map<string, DriveFolderFile[]>>(new Map());
  const [folderFilesLoading, setFolderFilesLoading] = useState<Set<string>>(new Set());

  // Fetch folder contents when a Drive folder group is expanded
  const fetchFolderFiles = useCallback(async (groupId: string, driveUrl: string) => {
    if (!driveConnected || !storeId) return;
    if (folderFiles.has(groupId)) return; // already fetched

    const folderId = extractDriveFolderId(driveUrl);
    if (!folderId) return;

    setFolderFilesLoading(prev => { const next = new Set(prev); next.add(groupId); return next; });
    try {
      const res = await fetch(
        `/api/google-drive/files?storeId=${encodeURIComponent(storeId)}&folderId=${encodeURIComponent(folderId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFolderFiles(prev => {
          const next = new Map(prev);
          next.set(groupId, data.files || []);
          return next;
        });
      }
    } catch {
      // Silent failure
    } finally {
      setFolderFilesLoading(prev => { const next = new Set(prev); next.delete(groupId); return next; });
    }
  }, [driveConnected, storeId, folderFiles]);

  // Group creatives by ClickUp task / Drive folder
  const groups = useMemo<CreativeGroup[]>(() => {
    const map = new Map<string, CreativeGroup>();

    for (const c of creatives) {
      const key = c.clickupTaskId || c.id;
      if (!map.has(key)) {
        const hasFolderDrive = c.driveUrl ? isFolderUrl(c.driveUrl) : false;
        map.set(key, {
          id: key,
          label: c.clickupTaskName || c.creativeName,
          driveUrl: c.driveUrl,
          isFolder: hasFolderDrive,
          creatives: [],
        });
      }
      map.get(key)!.creatives.push(c);
    }

    return Array.from(map.values());
  }, [creatives]);

  // Filter
  const filteredGroups = useMemo(() => {
    return groups.map(g => {
      const filtered = g.creatives.filter(c => {
        if (formatFilter !== 'all' && c.creativeFormat !== formatFilter) return false;
        if (search && !c.creativeName.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      });
      return { ...g, creatives: filtered };
    }).filter(g => g.creatives.length > 0);
  }, [groups, formatFilter, search]);

  const totalCount = creatives.length;
  const selectedCount = creatives.filter(c => selectedIds.has(c.id)).length;

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // If expanding a folder group with a Drive URL, fetch folder contents
    const group = groups.find(g => g.id === id);
    if (group?.isFolder && group.driveUrl && !collapsed.has(id)) {
      fetchFolderFiles(id, group.driveUrl);
    }
  }, [groups, collapsed, fetchFolderFiles]);

  const toggleGroupSelect = useCallback((group: CreativeGroup) => {
    const allSelected = group.creatives.every(c => selectedIds.has(c.id));
    if (allSelected) {
      group.creatives.forEach(c => {
        if (selectedIds.has(c.id)) onToggle(c.id);
      });
    } else {
      group.creatives.forEach(c => {
        if (!selectedIds.has(c.id)) onToggle(c.id);
      });
    }
  }, [selectedIds, onToggle]);

  const formatButtons: { key: FormatFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'image', label: 'Images' },
    { key: 'video', label: 'Videos' },
    { key: 'carousel', label: 'Carousel' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          Creative Browser
        </h3>

        {/* Search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search creatives..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-xl
                       placeholder:text-gray-400 text-gray-900 focus:outline-none
                       focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
          />
        </div>

        {/* Format filter pills */}
        <div className="flex gap-1.5 mt-3">
          {formatButtons.map(f => (
            <button
              key={f.key}
              onClick={() => setFormatFilter(f.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-lg transition-all',
                formatFilter === f.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Selection controls */}
      <div className="px-5 py-2 flex items-center justify-between border-t border-gray-100">
        <span className="text-xs text-gray-500">
          <span className="font-semibold text-gray-900">{selectedCount}</span> of{' '}
          {totalCount} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={onSelectAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={onDeselectAll}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Creative list */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <motion.div variants={staggerContainer} initial="hidden" animate="visible">
          {filteredGroups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <ImageIcon className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">No creatives found</p>
              <p className="text-xs text-gray-400 mt-1">Sync your inbox or adjust filters</p>
            </div>
          )}

          {filteredGroups.map(group => {
            const isCollapsed = collapsed.has(group.id);
            const groupSelected = group.creatives.every(c => selectedIds.has(c.id));
            const groupPartial = !groupSelected && group.creatives.some(c => selectedIds.has(c.id));
            const isSingle = group.creatives.length === 1;

            if (isSingle) {
              return (
                <CreativeCard
                  key={group.creatives[0].id}
                  creative={group.creatives[0]}
                  selected={selectedIds.has(group.creatives[0].id)}
                  onToggle={() => onToggle(group.creatives[0].id)}
                  onPreview={() => onPreview(group.creatives[0])}
                  driveConnected={driveConnected}
                  storeId={storeId}
                />
              );
            }

            return (
              <motion.div key={group.id} variants={staggerChild} className="mb-2">
                {/* Folder header */}
                <button
                  onClick={() => toggleCollapse(group.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all',
                    'hover:bg-gray-50 group',
                  )}
                >
                  <ChevronRight
                    className={cn(
                      'w-4 h-4 text-gray-400 transition-transform',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  {group.isFolder ? (
                    isCollapsed
                      ? <FolderClosed className="w-4 h-4 text-amber-500" />
                      : <FolderOpen className="w-4 h-4 text-amber-500" />
                  ) : (
                    <LayoutGrid className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                    {truncate(group.label, 32)}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">
                    {group.creatives.length} files
                  </span>
                  {/* Group checkbox */}
                  <div
                    onClick={(e) => { e.stopPropagation(); toggleGroupSelect(group); }}
                    className={cn(
                      'w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                      groupSelected
                        ? 'bg-blue-600 border-blue-600'
                        : groupPartial
                          ? 'bg-blue-100 border-blue-400'
                          : 'border-gray-300 group-hover:border-gray-400',
                    )}
                  >
                    {groupSelected && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    {groupPartial && !groupSelected && (
                      <div className="w-1.5 h-0.5 bg-blue-600 rounded-full" />
                    )}
                  </div>
                </button>

                {/* Drive link */}
                {group.driveUrl && group.isFolder && !isCollapsed && (
                  <a
                    href={group.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-9 py-1 text-[10px] text-blue-500 hover:text-blue-600 transition-colors"
                    onClick={e => e.stopPropagation()}
                  >
                    Open in Drive <ExternalLink className="w-3 h-3" />
                  </a>
                )}

                {/* Children */}
                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden pl-4"
                    >
                      <motion.div
                        variants={staggerContainer}
                        initial="hidden"
                        animate="visible"
                        className="space-y-1 py-1 border-l-2 border-gray-100 pl-2"
                      >
                        {group.creatives.map(c => (
                          <CreativeCard
                            key={c.id}
                            creative={c}
                            selected={selectedIds.has(c.id)}
                            onToggle={() => onToggle(c.id)}
                            onPreview={() => onPreview(c)}
                            driveConnected={driveConnected}
                            storeId={storeId}
                          />
                        ))}
                        {/* Drive folder files when connected */}
                        {group.isFolder && driveConnected && folderFilesLoading.has(group.id) && (
                          <div className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading folder contents...
                          </div>
                        )}
                        {group.isFolder && driveConnected && folderFiles.has(group.id) && (
                          <div className="mt-1 space-y-0.5">
                            {(folderFiles.get(group.id) || []).map(file => (
                              <div
                                key={file.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-gray-50/50 text-xs"
                              >
                                <div className="w-8 h-8 rounded bg-gray-100 overflow-hidden flex-shrink-0">
                                  {file.thumbnailUrl ? (
                                    <img src={file.thumbnailUrl} alt={file.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      {file.mimeType.startsWith('video/') ? (
                                        <Video className="w-3.5 h-3.5 text-gray-400" />
                                      ) : (
                                        <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <span className="flex-1 truncate text-gray-600">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* Bottom status */}
      {selectedCount > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">
              {selectedCount} selected &middot; Ready to batch
            </span>
            <ArrowRight className="w-4 h-4 text-blue-500" />
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-component: Center Panel — Batch Builder
// ────────────────────────────────────────────────────────────────────────────

function BatchBuilder({
  selectedCreatives,
  batches,
  onAutoBatch,
  onRemoveBatch,
  onClearBatches,
  onLaunch,
  profile,
}: {
  selectedCreatives: InboxCreative[];
  batches: CreativeBatch[];
  onAutoBatch: (mode: BatchMode, size: number) => void;
  onRemoveBatch: (id: string) => void;
  onClearBatches: () => void;
  onLaunch: () => void;
  profile: ProductProfile | undefined;
}) {
  const [batchSize, setBatchSize] = useState(3);
  const [customSize, setCustomSize] = useState('');
  const [structure, setStructure] = useState<'CBO' | 'ABO'>(profile?.defaultStructure || 'CBO');
  const [dailyBudget, setDailyBudget] = useState(profile?.defaultBudget || 20);
  const [duration, setDuration] = useState(profile?.defaultDuration || 3);
  const [bidStrategy, setBidStrategy] = useState(profile?.defaultBidStrategy || 'LOWEST_COST_WITHOUT_CAP');

  const totalAds = batches.reduce((sum, b) => sum + b.creativeIds.length, 0);
  const totalDailySpend = batches.length * dailyBudget;

  const sizeOptions = [3, 5];
  const batchModes: { key: BatchMode; label: string; icon: React.ReactNode }[] = [
    { key: 'sequential', label: 'Sequential', icon: <ArrowRight className="w-3.5 h-3.5" /> },
    { key: 'by_format', label: 'By Format', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { key: 'shuffle', label: 'Shuffle', icon: <Shuffle className="w-3.5 h-3.5" /> },
    { key: 'auto', label: 'Auto-Batch', icon: <Sparkles className="w-3.5 h-3.5" /> },
  ];

  const bidStrategyOptions = [
    { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest Cost' },
    { value: 'COST_CAP', label: 'Cost Cap' },
    { value: 'BID_CAP', label: 'Bid Cap' },
    { value: 'LOWEST_COST_WITH_MIN_ROAS', label: 'Min ROAS' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            Selected Creatives
            {selectedCreatives.length > 0 && (
              <span className="ml-2 text-blue-600">({selectedCreatives.length})</span>
            )}
          </h3>
          {batches.length > 0 && (
            <button
              onClick={onClearBatches}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Batch size selector */}
        <div className="flex items-center gap-2 mt-3">
          {sizeOptions.map(s => (
            <button
              key={s}
              onClick={() => { setBatchSize(s); setCustomSize(''); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-all',
                batchSize === s && !customSize
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50',
              )}
            >
              {s}/set
            </button>
          ))}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-400">Custom:</span>
            <input
              type="number"
              min={1}
              max={20}
              value={customSize}
              onChange={e => {
                setCustomSize(e.target.value);
                const n = parseInt(e.target.value);
                if (n > 0) setBatchSize(n);
              }}
              className="w-12 px-2 py-1.5 text-xs text-center bg-white border border-gray-200
                         rounded-lg text-gray-900 focus:outline-none focus:ring-2
                         focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="N"
            />
          </div>
        </div>

        {/* Batch mode buttons */}
        <div className="flex gap-1.5 mt-2">
          {batchModes.map(m => (
            <button
              key={m.key}
              onClick={() => onAutoBatch(m.key, batchSize)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-600
                         bg-white border border-gray-200 rounded-lg hover:bg-gray-50
                         hover:border-gray-300 transition-all"
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Batch cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <AnimatePresence mode="popLayout">
          {batches.length === 0 && selectedCreatives.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-3">
                <Shuffle className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Ready to batch</p>
              <p className="text-xs text-gray-400 mt-1">
                Choose a batching strategy above
              </p>
            </motion.div>
          )}

          {batches.length === 0 && selectedCreatives.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <LayoutGrid className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-600">No creatives selected</p>
              <p className="text-xs text-gray-400 mt-1">Select from the browser on the left</p>
            </motion.div>
          )}

          {batches.map((batch, idx) => (
            <motion.div
              key={batch.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="mb-2 bg-white border border-gray-200 rounded-xl p-3 shadow-sm
                         hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">
                  Ad Set {idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {batch.creativeIds.length} ads
                  </span>
                  <button
                    onClick={() => onRemoveBatch(batch.id)}
                    className="p-1 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Creative thumbnails */}
              <div className="flex items-center gap-1.5">
                {batch.creativeIds.slice(0, 6).map(cId => {
                  const creative = selectedCreatives.find(c => c.id === cId);
                  const isVideo = creative?.creativeFormat === 'video';
                  return (
                    <div
                      key={cId}
                      className="w-8 h-8 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 relative"
                    >
                      {creative?.thumbnailUrl ? (
                        <img
                          src={creative.thumbnailUrl}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : isVideo ? (
                        <Video className="w-3.5 h-3.5 text-gray-400 absolute inset-0 m-auto" />
                      ) : (
                        <ImageIcon className="w-3.5 h-3.5 text-gray-400 absolute inset-0 m-auto" />
                      )}
                    </div>
                  );
                })}
                {batch.creativeIds.length > 6 && (
                  <span className="text-[10px] text-gray-400 ml-1">
                    +{batch.creativeIds.length - 6}
                  </span>
                )}
              </div>

              {/* Names */}
              <p className="text-[10px] text-gray-400 mt-1.5 truncate">
                {batch.creativeIds
                  .slice(0, 3)
                  .map(cId => {
                    const c = selectedCreatives.find(cr => cr.id === cId);
                    return c ? truncate(c.creativeName, 12) : cId.slice(0, 8);
                  })
                  .join(', ')}
                {batch.creativeIds.length > 3 && ` +${batch.creativeIds.length - 3}`}
              </p>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Launch configuration */}
      <div className="border-t border-gray-100 bg-gray-50/50 px-5 py-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Launch Configuration
        </p>

        {/* Structure toggle */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-gray-600 w-16">Structure</span>
          <div className="flex bg-white rounded-lg border border-gray-200 p-0.5">
            {(['CBO', 'ABO'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStructure(s)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all',
                  structure === s
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Budget + Duration */}
        <div className="flex gap-3 mb-3">
          <div className="flex-1">
            <span className="text-xs text-gray-500 mb-1 block">Budget</span>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
              <input
                type="number"
                value={dailyBudget}
                onChange={e => setDailyBudget(Number(e.target.value))}
                className="w-full pl-6 pr-8 py-1.5 text-sm bg-white border border-gray-200 rounded-lg
                           text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">/day</span>
            </div>
          </div>
          <div className="flex-1">
            <span className="text-xs text-gray-500 mb-1 block">Duration</span>
            <div className="relative">
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="w-full pl-3 pr-10 py-1.5 text-sm bg-white border border-gray-200 rounded-lg
                           text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">days</span>
            </div>
          </div>
        </div>

        {/* Bid strategy */}
        <div className="mb-3">
          <span className="text-xs text-gray-500 mb-1 block">Bid Strategy</span>
          <select
            value={bidStrategy}
            onChange={e => setBidStrategy(e.target.value as typeof bidStrategy)}
            className="w-full px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg
                       text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20
                       focus:border-blue-400 appearance-none cursor-pointer"
          >
            {bidStrategyOptions.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Summary */}
        {batches.length > 0 && (
          <div className="text-xs text-gray-500 mb-3 bg-white rounded-lg px-3 py-2 border border-gray-100">
            <span className="font-medium text-gray-700">
              {batches.length} ad sets
            </span>
            {' '}x ${dailyBudget}/day ={' '}
            <span className="font-semibold text-gray-900">
              ${totalDailySpend}/day
            </span>
            {' '}&middot;{' '}
            <span className="text-gray-600">
              {totalAds} ads for {duration} days
            </span>
          </div>
        )}

        {/* Launch button */}
        <button
          onClick={onLaunch}
          disabled={batches.length === 0}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all',
            batches.length > 0
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 hover:shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed',
          )}
        >
          <Rocket className="w-4 h-4" />
          {batches.length > 0
            ? `Launch ${totalAds} Creatives \u2192 ${batches.length} Ad Sets`
            : 'Select & batch creatives to launch'}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-component: Right Panel — AI Creative Strategist
// ────────────────────────────────────────────────────────────────────────────

function AiStrategist({
  storeId,
  productId,
  aiAnalysis,
  aiChat,
  fetchAnalysis,
  sendChat,
}: {
  storeId: string;
  productId: string | null;
  aiAnalysis: { loading: boolean; data: import('@/types/creativeHub').AIInsightsData | null; error: string | null };
  aiChat: { messages: Array<{ role: 'user' | 'assistant'; content: string; actionItems?: string[] }>; loading: boolean };
  fetchAnalysis: (storeId: string, productProfileId: string) => Promise<void>;
  sendChat: (storeId: string, productProfileId: string, message: string) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<AiTab>('insights');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (productId && storeId && !aiAnalysis.data && !aiAnalysis.loading) {
      fetchAnalysis(storeId, productId);
    }
  }, [productId, storeId, aiAnalysis.data, aiAnalysis.loading, fetchAnalysis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat.messages]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim() || !productId) return;
    sendChat(storeId, productId, chatInput.trim());
    setChatInput('');
  }, [chatInput, productId, storeId, sendChat]);

  const quickPrompts = [
    'What should I test next?',
    'Analyze my top performers',
    'Suggest batch groupings',
  ];

  const tabButtons: { key: AiTab; label: string; icon: React.ReactNode }[] = [
    { key: 'insights', label: 'Insights', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
            AI Strategist
          </h3>
        </div>

        {/* Tab switch */}
        <div className="flex bg-white rounded-lg border border-gray-200 p-0.5 mt-3">
          {tabButtons.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                activeTab === t.key
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <AnimatePresence mode="wait">
          {activeTab === 'insights' ? (
            <motion.div
              key="insights"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {aiAnalysis.loading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin mb-3" />
                  <p className="text-sm text-gray-500">Analyzing creatives...</p>
                </div>
              )}

              {aiAnalysis.error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600">{aiAnalysis.error}</p>
                </div>
              )}

              {aiAnalysis.data && (
                <>
                  {/* Performance summary */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Performance Summary
                      </h4>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {aiAnalysis.data.insights.summary}
                    </p>
                  </div>

                  {/* Winning patterns */}
                  {aiAnalysis.data.insights.winningPatterns.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-500" />
                        <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                          Winning Patterns
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {aiAnalysis.data.insights.winningPatterns.slice(0, 3).map((p, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-gray-800 font-medium">{p.pattern}</p>
                              <p className="text-[10px] text-gray-400">
                                {p.avgRoas.toFixed(1)}x ROAS avg
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action items */}
                  {aiAnalysis.data.insights.actionItems.length > 0 && (
                    <div className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-purple-500" />
                        <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                          Recommendations
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {aiAnalysis.data.insights.actionItems.slice(0, 4).map((item, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 flex-shrink-0" />
                            <p className="text-sm text-gray-600">{item}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick actions */}
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Zap className="w-4 h-4 text-orange-500" />
                      <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider">
                        Quick Actions
                      </h4>
                    </div>
                    <div className="space-y-1.5">
                      <button className="w-full text-left px-3 py-2 text-sm text-gray-700 bg-gray-50
                                        border border-gray-100 rounded-lg hover:bg-blue-50
                                        hover:border-blue-200 hover:text-blue-700 transition-all">
                        Test winning hook with new angles
                      </button>
                      <button className="w-full text-left px-3 py-2 text-sm text-gray-700 bg-gray-50
                                        border border-gray-100 rounded-lg hover:bg-blue-50
                                        hover:border-blue-200 hover:text-blue-700 transition-all">
                        Scale top 3 by 2x budget
                      </button>
                    </div>
                  </div>
                </>
              )}

              {!aiAnalysis.loading && !aiAnalysis.data && !aiAnalysis.error && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-purple-400" />
                  </div>
                  <p className="text-sm text-gray-500">Select a product to see insights</p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full"
            >
              {/* Messages */}
              <div className="flex-1 space-y-3 pb-3">
                {aiChat.messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                      <MessageSquare className="w-5 h-5 text-blue-400" />
                    </div>
                    <p className="text-sm text-gray-500 mb-4">Ask me about your creatives...</p>
                    <div className="space-y-1.5">
                      {quickPrompts.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setChatInput(prompt);
                            if (productId) {
                              sendChat(storeId, productId, prompt);
                            }
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-gray-600 bg-white
                                    border border-gray-200 rounded-lg hover:bg-blue-50
                                    hover:border-blue-200 hover:text-blue-700 transition-all"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {aiChat.messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      'rounded-xl px-3 py-2.5 text-sm',
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white ml-6'
                        : 'bg-white border border-gray-200 text-gray-700 mr-4',
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    {msg.actionItems && msg.actionItems.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                        {msg.actionItems.map((item, j) => (
                          <div key={j} className="flex items-start gap-1.5">
                            <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5" />
                            <span className="text-xs">{item}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}

                {aiChat.loading && (
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-xs text-gray-400">Thinking...</span>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat input (always visible when on chat tab) */}
      {activeTab === 'chat' && (
        <div className="px-5 py-3 border-t border-gray-100 bg-white/80 backdrop-blur-sm">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
              placeholder="Ask about your creatives..."
              className="flex-1 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl
                         placeholder:text-gray-400 text-gray-900 focus:outline-none
                         focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
            />
            <button
              onClick={handleSendChat}
              disabled={!chatInput.trim() || aiChat.loading}
              className={cn(
                'p-2 rounded-xl transition-all',
                chatInput.trim() && !aiChat.loading
                  ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                  : 'bg-gray-100 text-gray-400',
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-component: Creative Preview Modal
// ────────────────────────────────────────────────────────────────────────────

function CreativePreviewModal({
  creative,
  onClose,
}: {
  creative: InboxCreative;
  onClose: () => void;
}) {
  const isVideo = creative.creativeFormat === 'video';
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause();
    else videoRef.current.play();
    setPlaying(!playing);
  }, [playing]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{creative.creativeName}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full border',
                  formatBadgeColor(creative.creativeFormat),
                )}
              >
                {creative.creativeFormat}
              </span>
              {creative.hook && (
                <span className="text-[10px] text-gray-400">{creative.hook}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Media */}
        <div className="relative aspect-square bg-gray-50">
          {isVideo && creative.driveUrl ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                src={creative.driveUrl}
                className="w-full h-full object-contain"
                onEnded={() => setPlaying(false)}
              />
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors"
              >
                {playing ? (
                  <Pause className="w-12 h-12 text-white" fill="white" />
                ) : (
                  <Play className="w-12 h-12 text-white" fill="white" />
                )}
              </button>
            </div>
          ) : creative.thumbnailUrl ? (
            <img
              src={creative.thumbnailUrl}
              alt={creative.creativeName}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-16 h-16 text-gray-300" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {creative.clickupTaskName && (
              <span>Task: {truncate(creative.clickupTaskName, 30)}</span>
            )}
          </div>
          {creative.driveUrl && (
            <a
              href={creative.driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
            >
              Open in Drive <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────────────────────────

export function CreativeLaunchStudio({ storeId }: CreativeLaunchStudioProps) {
  const isOpen = useCreativeHubStore(s => s.launchStudioOpen);
  const productId = useCreativeHubStore(s => s.launchStudioProductId);
  const close = useCreativeHubStore(s => s.closeLaunchStudio);
  const profiles = useCreativeHubStore(s => s.profiles);
  const inboxCreatives = useCreativeHubStore(s => s.inboxCreatives);
  const selectedIds = useCreativeHubStore(s => s.selectedCreativeIds);
  const toggleCreativeSelection = useCreativeHubStore(s => s.toggleCreativeSelection);
  const selectAll = useCreativeHubStore(s => s.selectAllCreatives);
  const deselectAll = useCreativeHubStore(s => s.deselectAllCreatives);
  const batches = useCreativeHubStore(s => s.batches);
  const autoBatch = useCreativeHubStore(s => s.autoBatch);
  const removeBatch = useCreativeHubStore(s => s.removeBatch);
  const clearBatches = useCreativeHubStore(s => s.clearBatches);
  const shuffleBatches = useCreativeHubStore(s => s.shuffleBatches);
  const aiAnalysis = useCreativeHubStore(s => s.launchStudioAiAnalysis);
  const aiChat = useCreativeHubStore(s => s.launchStudioAiChat);
  const fetchAiAnalysis = useCreativeHubStore(s => s.fetchLaunchStudioAiAnalysis);
  const sendAiChat = useCreativeHubStore(s => s.sendLaunchStudioAiChat);
  const openLaunchWizardForProduct = useCreativeHubStore(s => s.openLaunchWizardForProduct);
  const googleDriveConnected = useCreativeHubStore(s => s.googleDriveConnected);
  const checkGoogleDriveConnection = useCreativeHubStore(s => s.checkGoogleDriveConnection);

  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);

  const profile = useMemo(
    () => profiles.find(p => p.id === productId),
    [profiles, productId],
  );

  // Filter creatives for the current product
  const productCreatives = useMemo(
    () =>
      inboxCreatives.filter(
        c =>
          (!productId || c.productProfileId === productId) &&
          (c.uploadStatus === 'ready' || c.driveUrl),
      ),
    [inboxCreatives, productId],
  );

  const selectedCreatives = useMemo(
    () => productCreatives.filter(c => selectedIds.has(c.id)),
    [productCreatives, selectedIds],
  );

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewCreative) setPreviewCreative(null);
        else close();
      }
    };
    if (isOpen) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, previewCreative, close]);

  const handleAutoBatch = useCallback((mode: BatchMode, size: number) => {
    const strategyMap: Record<BatchMode, string> = {
      sequential: 'sequential',
      by_format: 'by_format',
      shuffle: 'shuffle',
      auto: 'smart_mix',
    };
    autoBatch(strategyMap[mode] as Parameters<typeof autoBatch>[0], size);
  }, [autoBatch]);

  const handleLaunch = useCallback(() => {
    if (!productId) return;
    const creativeIds = batches.flatMap(b => b.creativeIds);
    openLaunchWizardForProduct(productId, creativeIds);
  }, [productId, batches, openLaunchWizardForProduct]);

  const resolvedStoreId = storeId || '';

  // Check Google Drive connection status on mount
  useEffect(() => {
    if (isOpen && resolvedStoreId) {
      checkGoogleDriveConnection(resolvedStoreId);
    }
  }, [isOpen, resolvedStoreId, checkGoogleDriveConnection]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="studio-overlay"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 bg-gray-100/95 backdrop-blur-sm"
        >
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="w-full h-full flex flex-col"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-gray-200/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-sm">
                  <Rocket className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Creative Launch Studio</h2>
                  {profile && (
                    <p className="text-xs text-gray-500">{profile.productName}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all">
                  <Settings className="w-4.5 h-4.5" />
                </button>
                <button
                  onClick={close}
                  className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 3-panel layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left — Creative Browser */}
              <div className="w-[340px] flex-shrink-0 border-r border-gray-200/60 bg-gray-50 overflow-hidden">
                <CreativeBrowser
                  creatives={productCreatives}
                  selectedIds={selectedIds}
                  onToggle={toggleCreativeSelection}
                  onSelectAll={selectAll}
                  onDeselectAll={deselectAll}
                  onPreview={setPreviewCreative}
                  driveConnected={googleDriveConnected}
                  storeId={resolvedStoreId}
                />
              </div>

              {/* Center — Batch Builder */}
              <div className="flex-1 bg-white overflow-hidden">
                <BatchBuilder
                  selectedCreatives={selectedCreatives}
                  batches={batches}
                  onAutoBatch={handleAutoBatch}
                  onRemoveBatch={removeBatch}
                  onClearBatches={clearBatches}
                  onLaunch={handleLaunch}
                  profile={profile}
                />
              </div>

              {/* Right — AI Strategist */}
              <div className="w-[320px] flex-shrink-0 border-l border-gray-200/60 bg-gray-50 overflow-hidden">
                <AiStrategist
                  storeId={resolvedStoreId}
                  productId={productId}
                  aiAnalysis={aiAnalysis}
                  aiChat={aiChat}
                  fetchAnalysis={fetchAiAnalysis}
                  sendChat={sendAiChat}
                />
              </div>
            </div>
          </motion.div>

          {/* Preview modal */}
          <AnimatePresence>
            {previewCreative && (
              <CreativePreviewModal
                creative={previewCreative}
                onClose={() => setPreviewCreative(null)}
              />
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
