'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Search,
  Image as ImageIcon,
  Video,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
  Check,
  CheckCircle2,
  XCircle,
  Circle,
  Play,
  GripVertical,
  Trash2,
  Shuffle,
  Layers,
  Sparkles,
  Send,
  Loader2,
  Rocket,
  TrendingUp,
  Lightbulb,
  MessageSquare,
  ChevronUp,
  Package,
  Filter,
  FolderOpen,
  Minus,
  Plus,
  BarChart3,
  Brain,
  Target,
  Zap,
  ListChecks,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type {
  InboxCreative,
  CreativeFormat,
  CreativeBatch,
  BatchStrategy,
  ProductProfile,
  AIInsightsData,
} from '@/types/creativeHub';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface CreativeLaunchStudioProps {
  storeId: string;
}

interface CreativeGroup {
  id: string;
  label: string;
  creatives: InboxCreative[];
  collapsed: boolean;
}

type AutoBatchSize = 3 | 5;
type AutoBatchMode = 'sequential' | 'by_format' | 'shuffle';

// ────────────────────────────────────────────────────────────────────────────
// Animation variants
// ────────────────────────────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const panelStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const panelChild = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

const cardHover = {
  scale: 1.02,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function formatBadgeIcon(format: CreativeFormat) {
  switch (format) {
    case 'video':
      return Video;
    case 'image':
      return ImageIcon;
    case 'carousel':
      return LayoutGrid;
    default:
      return ImageIcon;
  }
}

function formatBadgeColor(format: CreativeFormat): string {
  switch (format) {
    case 'video':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'image':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'carousel':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function testStatusBadge(creative: InboxCreative) {
  if (!creative.pastTestResult) {
    return { icon: Circle, color: 'text-gray-500', label: 'Untested' };
  }
  switch (creative.pastTestResult.status) {
    case 'winner':
      return { icon: CheckCircle2, color: 'text-emerald-400', label: 'Winner' };
    case 'killed':
      return { icon: XCircle, color: 'text-red-400', label: 'Killed' };
    default:
      return { icon: AlertCircle, color: 'text-amber-400', label: 'Inconclusive' };
  }
}

function groupCreatives(creatives: InboxCreative[], profiles: ProductProfile[]): CreativeGroup[] {
  const byProfile = new Map<string, InboxCreative[]>();
  const ungrouped: InboxCreative[] = [];

  for (const c of creatives) {
    if (c.productProfileId) {
      const existing = byProfile.get(c.productProfileId) ?? [];
      existing.push(c);
      byProfile.set(c.productProfileId, existing);
    } else {
      ungrouped.push(c);
    }
  }

  const groups: CreativeGroup[] = [];

  for (const [profileId, items] of byProfile) {
    const profile = profiles.find(p => p.id === profileId);
    groups.push({
      id: profileId,
      label: profile?.productName ?? `Profile ${profileId.slice(0, 6)}`,
      creatives: items,
      collapsed: false,
    });
  }

  // Sub-group by angle within each group
  const angleGroups: CreativeGroup[] = [];
  for (const group of groups) {
    const byAngle = new Map<string, InboxCreative[]>();
    const noAngle: InboxCreative[] = [];
    for (const c of group.creatives) {
      if (c.angle) {
        const existing = byAngle.get(c.angle) ?? [];
        existing.push(c);
        byAngle.set(c.angle, existing);
      } else {
        noAngle.push(c);
      }
    }
    if (byAngle.size > 1) {
      for (const [angle, items] of byAngle) {
        angleGroups.push({
          id: `${group.id}-${angle}`,
          label: `${group.label} / ${angle}`,
          creatives: items,
          collapsed: false,
        });
      }
      if (noAngle.length > 0) {
        angleGroups.push({
          id: `${group.id}-ungrouped`,
          label: `${group.label} / Other`,
          creatives: noAngle,
          collapsed: false,
        });
      }
    } else {
      angleGroups.push(group);
    }
  }

  if (ungrouped.length > 0) {
    angleGroups.push({
      id: 'ungrouped',
      label: 'Ungrouped',
      creatives: ungrouped,
      collapsed: false,
    });
  }

  return angleGroups;
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

/** Single creative card in the left browser panel */
function CreativeCard({
  creative,
  isSelected,
  onToggle,
  onPreview,
}: {
  creative: InboxCreative;
  isSelected: boolean;
  onToggle: () => void;
  onPreview: () => void;
}) {
  const FormatIcon = formatBadgeIcon(creative.creativeFormat);
  const status = testStatusBadge(creative);
  const StatusIcon = status.icon;

  return (
    <motion.div
      layout
      whileHover={cardHover}
      className={cn(
        'group relative flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-colors duration-200',
        'bg-gray-900/60 hover:bg-gray-800/80 border',
        isSelected
          ? 'border-blue-500/60 ring-1 ring-blue-500/30'
          : 'border-gray-800/40 hover:border-gray-700/60'
      )}
      onClick={onToggle}
    >
      {/* Thumbnail */}
      <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-800">
        {creative.thumbnailUrl ? (
          <img
            src={creative.thumbnailUrl}
            alt={creative.creativeName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FormatIcon className="w-5 h-5 text-gray-600" />
          </div>
        )}
        {creative.creativeFormat === 'video' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Play className="w-4 h-4 text-white fill-white" />
          </button>
        )}
        {/* Selection badge */}
        {isSelected && (
          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center ring-2 ring-gray-900">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-200 truncate">
          {creative.creativeName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border',
              formatBadgeColor(creative.creativeFormat)
            )}
          >
            <FormatIcon className="w-2.5 h-2.5" />
            {creative.creativeFormat}
          </span>
          <span className={cn('flex items-center gap-0.5 text-[10px]', status.color)}>
            <StatusIcon className="w-2.5 h-2.5" />
            {status.label}
          </span>
        </div>
        {creative.hook && (
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{creative.hook}</p>
        )}
      </div>
    </motion.div>
  );
}

/** Collapsible folder section */
function FolderSection({
  group,
  selectedIds,
  onToggleCreative,
  onPreviewCreative,
  collapsed,
  onToggleCollapse,
}: {
  group: CreativeGroup;
  selectedIds: Set<string>;
  onToggleCreative: (id: string) => void;
  onPreviewCreative: (creative: InboxCreative) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const selectedInGroup = group.creatives.filter(c => selectedIds.has(c.id)).length;

  return (
    <div className="mb-2">
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
        )}
        <FolderOpen className="w-3.5 h-3.5 text-gray-500" />
        <span className="truncate">{group.label}</span>
        <span className="ml-auto text-xs text-gray-600">
          {selectedInGroup > 0 && (
            <span className="text-blue-400 mr-1">{selectedInGroup}/</span>
          )}
          {group.creatives.length}
        </span>
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 mt-1 pl-1">
              {group.creatives.map((c) => (
                <CreativeCard
                  key={c.id}
                  creative={c}
                  isSelected={selectedIds.has(c.id)}
                  onToggle={() => onToggleCreative(c.id)}
                  onPreview={() => onPreviewCreative(c)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Batch card in the center panel */
function BatchCard({
  batch,
  creatives,
  onRemoveBatch,
  onRemoveCreative,
}: {
  batch: CreativeBatch;
  creatives: InboxCreative[];
  onRemoveBatch: () => void;
  onRemoveCreative: (creativeId: string) => void;
}) {
  const batchCreatives = batch.creativeIds
    .map(id => creatives.find(c => c.id === id))
    .filter(Boolean) as InboxCreative[];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-4 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-gray-600 cursor-grab" />
          <h4 className="text-sm font-semibold text-gray-200">
            {batch.name}
          </h4>
          <span className="text-xs text-gray-500 bg-gray-800/80 px-1.5 py-0.5 rounded-full">
            {batchCreatives.length} ad{batchCreatives.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={onRemoveBatch}
          className="p-1 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {batchCreatives.map((creative) => {
          const FormatIcon = formatBadgeIcon(creative.creativeFormat);
          return (
            <motion.div
              key={creative.id}
              layoutId={`studio-thumb-${creative.id}`}
              className="group relative w-14 h-14 rounded-lg overflow-hidden bg-gray-800 border border-gray-700/50 flex-shrink-0"
            >
              {creative.thumbnailUrl ? (
                <img
                  src={creative.thumbnailUrl}
                  alt={creative.creativeName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FormatIcon className="w-4 h-4 text-gray-600" />
                </div>
              )}
              <button
                onClick={() => onRemoveCreative(creative.id)}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Minus className="w-4 h-4 text-red-400" />
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

/** Typewriter text effect component */
function TypewriterText({ text, speed = 20 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed('');
    indexRef.current = 0;

    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1));
        indexRef.current += 1;
      } else {
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return <span>{displayed}</span>;
}

/** Chat message bubble */
function ChatBubble({
  role,
  content,
  actionItems,
  onToggleAction,
  checkedActions,
}: {
  role: 'user' | 'assistant';
  content: string;
  actionItems?: string[];
  onToggleAction?: (index: number) => void;
  checkedActions?: Set<number>;
}) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm',
          isUser
            ? 'bg-blue-600 text-white rounded-br-md'
            : 'bg-gray-800/80 text-gray-200 rounded-bl-md border border-gray-700/50'
        )}
      >
        <p className="whitespace-pre-wrap">{content}</p>
        {actionItems && actionItems.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-700/50 space-y-1.5">
            <p className="text-xs font-medium text-gray-400 flex items-center gap-1">
              <ListChecks className="w-3 h-3" /> Action Items
            </p>
            {actionItems.map((item, i) => {
              const isChecked = checkedActions?.has(i) ?? false;
              return (
                <button
                  key={i}
                  onClick={() => onToggleAction?.(i)}
                  className="flex items-center gap-2 w-full text-left text-xs text-gray-300 hover:text-gray-100 transition-colors"
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors',
                      isChecked
                        ? 'bg-emerald-500/20 border-emerald-500/50'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                  </div>
                  <span className={cn(isChecked && 'line-through text-gray-500')}>
                    {item}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Left Panel: Creative Browser
// ────────────────────────────────────────────────────────────────────────────

function LeftPanel({
  creatives,
  profiles,
  selectedIds,
  onToggleCreative,
  onSelectAll,
  onDeselectAll,
  onPreviewCreative,
}: {
  creatives: InboxCreative[];
  profiles: ProductProfile[];
  selectedIds: Set<string>;
  onToggleCreative: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onPreviewCreative: (creative: InboxCreative) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFormat, setFilterFormat] = useState<CreativeFormat | 'all'>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let result = creatives;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        c =>
          c.creativeName.toLowerCase().includes(q) ||
          c.hook?.toLowerCase().includes(q) ||
          c.angle?.toLowerCase().includes(q)
      );
    }
    if (filterFormat !== 'all') {
      result = result.filter(c => c.creativeFormat === filterFormat);
    }
    return result;
  }, [creatives, searchQuery, filterFormat]);

  const groups = useMemo(() => groupCreatives(filtered, profiles), [filtered, profiles]);

  const toggleCollapse = (groupId: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <motion.div
      variants={panelChild}
      className="w-80 flex-shrink-0 flex flex-col bg-gray-900/50 border-r border-gray-800/50 overflow-hidden"
    >
      {/* Panel header */}
      <div className="p-4 border-b border-gray-800/40">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">
          Creative Browser
        </h3>
        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            placeholder="Search creatives..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-800/60 border border-gray-700/40 rounded-lg text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-colors"
          />
        </div>
        {/* Format filter */}
        <div className="flex items-center gap-1">
          {(['all', 'video', 'image', 'carousel'] as const).map(fmt => (
            <button
              key={fmt}
              onClick={() => setFilterFormat(fmt)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                filterFormat === fmt
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
              )}
            >
              {fmt === 'all' ? 'All' : fmt.charAt(0).toUpperCase() + fmt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Creative list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-600">
            <Package className="w-8 h-8 mb-2" />
            <p className="text-sm">No creatives found</p>
          </div>
        ) : (
          groups.map(group => (
            <FolderSection
              key={group.id}
              group={group}
              selectedIds={selectedIds}
              onToggleCreative={onToggleCreative}
              onPreviewCreative={onPreviewCreative}
              collapsed={collapsedGroups.has(group.id)}
              onToggleCollapse={() => toggleCollapse(group.id)}
            />
          ))
        )}
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-gray-800/40 flex items-center gap-2">
        <button
          onClick={onSelectAll}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 transition-colors border border-gray-700/40"
        >
          Select All ({creatives.length})
        </button>
        <button
          onClick={onDeselectAll}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 transition-colors border border-gray-700/40"
        >
          Clear
        </button>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Center Panel: Selected & Batching
// ────────────────────────────────────────────────────────────────────────────

function CenterPanel({
  selectedIds,
  creatives,
  batches,
  onAutoBatch,
  onRemoveBatch,
  onRemoveCreativeFromBatch,
  onShuffleBatches,
  onClearBatches,
  onLaunch,
  launchReady,
  configExpanded,
  onToggleConfig,
  profile,
}: {
  selectedIds: Set<string>;
  creatives: InboxCreative[];
  batches: CreativeBatch[];
  onAutoBatch: (mode: AutoBatchMode, size: AutoBatchSize) => void;
  onRemoveBatch: (batchId: string) => void;
  onRemoveCreativeFromBatch: (batchId: string, creativeId: string) => void;
  onShuffleBatches: () => void;
  onClearBatches: () => void;
  onLaunch: () => void;
  launchReady: boolean;
  configExpanded: boolean;
  onToggleConfig: () => void;
  profile: ProductProfile | undefined;
}) {
  const [batchSize, setBatchSize] = useState<AutoBatchSize>(3);
  const [batchMode, setBatchMode] = useState<AutoBatchMode>('sequential');
  const isEmpty = selectedIds.size === 0;

  return (
    <motion.div
      variants={panelChild}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800/40 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Selected Creatives
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectedIds.size} creative{selectedIds.size !== 1 ? 's' : ''} selected
            {batches.length > 0 && ` in ${batches.length} batch${batches.length !== 1 ? 'es' : ''}`}
          </p>
        </div>
        {/* Auto-batch controls */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-800/60 rounded-lg border border-gray-700/40 overflow-hidden">
              {([3, 5] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setBatchSize(s)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    batchSize === s
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-gray-500 hover:text-gray-300'
                  )}
                >
                  {s}/set
                </button>
              ))}
            </div>
            <div className="flex items-center bg-gray-800/60 rounded-lg border border-gray-700/40 overflow-hidden">
              {([
                { id: 'sequential' as const, icon: Layers, label: 'Order' },
                { id: 'by_format' as const, icon: Filter, label: 'Format' },
                { id: 'shuffle' as const, icon: Shuffle, label: 'Shuffle' },
              ]).map(m => (
                <button
                  key={m.id}
                  onClick={() => setBatchMode(m.id)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors',
                    batchMode === m.id
                      ? 'bg-blue-600/20 text-blue-400'
                      : 'text-gray-500 hover:text-gray-300'
                  )}
                >
                  <m.icon className="w-3 h-3" />
                  {m.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => onAutoBatch(batchMode, batchSize)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30 transition-colors"
            >
              Auto-Batch
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center">
            <motion.div
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-full max-w-md border-2 border-dashed border-gray-700/50 rounded-2xl p-12 text-center"
            >
              <Layers className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <h4 className="text-sm font-medium text-gray-500">
                Select creatives from the left panel
              </h4>
              <p className="text-xs text-gray-600 mt-1">
                Click thumbnails or use Select All to add creatives to your launch
              </p>
            </motion.div>
          </div>
        ) : batches.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center">
              <Layers className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <h4 className="text-sm font-medium text-gray-400">
                {selectedIds.size} creative{selectedIds.size !== 1 ? 's' : ''} ready
              </h4>
              <p className="text-xs text-gray-600 mt-1">
                Use Auto-Batch above to organize into ad sets
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {batches.map((batch) => (
                <BatchCard
                  key={batch.id}
                  batch={batch}
                  creatives={creatives}
                  onRemoveBatch={() => onRemoveBatch(batch.id)}
                  onRemoveCreative={(cid) => onRemoveCreativeFromBatch(batch.id, cid)}
                />
              ))}
            </AnimatePresence>

            {/* Batch actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={onShuffleBatches}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-200 bg-gray-800/40 hover:bg-gray-800/60 border border-gray-700/30 transition-colors"
              >
                <Shuffle className="w-3 h-3" /> Re-shuffle
              </button>
              <button
                onClick={onClearBatches}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-red-400 bg-gray-800/40 hover:bg-red-500/10 border border-gray-700/30 hover:border-red-500/30 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Clear All
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Launch Configuration & Button */}
      <div className="border-t border-gray-800/40">
        {/* Collapsible config */}
        <button
          onClick={onToggleConfig}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <Target className="w-4 h-4" />
            Launch Configuration
          </span>
          {configExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
        <AnimatePresence>
          {configExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                {/* Structure */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Structure</label>
                  <div className="flex bg-gray-800/60 rounded-lg border border-gray-700/40 overflow-hidden">
                    {(['CBO', 'ABO'] as const).map(s => (
                      <div
                        key={s}
                        className={cn(
                          'flex-1 text-center py-1.5 text-xs font-medium',
                          profile?.defaultStructure === s
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-gray-500'
                        )}
                      >
                        {s}
                      </div>
                    ))}
                  </div>
                </div>
                {/* Budget */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Budget/day</label>
                  <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                    ${profile?.defaultBudget ?? 50}
                  </div>
                </div>
                {/* Duration */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Duration</label>
                  <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-300">
                    {profile?.defaultDuration ?? 3} days
                  </div>
                </div>
                {/* Bid Strategy */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Bid Strategy</label>
                  <div className="bg-gray-800/60 border border-gray-700/40 rounded-lg px-3 py-1.5 text-sm text-gray-300 truncate">
                    {(profile?.defaultBidStrategy ?? 'LOWEST_COST').replace(/_/g, ' ').toLowerCase()}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Launch button */}
        <div className="px-4 pb-4">
          <motion.button
            onClick={onLaunch}
            disabled={!launchReady}
            animate={
              launchReady
                ? { scale: [1, 1.015, 1], transition: { duration: 2, repeat: Infinity } }
                : {}
            }
            className={cn(
              'w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all duration-300',
              launchReady
                ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:from-blue-500 hover:to-purple-500'
                : 'bg-gray-800/60 text-gray-600 cursor-not-allowed border border-gray-700/30'
            )}
          >
            <Rocket className="w-4 h-4" />
            {launchReady
              ? `Launch ${batches.length} Batch${batches.length !== 1 ? 'es' : ''}`
              : 'Select & batch creatives to launch'}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Right Panel: AI Analysis
// ────────────────────────────────────────────────────────────────────────────

function RightPanel({
  storeId,
  productProfileId,
  aiAnalysis,
  aiChat,
  onFetchAnalysis,
  onSendChat,
}: {
  storeId: string;
  productProfileId: string;
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  aiChat: {
    messages: Array<{ role: 'user' | 'assistant'; content: string; actionItems?: string[] }>;
    loading: boolean;
  };
  onFetchAnalysis: () => void;
  onSendChat: (message: string) => void;
}) {
  const [chatInput, setChatInput] = useState('');
  const [checkedActions, setCheckedActions] = useState<Set<number>>(new Set());
  const [activeSection, setActiveSection] = useState<'insights' | 'chat'>('insights');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aiAnalysis.data && !aiAnalysis.loading && productProfileId) {
      onFetchAnalysis();
    }
  }, [productProfileId, aiAnalysis.data, aiAnalysis.loading, onFetchAnalysis]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat.messages]);

  const handleSendChat = () => {
    if (!chatInput.trim() || aiChat.loading) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const toggleAction = (index: number) => {
    setCheckedActions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const insights = aiAnalysis.data?.insights;

  return (
    <motion.div
      variants={panelChild}
      className="w-[380px] flex-shrink-0 flex flex-col bg-gray-900/50 border-l border-gray-800/50 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-800/40">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-sm font-semibold text-gray-200">
            AI Creative Strategist
          </h3>
        </div>
        {/* Section tabs */}
        <div className="flex bg-gray-800/40 rounded-lg p-0.5 border border-gray-700/30">
          {([
            { id: 'insights' as const, icon: BarChart3, label: 'Insights' },
            { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium transition-colors',
                activeSection === tab.id
                  ? 'bg-gray-700/60 text-gray-200'
                  : 'text-gray-500 hover:text-gray-400'
              )}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {activeSection === 'insights' ? (
            <motion.div
              key="insights"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="p-4 space-y-4"
            >
              {aiAnalysis.loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin mb-3" />
                  <p className="text-sm text-gray-500">Analyzing your creatives...</p>
                </div>
              ) : aiAnalysis.error ? (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-sm text-red-400">
                  {aiAnalysis.error}
                  <button
                    onClick={onFetchAnalysis}
                    className="block mt-2 text-xs text-red-300 underline"
                  >
                    Retry
                  </button>
                </div>
              ) : insights ? (
                <>
                  {/* Performance summary */}
                  <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Performance Insights
                      </h4>
                    </div>
                    <p className="text-sm text-gray-400 leading-relaxed">
                      <TypewriterText text={insights.summary} speed={15} />
                    </p>
                  </div>

                  {/* Winning patterns */}
                  {insights.winningPatterns.length > 0 && (
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="w-4 h-4 text-amber-400" />
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          What&apos;s Working
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {insights.winningPatterns.slice(0, 4).map((p, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 text-sm"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 flex-shrink-0" />
                            <div>
                              <span className="text-gray-300">{p.pattern}</span>
                              <span className="text-xs text-gray-600 ml-2">
                                {p.avgRoas.toFixed(1)}x ROAS
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommendations */}
                  {(insights.suggestedPTs.length > 0 || insights.suggestedHeadlines.length > 0) && (
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="w-4 h-4 text-blue-400" />
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          What to Test
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {insights.suggestedPTs.slice(0, 3).map((s, i) => (
                          <div
                            key={`pt-${i}`}
                            className="text-sm text-gray-400 flex items-start gap-2"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                            <span>{s.reasoning}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action items */}
                  {insights.actionItems.length > 0 && (
                    <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/30">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-purple-400" />
                        <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                          Action Plan
                        </h4>
                      </div>
                      <div className="space-y-2">
                        {insights.actionItems.map((item, i) => {
                          const isChecked = checkedActions.has(i);
                          return (
                            <button
                              key={i}
                              onClick={() => toggleAction(i)}
                              className="flex items-center gap-2.5 w-full text-left group"
                            >
                              <div
                                className={cn(
                                  'w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all',
                                  isChecked
                                    ? 'bg-purple-500/20 border-purple-500/50'
                                    : 'border-gray-600 group-hover:border-gray-500'
                                )}
                              >
                                {isChecked && <Check className="w-2.5 h-2.5 text-purple-400" />}
                              </div>
                              <span
                                className={cn(
                                  'text-sm transition-colors',
                                  isChecked
                                    ? 'text-gray-600 line-through'
                                    : 'text-gray-400 group-hover:text-gray-300'
                                )}
                              >
                                {item}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-gray-600">
                  <Brain className="w-8 h-8 mb-2" />
                  <p className="text-sm">No analysis data available</p>
                  <button
                    onClick={onFetchAnalysis}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Load Analysis
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col h-full"
            >
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {aiChat.messages.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Ask about your creative performance</p>
                    <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                      {[
                        'What angles perform best?',
                        'Suggest new hooks to test',
                        'Why are my videos outperforming?',
                      ].map(q => (
                        <button
                          key={q}
                          onClick={() => onSendChat(q)}
                          className="text-[11px] px-2.5 py-1 rounded-full bg-gray-800/40 text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 border border-gray-700/30 transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {aiChat.messages.map((msg, i) => (
                  <ChatBubble
                    key={i}
                    role={msg.role}
                    content={msg.content}
                    actionItems={msg.actionItems}
                    onToggleAction={toggleAction}
                    checkedActions={checkedActions}
                  />
                ))}
                {aiChat.loading && (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Analyzing...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat input (always visible at bottom) */}
      <div className="p-3 border-t border-gray-800/40">
        <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/40 rounded-xl px-3 py-2 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendChat();
              }
            }}
            placeholder="Ask about your creatives..."
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim() || aiChat.loading}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              chatInput.trim() && !aiChat.loading
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'text-gray-600'
            )}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
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
  const removeCreativeFromBatch = useCreativeHubStore(s => s.removeCreativeFromBatch);
  const shuffleBatches = useCreativeHubStore(s => s.shuffleBatches);
  const clearBatches = useCreativeHubStore(s => s.clearBatches);
  const aiAnalysis = useCreativeHubStore(s => s.launchStudioAiAnalysis);
  const aiChat = useCreativeHubStore(s => s.launchStudioAiChat);
  const fetchAiAnalysis = useCreativeHubStore(s => s.fetchLaunchStudioAiAnalysis);
  const sendAiChat = useCreativeHubStore(s => s.sendLaunchStudioAiChat);
  const openLaunchWizardForProduct = useCreativeHubStore(s => s.openLaunchWizardForProduct);

  const [configExpanded, setConfigExpanded] = useState(false);
  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);

  const profile = useMemo(
    () => profiles.find(p => p.id === productId),
    [profiles, productId]
  );

  // Filter creatives for the current product
  const productCreatives = useMemo(
    () =>
      inboxCreatives.filter(
        c =>
          (!productId || c.productProfileId === productId) &&
          (c.uploadStatus === 'ready' || c.driveUrl)
      ),
    [inboxCreatives, productId]
  );

  const handleAutoBatch = useCallback(
    (mode: AutoBatchMode, size: AutoBatchSize) => {
      const strategyMap: Record<AutoBatchMode, BatchStrategy> = {
        sequential: 'sequential',
        by_format: 'by_format',
        shuffle: 'shuffle',
      };
      autoBatch(strategyMap[mode], size);
    },
    [autoBatch]
  );

  const handleFetchAnalysis = useCallback(() => {
    if (productId) {
      fetchAiAnalysis(storeId, productId);
    }
  }, [storeId, productId, fetchAiAnalysis]);

  const handleSendChat = useCallback(
    (message: string) => {
      if (productId) {
        sendAiChat(storeId, productId, message);
      }
    },
    [storeId, productId, sendAiChat]
  );

  const handleLaunch = useCallback(() => {
    if (productId && batches.length > 0) {
      close();
      openLaunchWizardForProduct(productId, [...selectedIds]);
    }
  }, [productId, batches, close, openLaunchWizardForProduct, selectedIds]);

  const launchReady = batches.length > 0 && selectedIds.size > 0;

  const handleSelectAll = useCallback(() => {
    // Select only the creatives in the current product scope
    const ids = productCreatives.map(c => c.id);
    // We must use the store action that sets selectedCreativeIds
    // But it selects ALL inbox creatives. Instead, we toggle each.
    // For efficiency, just call selectAll then filter.
    // Actually, the simpler approach: toggle each in productCreatives
    for (const c of productCreatives) {
      if (!selectedIds.has(c.id)) {
        toggleCreativeSelection(c.id);
      }
    }
  }, [productCreatives, selectedIds, toggleCreativeSelection]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-[100] flex flex-col bg-gray-950/98 backdrop-blur-sm"
        >
          {/* Header bar */}
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center justify-between px-6 py-3.5 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <Rocket className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-base font-bold text-white">
                  Creative Launch Studio
                </h2>
              </div>
              {profile && (
                <div className="flex items-center gap-2 ml-4 px-3 py-1 rounded-lg bg-gray-800/50 border border-gray-700/30">
                  <Package className="w-3.5 h-3.5 text-gray-500" />
                  <span className="text-sm text-gray-300 font-medium">
                    {profile.productName}
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={close}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </motion.div>

          {/* Three-panel layout */}
          <motion.div
            variants={panelStagger}
            initial="hidden"
            animate="visible"
            className="flex-1 flex overflow-hidden"
          >
            <LeftPanel
              creatives={productCreatives}
              profiles={profiles}
              selectedIds={selectedIds}
              onToggleCreative={toggleCreativeSelection}
              onSelectAll={handleSelectAll}
              onDeselectAll={deselectAll}
              onPreviewCreative={setPreviewCreative}
            />
            <CenterPanel
              selectedIds={selectedIds}
              creatives={inboxCreatives}
              batches={batches}
              onAutoBatch={handleAutoBatch}
              onRemoveBatch={removeBatch}
              onRemoveCreativeFromBatch={removeCreativeFromBatch}
              onShuffleBatches={shuffleBatches}
              onClearBatches={clearBatches}
              onLaunch={handleLaunch}
              launchReady={launchReady}
              configExpanded={configExpanded}
              onToggleConfig={() => setConfigExpanded(v => !v)}
              profile={profile}
            />
            <RightPanel
              storeId={storeId}
              productProfileId={productId ?? ''}
              aiAnalysis={aiAnalysis}
              aiChat={aiChat}
              onFetchAnalysis={handleFetchAnalysis}
              onSendChat={handleSendChat}
            />
          </motion.div>

          {/* Preview modal */}
          <AnimatePresence>
            {previewCreative && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                onClick={() => setPreviewCreative(null)}
              >
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative max-w-lg max-h-[80vh] bg-gray-900 rounded-2xl overflow-hidden border border-gray-800/50 shadow-2xl"
                >
                  <button
                    onClick={() => setPreviewCreative(null)}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-black/50 text-white hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  {previewCreative.thumbnailUrl ? (
                    <img
                      src={previewCreative.thumbnailUrl}
                      alt={previewCreative.creativeName}
                      className="w-full h-auto max-h-[60vh] object-contain"
                    />
                  ) : (
                    <div className="w-80 h-80 flex items-center justify-center bg-gray-800">
                      <ImageIcon className="w-12 h-12 text-gray-600" />
                    </div>
                  )}
                  <div className="p-4">
                    <h4 className="text-sm font-semibold text-white">
                      {previewCreative.creativeName}
                    </h4>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span className="capitalize">{previewCreative.creativeFormat}</span>
                      {previewCreative.hook && (
                        <>
                          <span className="text-gray-700">|</span>
                          <span>{previewCreative.hook}</span>
                        </>
                      )}
                      {previewCreative.angle && (
                        <>
                          <span className="text-gray-700">|</span>
                          <span>{previewCreative.angle}</span>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
