'use client';

import {
  useCallback,
  useEffect,
  Fragment,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BarChart3,
  ChevronDown,
  Check,
  ExternalLink,
  Eye,
  FolderTree,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  Moon,
  Play,
  GripVertical,
  RefreshCw,
  Rocket,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Sun,
  TestTube2,
  Video,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatClickUpFieldValue,
  getClickUpFieldHref,
} from '@/lib/creative-hub/clickupFieldFormatting';
import {
  CompactSelectionRail,
  StepNavigator,
} from '@/components/creative-hub/launch-center/CreativeLaunchStudioChrome';
import { SelectionAiContextPanel } from '@/components/creative-hub/launch-center/CreativeLaunchStudioAiContext';
import {
  AssetCard,
  CompactAssetCard,
  SourceRail,
} from '@/components/creative-hub/launch-center/CreativeLaunchStudioExplorer';
import {
  AssetListRow,
  AssetInspector,
  ColumnBrowserPanel,
  CreativeDetailsPanel,
  TaskDataPanel,
} from '@/components/creative-hub/launch-center/CreativeLaunchStudioSelectionPanels';
import {
  SectionCard,
  StepSummaryCard,
  StudioStepButton,
} from '@/components/creative-hub/launch-center/CreativeLaunchStudioShell';
import { CreativeLaunchStudioPlanningWorkspace } from '@/components/creative-hub/launch-center/CreativeLaunchStudioPlanningWorkspace';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import {
  useLaunchStudioPreferencesStore,
  type LaunchStudioHeaderVariant,
  type LaunchStudioPlannerVariant,
  type LaunchStudioTheme,
} from '@/stores/launchStudioPreferencesStore';
import { HealthCheckPanel } from '@/components/creative-hub/launch/HealthCheckPanel';
import type {
  CreativeAiTagSet,
  AIInsightsData,
  BatchStrategy,
  CopyItem,
  CreativeBatch,
  CreativeFormat,
  ExistingCampaignOption,
  InboxCreative,
  LaunchConfig,
  PreLaunchReport,
  ProductProfile,
  WinningAdsData,
} from '@/types/creativeHub';

interface CreativeLaunchStudioProps {
  storeId?: string;
}

interface TableColumnMenuPosition {
  top: number;
  left: number;
}

type BrowserMode = 'all_assets' | 'by_task' | 'by_folder';
type TestedFilter = 'all' | 'untested' | 'winner' | 'tested';
type SortMode = 'recommended' | 'name' | 'format' | 'tested';
type AiTab = 'brief' | 'chat';
type WorkbenchTab = 'inspect' | 'task' | 'schedule' | 'ai';
type SelectionViewMode = 'table' | 'grid' | 'list' | 'focus' | 'compact' | 'board';
type SelectionTableMode = 'default' | 'ai' | 'merged';
type TableLayoutMode = 'grouped' | 'creatives';
type LaunchWorkspaceStep = 'select' | 'batch' | 'schedule';
type LaunchStudioStep = LaunchWorkspaceStep;
type UploadDatePreset = 'all' | 'today' | 'this_week' | 'last_7' | 'last_30' | 'custom';
type SelectionColumnKey = 'asset' | 'media' | 'task' | 'folder' | 'uploaded' | 'creator' | 'status' | 'fields';
type TableSortDirection = 'asc' | 'desc';
type TableAiColumnKey = 'awarenessStage' | 'targetAge' | 'persona' | 'gender' | 'angle';
type TableRowMode = 'grouped' | 'creatives';
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
type HeaderStepId = 'select' | 'batch' | 'schedule';

interface SourceGroup {
  id: string;
  label: string;
  count: number;
  kind: 'task' | 'folder';
  assets: InboxCreative[];
  subtitle?: string;
  selectedCount: number;
}

interface HierarchicalTableTaskGroup extends SourceGroup {
  folders: SourceGroup[];
}

interface CustomFieldFacet {
  id: string;
  fieldName: string;
  value: string;
  label: string;
  count: number;
}

interface CustomFieldFacetGroup {
  fieldName: string;
  count: number;
  values: CustomFieldFacet[];
}

interface FetchedAdset {
  id: string;
  name: string;
  spend: number;
  status: string;
}

interface DynamicTableColumn {
  id: string;
  label: string;
  kind: 'base' | 'custom' | 'ai';
  baseKey?: SelectionColumnKey;
  fieldName?: string;
  aiKey?: TableAiColumnKey;
}

interface StrategyCard {
  id: string;
  label: string;
  description: string;
  strategy: BatchStrategy;
  size: number;
}

interface SelectionDiagnostics {
  title: string;
  reason: string;
  recommendedStrategy: BatchStrategy;
  recommendedSize: number;
  laneCount: number;
  totalDailyBudget: number;
  uniqueAngles: number;
  uniqueHooks: number;
  uniqueCreators: number;
  uniqueFolders: number;
  uniqueFormats: number;
  warnings: string[];
  strengths: string[];
}

interface LaunchHealthState {
  loading: boolean;
  report: PreLaunchReport | null;
  error: string | null;
  requestKey?: string;
}

const HEADER_VARIANTS: Array<{
  id: LaunchStudioHeaderVariant;
  label: string;
  helper: string;
  shortLabel: string;
}> = [
  { id: 'slimbar', label: 'Slim', helper: 'Slim sticky header', shortLabel: 'Slim' },
  { id: 'splitbar', label: 'Split', helper: 'Split utility bar', shortLabel: 'Split' },
  { id: 'chipbar', label: 'Chip', helper: 'Collapsed chip header', shortLabel: 'Chip' },
];

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
};

const DEFAULT_SELECTION_COLUMNS: SelectionColumnKey[] = [
  'asset',
  'media',
  'task',
  'folder',
  'uploaded',
  'creator',
  'status',
  'fields',
];

const TABLE_AI_COLUMNS: Array<{ id: TableAiColumnKey; label: string }> = [
  { id: 'awarenessStage', label: 'Awareness' },
  { id: 'targetAge', label: 'Target age' },
  { id: 'persona', label: 'Persona' },
  { id: 'gender', label: 'Gender' },
  { id: 'angle', label: 'Angle' },
];

const BASE_COLUMN_LABELS: Record<SelectionColumnKey, string> = {
  asset: 'Asset / name',
  media: 'Media',
  task: 'Task',
  folder: 'Folder',
  uploaded: 'Upload date',
  creator: 'Created by',
  status: 'Status',
  fields: 'Custom fields',
};

function getCustomColumnId(fieldName: string): string {
  return `custom:${fieldName}`;
}

function getAiColumnId(key: TableAiColumnKey): string {
  return `ai:${key}`;
}

function normalizeSelectionViewMode(viewMode?: SelectionViewMode): SelectionViewMode {
  if (viewMode === 'grid' || viewMode === 'list' || viewMode === 'focus' || viewMode === 'table') {
    return viewMode;
  }
  if (viewMode === 'board') {
    return 'list';
  }
  return 'table';
}

function SlimStickyStudioHeader({
  variant,
  setVariant,
  productName,
  selectedCount,
  launchCount,
  activeStep,
  structureLabel,
  onSetStep,
  onClose,
}: {
  variant: LaunchStudioHeaderVariant;
  setVariant: (value: LaunchStudioHeaderVariant) => void;
  productName?: string;
  selectedCount: number;
  launchCount: number;
  activeStep: HeaderStepId;
  structureLabel: string;
  onSetStep: (value: HeaderStepId) => void;
  onClose: () => void;
}) {
  const steps: Array<{ id: HeaderStepId; label: string; value: string }> = [
    { id: 'select', label: 'Select', value: `${selectedCount}` },
    { id: 'batch', label: 'Batch', value: `${launchCount}` },
    { id: 'schedule', label: 'Launch', value: structureLabel },
  ];
  const currentStepLabel =
    activeStep === 'select' ? 'Selecting creatives' : activeStep === 'batch' ? 'Batch planning' : 'Launch setup';

  const variantPicker = (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white/90 p-1 shadow-[0_10px_20px_rgba(15,23,42,0.05)]">
      {HEADER_VARIANTS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setVariant(item.id)}
          title={item.helper}
          className={cn(
            'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] transition',
            variant === item.id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
          )}
        >
          {item.shortLabel}
        </button>
      ))}
    </div>
  );

  if (variant === 'splitbar') {
    return (
      <header className="sticky top-0 z-20 border-b border-white/70 bg-[rgba(248,251,255,0.94)] px-4 py-2 shadow-[0_8px_24px_rgba(148,163,184,0.10)] backdrop-blur-xl">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3 rounded-[20px] border border-slate-200/80 bg-white/90 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#dbeafe_0%,#eff6ff_100%)] text-sky-700">
              <Rocket className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Launch header</p>
              <h2 className="truncate text-sm font-semibold text-slate-950">{productName || 'Creative Launch Studio'}</h2>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {steps.map((step) => (
              <button
                key={step.id}
                onClick={() => onSetStep(step.id)}
                className={cn(
                  'rounded-[18px] border px-3 py-2 text-left transition',
                  activeStep === step.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white/90 text-slate-700 hover:bg-white',
                )}
              >
                <p className={cn('text-[10px] font-semibold uppercase tracking-[0.18em]', activeStep === step.id ? 'text-slate-300' : 'text-slate-400')}>
                  {step.label}
                </p>
                <p className="mt-1 truncate text-sm font-semibold">{step.value}</p>
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            {variantPicker}
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:bg-white"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>
    );
  }

  if (variant === 'chipbar') {
    return (
      <header className="sticky top-0 z-20 border-b border-white/70 bg-[rgba(248,251,255,0.95)] px-4 py-2 shadow-[0_8px_22px_rgba(148,163,184,0.10)] backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-3 py-2 shadow-[0_8px_20px_rgba(15,23,42,0.04)]">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
              <Rocket className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{productName || 'Creative Launch Studio'}</p>
            </div>
          </div>

          <button onClick={() => onSetStep('select')} className={cn('rounded-full px-3 py-2 text-xs font-semibold transition', activeStep === 'select' ? 'bg-sky-100 text-sky-800' : 'bg-white/90 text-slate-700 hover:bg-white')}>
            {selectedCount} selected
          </button>
          <button onClick={() => onSetStep('batch')} className={cn('rounded-full px-3 py-2 text-xs font-semibold transition', activeStep === 'batch' ? 'bg-amber-100 text-amber-800' : 'bg-white/90 text-slate-700 hover:bg-white')}>
            {launchCount} in launch set
          </button>
          <button onClick={() => onSetStep('schedule')} className={cn('rounded-full px-3 py-2 text-xs font-semibold transition', activeStep === 'schedule' ? 'bg-emerald-100 text-emerald-800' : 'bg-white/90 text-slate-700 hover:bg-white')}>
            {structureLabel}
          </button>

          <div className="ml-auto flex items-center gap-2">
            {variantPicker}
            <button
              onClick={onClose}
              className="rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:bg-white"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-20 border-b border-white/70 bg-[rgba(248,251,255,0.95)] px-4 py-2 shadow-[0_8px_24px_rgba(148,163,184,0.10)] backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex min-w-0 flex-1 items-center gap-3 rounded-[18px] border border-slate-200/80 bg-white/92 px-3 py-2 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_100%)] text-white">
            <Rocket className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">Creative Launch Studio</p>
            <h2 className="truncate text-sm font-semibold text-slate-950">{productName || 'Creative Launch Studio'}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700">
            {selectedCount} selected
          </span>
          <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700">
            {currentStepLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700">
            {structureLabel}
          </span>
          {variantPicker}
          <button
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white/90 p-2.5 text-slate-500 shadow-[0_8px_20px_rgba(15,23,42,0.05)] hover:bg-white"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {steps.map((step) => (
          <button
            key={step.id}
            onClick={() => onSetStep(step.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[11px] font-semibold transition',
              activeStep === step.id ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-600 hover:bg-white',
            )}
          >
            {step.label} · {step.value}
          </button>
        ))}
      </div>
    </header>
  );
}

function SelectionModeSwitcher({
  viewMode,
  setViewMode,
  darkMode = false,
}: {
  viewMode: SelectionViewMode;
  setViewMode: (value: SelectionViewMode) => void;
  darkMode?: boolean;
}) {
  const modes: Array<{
    id: Exclude<SelectionViewMode, 'compact' | 'board'>;
    label: string;
    helper: string;
    icon: typeof BarChart3;
  }> = [
    { id: 'table', label: 'List', helper: 'Columns', icon: BarChart3 },
    { id: 'list', label: 'Browser', helper: 'Tasks', icon: FolderTree },
    { id: 'grid', label: 'Gallery', helper: 'Tiles', icon: LayoutGrid },
    { id: 'focus', label: 'Focus', helper: 'Hero', icon: Eye },
  ];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-[14px] p-1',
        darkMode
          ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(7,16,30,0.94)_0%,rgba(9,20,36,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border border-slate-200 bg-slate-50',
      )}
    >
      {modes.map((mode) => {
        const active = normalizeSelectionViewMode(viewMode) === mode.id;
        const Icon = mode.icon;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => setViewMode(mode.id)}
            title={mode.label}
            aria-label={mode.label}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-[10px] transition-all duration-200',
              active
                ? darkMode
                  ? 'bg-[linear-gradient(180deg,rgba(16,43,71,0.98)_0%,rgba(11,33,59,0.98)_100%)] text-slate-50 shadow-[0_14px_28px_rgba(2,132,199,0.22),inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : 'bg-white text-slate-950 shadow-[0_10px_22px_rgba(15,23,42,0.08)]'
                : darkMode
                  ? 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                  : 'text-slate-500 hover:bg-white/80 hover:text-slate-700',
            )}
          >
            <Icon
              className={cn(
                'h-4 w-4',
                active
                  ? darkMode
                    ? 'text-sky-300'
                    : 'text-sky-600'
                  : darkMode
                    ? 'text-slate-500'
                    : 'text-slate-400',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

function SortIndicator({
  active,
  direction,
  darkMode = false,
}: {
  active: boolean;
  direction?: TableSortDirection;
  darkMode?: boolean;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex h-5 w-5 items-center justify-center rounded-full border shadow-[0_4px_10px_rgba(15,23,42,0.05)] transition-all',
        active
          ? darkMode
            ? 'border-sky-400/40 bg-[linear-gradient(180deg,rgba(10,43,69,1)_0%,rgba(9,29,54,1)_100%)] text-sky-200 shadow-[0_8px_18px_rgba(14,165,233,0.2)]'
            : 'border-sky-200 bg-sky-50 text-sky-700'
          : darkMode
            ? 'border-white/10 bg-white/[0.05] text-slate-500'
            : 'border-slate-200 bg-white text-slate-400',
      )}
    >
      <SlidersHorizontal
        className={cn(
          'h-3 w-3',
          active ? (darkMode ? 'text-sky-200' : 'text-sky-700') : darkMode ? 'text-slate-500' : 'text-slate-400',
        )}
      />
      {active ? (
        <span
          className={cn(
            'absolute -right-1.5 -top-1 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full px-0.5 text-[7px] font-bold leading-none tracking-[0.14em]',
            darkMode ? 'bg-sky-400 text-slate-950 ring-2 ring-[#08111f]' : 'bg-sky-600 text-white ring-2 ring-white',
          )}
        >
          {direction === 'asc' ? 'A' : 'D'}
        </span>
      ) : null}
    </span>
  );
}

function ExplorerActionButton({
  onClick,
  icon,
  tooltip,
  active = false,
  darkMode = false,
}: {
  onClick: () => void;
  icon: ReactNode;
  tooltip: string;
  active?: boolean;
  darkMode?: boolean;
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        aria-label={tooltip}
        className={cn(
          'inline-flex h-9 w-9 items-center justify-center rounded-[14px] border transition-all duration-200',
          active
            ? darkMode
              ? 'border-sky-400/45 bg-[linear-gradient(180deg,rgba(14,45,74,0.98)_0%,rgba(10,29,53,0.98)_100%)] text-sky-200 shadow-[0_16px_30px_rgba(14,165,233,0.2),inset_0_1px_0_rgba(255,255,255,0.08)]'
              : 'border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,1)_0%,rgba(224,242,254,0.96)_100%)] text-sky-700 shadow-[0_14px_28px_rgba(14,165,233,0.14)]'
            : darkMode
              ? 'border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.04)_100%)] text-slate-300 shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:border-sky-400/20 hover:text-slate-50 hover:shadow-[0_14px_28px_rgba(2,132,199,0.14)]'
              : 'border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,1)_100%)] text-slate-600 shadow-[0_8px_18px_rgba(15,23,42,0.05)] hover:border-slate-300 hover:text-slate-800 hover:shadow-[0_12px_24px_rgba(15,23,42,0.08)]',
        )}
      >
        {icon}
      </button>
      <div className="pointer-events-none absolute left-1/2 top-[calc(100%+10px)] z-20 -translate-x-1/2">
        <div
          className={cn(
            'translate-y-1 whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.24)] transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100',
            darkMode
              ? 'border border-white/10 bg-[#08111f] text-slate-100'
              : 'bg-slate-950 text-white',
          )}
        >
          {tooltip}
        </div>
      </div>
    </div>
  );
}

function SortableTableColumnChip({
  column,
  onRemove,
  darkMode = false,
}: {
  column: DynamicTableColumn;
  onRemove?: (columnId: string) => void;
  darkMode?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'inline-flex items-center gap-2 rounded-[14px] px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em]',
        darkMode
          ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(10,20,36,0.96)_0%,rgba(7,15,29,0.96)_100%)] text-slate-200 shadow-[0_10px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.92)_100%)] text-slate-700 shadow-[0_8px_18px_rgba(15,23,42,0.05)]',
        isDragging && 'z-20 shadow-[0_12px_28px_rgba(15,23,42,0.14)]',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          'cursor-grab active:cursor-grabbing',
          darkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600',
        )}
        aria-label={`Drag ${column.label}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span>{column.label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(column.id)}
          className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label={`Remove ${column.label}`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

function matchesUploadDatePreset(
  uploadedAt: string | undefined,
  preset: UploadDatePreset,
  customStartDate: string,
  customEndDate: string,
) {
  if (preset === 'all') return true;
  if (!uploadedAt) return false;

  const assetDate = new Date(uploadedAt);
  if (Number.isNaN(assetDate.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'today') {
    return assetDate >= startOfToday;
  }

  if (preset === 'this_week') {
    const weekday = startOfToday.getDay();
    const diff = weekday === 0 ? 6 : weekday - 1;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - diff);
    return assetDate >= startOfWeek;
  }

  if (preset === 'last_7' || preset === 'last_30') {
    const days = preset === 'last_7' ? 7 : 30;
    const cutoff = new Date(startOfToday);
    cutoff.setDate(startOfToday.getDate() - (days - 1));
    return assetDate >= cutoff;
  }

  if (preset === 'custom') {
    if (!customStartDate && !customEndDate) return true;
    const start = customStartDate ? new Date(`${customStartDate}T00:00:00`) : null;
    const end = customEndDate ? new Date(`${customEndDate}T23:59:59`) : null;
    if (start && assetDate < start) return false;
    if (end && assetDate > end) return false;
    return true;
  }

  return true;
}

const panelVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.985 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, y: 18, scale: 0.985, transition: { duration: 0.16 } },
};

function truncate(value: string, max = 48): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function formatCurrencyMetric(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  return `$${value.toFixed(2)}`;
}

function formatRoasMetric(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0.00x';
  return `${value.toFixed(2)}x`;
}

function formatNumberMetric(value?: number, digits = 2): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0.00';
  return value.toFixed(digits);
}

const CTA_OPTIONS = [
  { value: 'SHOP_NOW', label: 'Shop Now' },
  { value: 'LEARN_MORE', label: 'Learn More' },
  { value: 'SIGN_UP', label: 'Sign Up' },
  { value: 'BUY_NOW', label: 'Buy Now' },
  { value: 'GET_OFFER', label: 'Get Offer' },
  { value: 'ORDER_NOW', label: 'Order Now' },
  { value: 'SUBSCRIBE', label: 'Subscribe' },
  { value: 'CONTACT_US', label: 'Contact Us' },
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'BOOK_NOW', label: 'Book Now' },
];

function getCtaLabel(value?: string): string {
  return CTA_OPTIONS.find((option) => option.value === value)?.label || value || 'Shop Now';
}

function getCustomFieldDisplayValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      return url.hostname.replace(/^www\./, '');
    } catch {
      return truncate(trimmed, 36);
    }
  }

  return truncate(trimmed, 42);
}

function isVideoCreative(creative: InboxCreative): boolean {
  return (
    creative.creativeFormat === 'video' ||
    creative.driveMimeType?.startsWith('video/') ||
    false
  );
}

function getPreviewUrl(creative: InboxCreative): string | undefined {
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

function getPastResultClasses(status?: InboxCreative['pastTestResult'] extends infer T
  ? T extends { status: infer U }
    ? U
    : never
  : never): string {
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

function getTableMediaMeta(creative: InboxCreative, darkMode = false) {
  const format = creative.creativeFormat?.toLowerCase();

  if (format === 'video' || isVideoCreative(creative)) {
    return {
      label: 'VIDEO',
      className:
        darkMode
          ? 'bg-[linear-gradient(180deg,rgba(18,28,46,0.96)_0%,rgba(11,20,36,0.98)_100%)] text-slate-100 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'bg-slate-900 text-white ring-1 ring-slate-700/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
    };
  }

  if (format === 'image') {
    return {
      label: 'IMAGE',
      className:
        darkMode
          ? 'bg-[linear-gradient(180deg,rgba(8,53,79,0.9)_0%,rgba(10,38,60,0.96)_100%)] text-sky-200 ring-1 ring-sky-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
    };
  }

  if (format === 'carousel') {
    return {
      label: 'CAROUSEL',
      className:
        darkMode
          ? 'bg-[linear-gradient(180deg,rgba(77,53,13,0.92)_0%,rgba(56,38,8,0.98)_100%)] text-amber-200 ring-1 ring-amber-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]',
    };
  }

  return {
    label: creative.creativeFormat ? creative.creativeFormat.toUpperCase() : 'ASSET',
    className:
      darkMode
        ? 'bg-[linear-gradient(180deg,rgba(19,28,44,0.94)_0%,rgba(12,20,34,0.98)_100%)] text-slate-200 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.88)]',
  };
}

function getTableCellTextClass(column: DynamicTableColumn, darkMode = false): string {
  if (column.kind === 'base') {
    switch (column.baseKey) {
      case 'task':
      case 'folder':
        return darkMode
          ? 'block truncate text-[13px] font-medium tracking-[0.01em] text-slate-200'
          : 'block truncate text-[13px] font-medium tracking-[0.01em] text-slate-800';
      case 'uploaded':
      case 'creator':
        return darkMode
          ? 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-300'
          : 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-700';
      case 'media':
        return darkMode
          ? 'block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500'
          : 'block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500';
      case 'fields':
        return darkMode
          ? 'block truncate text-[12px] font-medium text-slate-400'
          : 'block truncate text-[12px] font-medium text-slate-600';
      default:
        return darkMode
          ? 'block truncate text-[12.5px] text-slate-300'
          : 'block truncate text-[12.5px] text-slate-700';
    }
  }

  if (column.kind === 'ai') {
    return darkMode
      ? 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-300'
      : 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-700';
  }

  return darkMode
    ? 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-300'
    : 'block truncate text-[12.5px] font-medium tracking-[0.01em] text-slate-700';
}

function buildSourceGroups(
  creatives: InboxCreative[],
  selectedIds: Set<string>,
  kind: SourceGroup['kind'],
  options?: {
    preserveInputOrder?: boolean;
  },
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
    if (selectedIds.has(creative.id)) {
      group.selectedCount += 1;
    }
  }

  const groups = [...map.values()];
  if (options?.preserveInputOrder) {
    return groups;
  }

  return groups.sort((a, b) => {
    if (b.selectedCount !== a.selectedCount) return b.selectedCount - a.selectedCount;
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
}

function deriveStrategistTags(creative: InboxCreative) {
  if (creative.aiTags) {
    return creative.aiTags;
  }

  const haystack = [
    creative.clickupTaskName,
    creative.clickupDescription,
    creative.hook,
    creative.angle,
    ...(creative.clickupTags || []),
    ...(creative.clickupCustomFields || []).map((field) => `${field.name} ${field.value}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const awarenessStage =
    /retarget|remarket|winner|testimonial|review/.test(haystack)
      ? 'Consideration'
      : /hook|problem|pain|stop|attention/.test(haystack)
        ? 'Awareness'
        : /offer|buy|signup|free|download|cta/.test(haystack)
          ? 'Conversion'
          : 'Mid-funnel';
  const targetAge =
    /kid|child|parent|mom|dad|grandparent|family/.test(haystack)
      ? 'Parents / caregivers'
      : /student|teen/.test(haystack)
        ? 'Teens / students'
        : 'Broad adult';
  const persona =
    /grandparent/.test(haystack)
      ? 'Grandparent buyer'
      : /parent|mom|dad|family/.test(haystack)
        ? 'Parent / caregiver'
        : /teacher|homeschool/.test(haystack)
          ? 'Teacher / homeschool'
          : 'General buyer';
  const gender =
    /mom|mother|women|girl/.test(haystack)
      ? 'Female skew'
      : /dad|father|men|boy/.test(haystack)
        ? 'Male skew'
        : 'All gender';
  const angle =
    creative.angle ||
    (/social proof|review|testimonial/.test(haystack)
      ? 'Social proof'
      : /problem|pain|struggle/.test(haystack)
        ? 'Problem / solution'
        : /free|offer|save|discount/.test(haystack)
          ? 'Offer driven'
          : /benefit|learn|grow/.test(haystack)
            ? 'Benefit led'
            : 'General angle');

  return { awarenessStage, targetAge, persona, gender, angle };
}

function buildCustomFieldFacets(creatives: InboxCreative[]): CustomFieldFacet[] {
  const facets = new Map<string, CustomFieldFacet>();

  for (const creative of creatives) {
    for (const field of creative.clickupCustomFields || []) {
      if (field.hasValue === false) continue;
      const value = formatClickUpFieldValue(field).trim();
      if (!field.name?.trim() || !value) continue;
      const id = `${field.name}::${value}`.toLowerCase();
      const current = facets.get(id);
      if (current) {
        current.count += 1;
        continue;
      }
      facets.set(id, {
        id,
        fieldName: field.name,
        value,
        label: getCustomFieldDisplayValue(value),
        count: 1,
      });
    }
  }

  return [...facets.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 18);
}

function buildCustomFieldFacetGroups(facets: CustomFieldFacet[]): CustomFieldFacetGroup[] {
  const groups = new Map<string, CustomFieldFacetGroup>();

  for (const facet of facets) {
    const current = groups.get(facet.fieldName);
    if (current) {
      current.count += facet.count;
      current.values.push(facet);
      continue;
    }

    groups.set(facet.fieldName, {
      fieldName: facet.fieldName,
      count: facet.count,
      values: [facet],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      values: [...group.values].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => b.count - a.count || a.fieldName.localeCompare(b.fieldName));
}

function summarizeColumnValues(
  values: string[] | InboxCreative[],
  columnOrEmpty?: DynamicTableColumn | string,
  fallbackEmptyLabel = '-',
): string {
  const emptyLabel = typeof columnOrEmpty === 'string' ? columnOrEmpty : fallbackEmptyLabel;

  const resolvedValues =
    typeof values[0] === 'string'
      ? (values as string[])
      : (values as InboxCreative[]).map((creative) => {
          if (!columnOrEmpty || typeof columnOrEmpty === 'string') return '';

          if (columnOrEmpty.kind === 'base') {
            switch (columnOrEmpty.baseKey) {
              case 'task':
                return creative.clickupTaskName || '';
              case 'folder':
                return creative.driveParentFolderName || '';
              case 'uploaded':
                return formatAssetDate(getAssetUploadedAt(creative)) || '';
              case 'creator':
                return creative.creator || creative.clickupAssignees?.[0]?.username || '';
              case 'status':
                return creative.clickupTaskStatus || creative.pastTestResult?.status || (creative.alreadyTested ? 'tested' : 'untested');
              case 'fields':
                return (creative.clickupCustomFields || [])
                  .filter((field) => field.hasValue !== false)
                  .map((field) => `${field.name}: ${formatClickUpFieldValue(field)}`)
                  .join(', ');
              default:
                return '';
            }
          }

          if (columnOrEmpty.kind === 'custom') {
            const field = (creative.clickupCustomFields || []).find((item) => item.name === columnOrEmpty.fieldName);
            return field ? formatClickUpFieldValue(field) : '';
          }

          const tags = deriveStrategistTags(creative);
          switch (columnOrEmpty.aiKey) {
            case 'awarenessStage':
              return tags.awarenessStage;
            case 'targetAge':
              return tags.targetAge;
            case 'persona':
              return tags.persona;
            case 'gender':
              return tags.gender;
            case 'angle':
              return tags.angle;
            default:
              return '';
          }
        });

  const unique = [...new Set(resolvedValues.map((value) => value.trim()).filter(Boolean))];
  if (unique.length === 0) return emptyLabel;
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} • ${unique[1]}`;
  return `${unique[0]} • ${unique[1]} +${unique.length - 2}`;
}

function matchesFacet(creative: InboxCreative, facetId: string | null): boolean {
  if (!facetId) return true;
  return (creative.clickupCustomFields || []).some((field) => {
    if (field.hasValue === false) return false;
    const value = formatClickUpFieldValue(field).trim();
    return `${field.name}::${value}`.toLowerCase() === facetId;
  });
}

function buildAiRecommendedSelection(creatives: InboxCreative[]): InboxCreative[] {
  if (creatives.length === 0) return [];

  const score = (creative: InboxCreative): number => {
    const uploadedAt = getAssetUploadedAt(creative);
    const freshness =
      uploadedAt && !Number.isNaN(new Date(uploadedAt).getTime())
        ? Math.max(0, 30 - Math.min(30, (Date.now() - new Date(uploadedAt).getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
    let value = freshness;
    if (!creative.alreadyTested) value += 18;
    if (creative.pastTestResult?.status === 'winner') value += 12;
    if (creative.hook) value += 5;
    if (creative.angle) value += 4;
    if (creative.clickupDescription?.trim()) value += 3;
    if ((creative.clickupCustomFields?.length || 0) > 0) value += 3;
    if ((creative.clickupTags?.length || 0) > 0) value += 2;
    if (isVideoCreative(creative)) value += 1;
    return value;
  };

  const ordered = [...creatives].sort(
    (a, b) => score(b) - score(a) || a.creativeName.localeCompare(b.creativeName),
  );

  const selected: InboxCreative[] = [];
  const seenFormats = new Set<string>();
  const seenTasks = new Set<string>();

  for (const creative of ordered) {
    const formatKey = creative.creativeFormat;
    const taskKey = creative.clickupTaskId || creative.clickupTaskName;
    const formatBonus = seenFormats.has(formatKey) ? 0 : 1;
    const taskBonus = seenTasks.has(taskKey) ? 0 : 1;
    if (selected.length < 2 || formatBonus || taskBonus) {
      selected.push(creative);
      seenFormats.add(formatKey);
      if (taskKey) seenTasks.add(taskKey);
    }
    if (selected.length >= Math.min(6, Math.max(3, creatives.length))) break;
  }

  return selected.length > 0 ? selected : ordered.slice(0, Math.min(5, ordered.length));
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
  const { assets, search, formatFilter, testedFilter, sortMode } = args;

  const filtered = assets.filter((creative) => {
    if (!matchesSearch(creative, search)) return false;
    if (formatFilter !== 'all' && creative.creativeFormat !== formatFilter) return false;
    if (testedFilter === 'untested' && creative.alreadyTested) return false;
    if (testedFilter === 'winner' && creative.pastTestResult?.status !== 'winner') return false;
    if (testedFilter === 'tested' && !creative.alreadyTested) return false;
    return true;
  });

  return filtered.sort((a, b) => {
    if (sortMode === 'name') {
      return a.creativeName.localeCompare(b.creativeName);
    }

    if (sortMode === 'format') {
      if (a.creativeFormat !== b.creativeFormat) {
        return a.creativeFormat.localeCompare(b.creativeFormat);
      }
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
  const {
    assets,
    search,
    formatFilter,
    testedFilter,
    sortMode,
    selectedIds,
    sourceChip,
    activeFacetId,
  } = args;

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
      (creative) =>
        creative.alreadyTested && creative.pastTestResult?.status !== 'winner',
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

function buildStrategyCards(
  selectedCreatives: InboxCreative[],
  batchSize: number,
): StrategyCard[] {
  if (selectedCreatives.length === 0) return [];

  const formatCount = new Set(selectedCreatives.map((creative) => creative.creativeFormat)).size;
  const folderCount = new Set(
    selectedCreatives.map(
      (creative) => creative.driveFolderId || creative.driveParentFolderName || creative.clickupTaskId,
    ),
  ).size;

  const cards: StrategyCard[] = [
    {
      id: 'diverse_mix',
      label: 'Diverse Mix',
      description: `Spread hooks, creators, and formats across ${batchSize}-asset test sets.`,
      strategy: 'smart_mix',
      size: batchSize,
    },
    {
      id: 'one_per_adset',
      label: 'One Per Ad Set',
      description: 'Run a fair, clean read with one asset in each ad set.',
      strategy: 'one_per_adset',
      size: 1,
    },
  ];

  if (formatCount > 1) {
    cards.push({
      id: 'format_split',
      label: 'Format Split',
      description: 'Separate videos, statics, and carousels to compare format performance.',
      strategy: 'by_format',
      size: batchSize,
    });
  }

  if (folderCount > 1) {
    cards.push({
      id: 'folder_split',
      label: 'Folder Split',
      description: 'Keep assets from each Drive folder grouped into their own test lanes.',
      strategy: 'by_folder',
      size: batchSize,
    });
  }

  return cards;
}

function buildDraftBatches(
  selectedCreatives: InboxCreative[],
  strategy: BatchStrategy,
  size: number,
): CreativeBatch[] {
  if (selectedCreatives.length === 0) {
    return [];
  }

  const effectiveSize = Math.max(size, 1);

  if (strategy === 'one_per_adset') {
    return selectedCreatives.map((creative, index) => ({
      id: `draft-batch-${index + 1}`,
      name: `Ad Set ${index + 1}`,
      creativeIds: [creative.id],
    }));
  }

  if (strategy === 'by_folder') {
    const grouped = new Map<string, InboxCreative[]>();
    for (const creative of selectedCreatives) {
      const key =
        creative.driveParentFolderName ||
        creative.clickupTaskName ||
        'Ungrouped';
      grouped.set(key, [...(grouped.get(key) || []), creative]);
    }

    const batches: CreativeBatch[] = [];
    let batchNumber = 1;
    for (const [groupName, creatives] of grouped.entries()) {
      for (let index = 0; index < creatives.length; index += effectiveSize) {
        batches.push({
          id: `draft-batch-${batchNumber}`,
          name: `${groupName} ${Math.floor(index / effectiveSize) + 1}`,
          creativeIds: creatives.slice(index, index + effectiveSize).map((creative) => creative.id),
        });
        batchNumber += 1;
      }
    }
    return batches;
  }

  if (strategy === 'by_format') {
    const ordered = [
      ...selectedCreatives.filter((creative) => creative.creativeFormat === 'video'),
      ...selectedCreatives.filter((creative) => creative.creativeFormat === 'image'),
      ...selectedCreatives.filter((creative) => creative.creativeFormat === 'carousel'),
    ];

    return chunkDraftBatches(ordered, effectiveSize, 'Format Batch');
  }

  if (strategy === 'smart_mix') {
    const remaining = [...selectedCreatives];
    const batchCount = Math.max(1, Math.ceil(remaining.length / effectiveSize));
    const draftBatches = Array.from({ length: batchCount }, (_, index) => ({
      id: `draft-batch-${index + 1}`,
      name: `Angle Mix ${index + 1}`,
      creativeIds: [] as string[],
    }));

    const priority = (creative: InboxCreative): number => {
      const result = creative.pastTestResult?.status;
      const testScore =
        result === 'winner'
          ? 4
          : result === 'inconclusive'
            ? 2
            : result === 'killed'
              ? -1
              : 3;
      const sourceScore = creative.sourceType === 'drive_asset' ? 1 : 0;
      const hookScore = creative.hook ? 1 : 0;
      return testScore + sourceScore + hookScore;
    };

    remaining.sort((a, b) => priority(b) - priority(a));

    const takeBestForBatch = (existingIds: string[]): InboxCreative | undefined => {
      if (remaining.length === 0) return undefined;
      if (existingIds.length === 0) return remaining.shift();

      const existingCreatives = existingIds
        .map((id) => selectedCreatives.find((creative) => creative.id === id))
        .filter((creative): creative is InboxCreative => Boolean(creative));

      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        let score = priority(candidate);

        if (!existingCreatives.some((creative) => creative.creativeFormat === candidate.creativeFormat)) {
          score += 4;
        }
        if (candidate.angle && !existingCreatives.some((creative) => creative.angle === candidate.angle)) {
          score += 3;
        }
        if (candidate.creator && !existingCreatives.some((creative) => creative.creator === candidate.creator)) {
          score += 2;
        }
        if (candidate.hook && !existingCreatives.some((creative) => creative.hook === candidate.hook)) {
          score += 2;
        }
        if (
          candidate.driveParentFolderName &&
          !existingCreatives.some(
            (creative) => creative.driveParentFolderName === candidate.driveParentFolderName,
          )
        ) {
          score += 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }

      return remaining.splice(bestIndex, 1)[0];
    };

    while (remaining.length > 0) {
      for (const batch of draftBatches) {
        if (batch.creativeIds.length >= effectiveSize || remaining.length === 0) continue;
        const next = takeBestForBatch(batch.creativeIds);
        if (next) {
          batch.creativeIds.push(next.id);
        }
      }
    }

    return draftBatches.filter((batch) => batch.creativeIds.length > 0);
  }

  return chunkDraftBatches(selectedCreatives, effectiveSize, 'Batch');
}

function chunkDraftBatches(
  creatives: InboxCreative[],
  size: number,
  label: string,
): CreativeBatch[] {
  const batches: CreativeBatch[] = [];

  for (let index = 0; index < creatives.length; index += size) {
    const batchNumber = Math.floor(index / size) + 1;
    batches.push({
      id: `draft-batch-${batchNumber}`,
      name: `${label} ${batchNumber}`,
      creativeIds: creatives.slice(index, index + size).map((creative) => creative.id),
    });
  }

  return batches;
}

function getStrategyLabel(strategy: BatchStrategy): string {
  switch (strategy) {
    case 'smart_mix':
      return 'Control vs challengers';
    case 'one_per_adset':
      return 'One per ad set';
    case 'by_format':
      return 'Format split';
    case 'by_folder':
      return 'Folder split';
    case 'shuffle':
      return 'Shuffle';
    case 'sequential':
      return 'Sequential';
    default:
      return 'Manual';
  }
}

function getAiModeLabel(mode?: string): string {
  switch (mode) {
    case 'history-plus-selection':
      return 'History + selection';
    case 'product-history':
      return 'Product history';
    case 'selection-only':
      return 'Selection brief';
    case 'meta-plus-creative':
      return 'Claude + Meta';
    case 'creative-only':
      return 'Claude planning';
    case 'meta-disabled-fallback':
    case 'creative-fallback':
    case 'meta-fallback-after-error':
    case 'creative-fallback-after-error':
    case 'meta-fallback-after-timeout':
    case 'creative-fallback-after-timeout':
      return 'Fallback planning';
    default:
      return 'Planning';
  }
}

function formatScheduleLabel(config: Partial<LaunchConfig>): string {
  if (config.launchTime === 'scheduled' && config.scheduledDate) {
    return `${config.scheduledDate} ${config.scheduledTime || '09:00'}`;
  }
  return 'Immediate';
}

function getProfileActiveCampaigns(
  profile?: ProductProfile,
): NonNullable<ProductProfile['campaignLinks']> {
  return (profile?.campaignLinks ?? []).filter(
    (campaign) => campaign.effectiveStatus === 'ACTIVE' || (!campaign.effectiveStatus && campaign.isActive),
  );
}

function buildExistingCampaignOptions(
  profile?: ProductProfile,
  selectedCount = 0,
): ExistingCampaignOption[] {
  return getProfileActiveCampaigns(profile).map((campaign) => {
    const structure: 'ABO' | 'CBO' =
      campaign.campaignDailyBudget || campaign.campaignLifetimeBudget ? 'CBO' : 'ABO';
    const budgetLabel =
      campaign.campaignDailyBudget != null && campaign.campaignDailyBudget > 0
        ? `$${campaign.campaignDailyBudget}/day`
        : campaign.campaignLifetimeBudget != null && campaign.campaignLifetimeBudget > 0
          ? `$${campaign.campaignLifetimeBudget} lifetime`
          : 'Ad set budget';
    const bidStrategyLabel = campaign.campaignBidStrategy
      ? campaign.campaignBidStrategy.replaceAll('_', ' ')
      : 'Highest volume or value';

    return {
      id: campaign.id,
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      campaignType: campaign.campaignType,
      structure,
      effectiveStatus: campaign.effectiveStatus || (campaign.isActive ? 'ACTIVE' : 'PAUSED'),
      isActive: campaign.isActive,
      budgetLabel,
      bidStrategyLabel,
      pageName: campaign.pageName,
      pixelName: campaign.pixelName,
      recommendation:
        selectedCount > 0 && campaign.campaignType === 'testing'
          ? 'Best fit for this launch because it is already a testing campaign.'
          : structure === 'CBO'
            ? 'Use this when you want campaign-level budget control.'
            : 'Use this when you want cleaner ad-set isolation.',
    };
  });
}

function createCopyItems(
  texts: string[],
  source: 'winner' | 'ai_generated' | 'manual',
): LaunchConfig['primaryTexts'] {
  return texts.map((text, index) => ({
    id: `${source}-${Date.now()}-${index}-${text.slice(0, 12).replace(/\s+/g, '-')}`,
    text,
    source,
  }));
}

function buildSuggestedCampaignName(productName?: string): string | undefined {
  if (!productName) return undefined;
  return `${productName} | Creative Test ${new Date().toISOString().slice(0, 10)}`;
}

function buildLaunchHealthKey(config: Partial<LaunchConfig>, creativeIds: string[]): string {
  return JSON.stringify({
    productProfileId: config.productProfileId || '',
    selectedCreativeIds: [...creativeIds].sort(),
    campaignMode: config.campaignMode || 'existing',
    existingCampaignId: config.existingCampaignId || '',
    newCampaignName: config.newCampaignName || '',
    adsetMode: config.adsetMode || 'new_adsets',
    adsetDistribution: config.adsetDistribution || 'one_per_adset',
    structure: config.structure || 'ABO',
    dailyBudget: config.dailyBudget ?? 0,
    testDuration: config.testDuration ?? 0,
    launchStatus: config.launchStatus || 'ACTIVE',
    adLaunchStatus: config.adLaunchStatus || config.launchStatus || 'ACTIVE',
    launchTime: config.launchTime || 'immediately',
    scheduledDate: config.scheduledDate || '',
    scheduledTime: config.scheduledTime || '',
    endDate: config.endDate || '',
    batches:
      config.batches?.map((batch) => ({
        id: batch.id,
        creativeIds: [...batch.creativeIds].sort(),
      })) || [],
    existingAdsetAssignments: Object.entries(config.existingAdsetAssignments || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([adsetId, ids]) => ({
        adsetId,
        creativeIds: [...ids].sort(),
      })),
  });
}

function buildSelectionDiagnostics(args: {
  selectedCreatives: InboxCreative[];
  batches: CreativeBatch[];
  batchSize: number;
  budget: number;
  structure: 'ABO' | 'CBO';
}): SelectionDiagnostics {
  const { selectedCreatives, batches, batchSize, budget, structure } = args;

  const uniqueAngles = new Set(
    selectedCreatives.map((creative) => creative.angle?.trim()).filter(Boolean),
  ).size;
  const uniqueHooks = new Set(
    selectedCreatives.map((creative) => creative.hook?.trim()).filter(Boolean),
  ).size;
  const uniqueCreators = new Set(
    selectedCreatives.map((creative) => creative.creator?.trim()).filter(Boolean),
  ).size;
  const uniqueFolders = new Set(
    selectedCreatives
      .map((creative) => creative.driveFolderId || creative.driveParentFolderName)
      .filter(Boolean),
  ).size;
  const uniqueFormats = new Set(selectedCreatives.map((creative) => creative.creativeFormat)).size;
  const winnerCount = selectedCreatives.filter(
    (creative) => creative.pastTestResult?.status === 'winner',
  ).length;
  const untestedCount = selectedCreatives.filter((creative) => !creative.alreadyTested).length;
  const laneCount =
    batches.length > 0
      ? batches.length
      : selectedCreatives.length === 0
        ? 0
        : Math.max(1, Math.ceil(selectedCreatives.length / Math.max(batchSize, 1)));
  const totalDailyBudget =
    structure === 'ABO'
      ? budget * Math.max(laneCount, 1)
      : budget;

  let recommendedStrategy: BatchStrategy = 'smart_mix';
  let recommendedSize = Math.max(batchSize, 3);
  let title = 'Balanced challenger test';
  let reason = 'Mix the set so each lane keeps enough variety without muddying the read.';

  if (selectedCreatives.length <= 1 || untestedCount >= Math.max(2, selectedCreatives.length - 1)) {
    recommendedStrategy = 'one_per_adset';
    recommendedSize = 1;
    title = 'Clean first read';
    reason = 'Most of this set is still untested. One creative per ad set gives the clearest signal fastest.';
  } else if (uniqueFormats > 1 && selectedCreatives.length >= 4) {
    recommendedStrategy = 'by_format';
    recommendedSize = Math.max(batchSize, 2);
    title = 'Format split';
    reason = 'You have mixed statics and video. Separate format effects before you judge hook performance.';
  } else if (uniqueFolders > 1 && selectedCreatives.length >= 4) {
    recommendedStrategy = 'by_folder';
    recommendedSize = Math.max(batchSize, 2);
    title = 'Angle cluster test';
    reason = 'Assets come from multiple folders or concepts. Keep each source cluster intact to compare angles cleanly.';
  }

  const warnings: string[] = [];
  const strengths: string[] = [];

  if (selectedCreatives.length > 6 && batches.length === 0) {
    warnings.push('This is a wide set. Build lanes before launch so spend does not get diluted.');
  }
  if (uniqueAngles <= 1 && selectedCreatives.length > 2) {
    warnings.push('Most selected creatives share the same angle, so learnings may cluster too tightly.');
  }
  if (uniqueFormats === 1 && selectedCreatives.length > 3) {
    warnings.push('All selected assets are the same format. Add a challenger format if you want broader signal.');
  }
  if (winnerCount > 0) {
    strengths.push(`${winnerCount} proven winner${winnerCount > 1 ? 's' : ''} can act as control.`);
  }
  if (untestedCount > 0) {
    strengths.push(`${untestedCount} untested creative${untestedCount > 1 ? 's' : ''} ready for fresh reads.`);
  }
  if (uniqueHooks > 1 || uniqueAngles > 1) {
    strengths.push('Selection has enough hook or angle diversity for a useful comparison.');
  }

  return {
    title,
    reason,
    recommendedStrategy,
    recommendedSize,
    laneCount,
    totalDailyBudget,
    uniqueAngles,
    uniqueHooks,
    uniqueCreators,
    uniqueFolders,
    uniqueFormats,
    warnings,
    strengths,
  };
}

function LaunchPlannerPanel({
  storeId,
  profile,
  selectedCreatives,
  launchConfig,
  theme,
  diagnostics,
  aiAnalysis,
  winningAds,
  existingCampaignOptions,
  batches,
  batchSize,
  activeStrategy,
  healthState,
  reviewDisabled,
  reviewHint,
  creativeLookup,
  setBatchSize,
  updateLaunchConfig,
  onRefreshHealthCheck,
  onRefreshAiDraft,
  onReviewLaunch,
  onApplyStrategy,
  onApplyAiLaunchAction,
  onApplyRecommendedStrategy,
  onClearBatches,
  plannerMode = 'full',
}: {
  storeId: string;
  profile?: ProductProfile;
  selectedCreatives: InboxCreative[];
  launchConfig: Partial<LaunchConfig>;
  theme: LaunchStudioTheme;
  diagnostics: SelectionDiagnostics;
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  winningAds: WinningAdsData | null;
  existingCampaignOptions: ExistingCampaignOption[];
  batches: CreativeBatch[];
  batchSize: number;
  activeStrategy: BatchStrategy;
  healthState: LaunchHealthState;
  reviewDisabled: boolean;
  reviewHint?: string | null;
  creativeLookup: Map<string, InboxCreative>;
  setBatchSize: (value: number) => void;
  updateLaunchConfig: (partial: Partial<LaunchConfig>) => void;
  onRefreshHealthCheck: () => void;
  onRefreshAiDraft: () => void;
  onReviewLaunch: () => void;
  onApplyStrategy: (strategy: BatchStrategy, size: number) => void;
  onApplyAiLaunchAction: (actionId: string) => void;
  onApplyRecommendedStrategy: () => void;
  onClearBatches: () => void;
  plannerMode?: 'full' | 'batch' | 'schedule' | 'review';
}) {
  const darkMode = theme === 'dark';
  const structure = launchConfig.structure ?? profile?.defaultStructure ?? 'ABO';
  const budget = launchConfig.dailyBudget ?? profile?.defaultBudget ?? 20;
  const duration = launchConfig.testDuration ?? profile?.defaultDuration ?? 3;
  const launchStatus = launchConfig.launchStatus ?? 'ACTIVE';
  const launchTime = launchConfig.launchTime ?? 'immediately';
  const scheduledDate = launchConfig.scheduledDate ?? '';
  const scheduledTime = launchConfig.scheduledTime ?? '09:00';
  const campaignMode = launchConfig.campaignMode ?? 'existing';
  const activeCampaigns = getProfileActiveCampaigns(profile);
  const selectedCampaignName =
    activeCampaigns.find((campaign) => campaign.campaignId === launchConfig.existingCampaignId)?.campaignName ||
    (campaignMode === 'existing'
      ? activeCampaigns[0]?.campaignName || 'Choose campaign in review'
      : launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || 'New campaign');
  const launchDraft = aiAnalysis.data?.launchDraft;
  const actionCards = launchDraft?.actionCards || [];
  const copyPlan = launchDraft?.copyPlan;
  const primaryTexts = launchConfig.primaryTexts || [];
  const headlines = launchConfig.headlines || [];
  const descriptions = launchConfig.descriptions || [];
  const plannerIntro =
    plannerMode === 'batch'
      ? 'Use Claude’s action cards to draft the lane plan and copy set, then make only the final confirmations.'
      : plannerMode === 'schedule'
        ? 'Choose the safest campaign path, ad set path, budget, timing, and launch settings for the batch plan you already approved.'
        : plannerMode === 'review'
          ? 'Confirm the batch structure, campaign target, copy bundle, and backend readiness before launch.'
          : 'Claude can draft the lanes, copy, and launch path for you. You only confirm the decisions that matter.';
  const strategyCards = useMemo(
    () => buildStrategyCards(selectedCreatives, batchSize),
    [selectedCreatives, batchSize],
  );
  const [campaignAdsets, setCampaignAdsets] = useState<FetchedAdset[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [copyAutofillLoading, setCopyAutofillLoading] = useState(false);
  const [copyAutofillError, setCopyAutofillError] = useState<string | null>(null);
  const [copyLibraryTab, setCopyLibraryTab] = useState<'primary' | 'headlines' | 'ads' | 'claude'>('primary');
  const plannerPanelClass = darkMode
    ? 'rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,16,30,0.92)_0%,rgba(6,12,23,0.98)_100%)] shadow-[0_26px_60px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'rounded-[26px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)]';
  const plannerInsetClass = darkMode
    ? 'rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,26,45,0.92)_0%,rgba(9,18,33,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
    : 'rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#eef6ff_100%)] shadow-[0_16px_36px_rgba(59,130,246,0.08)]';
  const plannerSoftClass = darkMode
    ? 'rounded-[22px] border border-white/8 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
    : 'rounded-[22px] border border-slate-200/70 bg-slate-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]';
  const plannerChipClass = darkMode
    ? 'rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-semibold text-slate-200'
    : 'rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.05)]';
  const plannerButtonSecondary = darkMode
    ? 'rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08]'
    : 'rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50';
  const selectedCampaignId = launchConfig.existingCampaignId;
  const selectedAdsetAssignments = launchConfig.existingAdsetAssignments || {};
  const selectedCampaignOption =
    existingCampaignOptions.find((campaign) => campaign.campaignId === selectedCampaignId) ||
    existingCampaignOptions[0] ||
    null;
  const selectedAssignedAdsetId = Object.keys(selectedAdsetAssignments)[0] || '';
  const selectedAssignedAdset =
    campaignAdsets.find((adset) => adset.id === selectedAssignedAdsetId) || null;

  useEffect(() => {
    const fetchAdsets = async () => {
      if (!storeId || campaignMode !== 'existing' || !selectedCampaignId) {
        setCampaignAdsets([]);
        setAdsetsLoading(false);
        return;
      }

      setAdsetsLoading(true);
      try {
        const params = new URLSearchParams({
          storeId,
          campaignId: selectedCampaignId,
        });
        const res = await fetch(`/api/meta/adsets?${params.toString()}`);
        const data = await res.json();
        const adsetRows = data.data ?? data.adsets ?? [];
        setCampaignAdsets(
          adsetRows.map((adset: Record<string, unknown>) => ({
            id: String(adset.id ?? ''),
            name: String(adset.name || 'Untitled ad set'),
            spend:
              typeof (adset.metrics as { spend?: unknown } | undefined)?.spend === 'number'
                ? Number((adset.metrics as { spend?: number }).spend || 0)
                : parseFloat(
                    String(
                      (adset.metrics as { spend?: string } | undefined)?.spend || '0',
                    ),
                  ) || 0,
            status: String(adset.status || 'UNKNOWN'),
          })),
        );
      } catch {
        setCampaignAdsets([]);
      } finally {
        setAdsetsLoading(false);
      }
    };

    void fetchAdsets();
  }, [campaignMode, selectedCampaignId, storeId]);

  const addCopyVariant = useCallback(
    (
      key: 'primaryTexts' | 'headlines' | 'descriptions',
      text: string,
      source: CopyItem['source'],
      extras?: Partial<CopyItem>,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const current = (launchConfig[key] as CopyItem[] | undefined) || [];
      if (current.some((item) => item.text.trim().toLowerCase() === trimmed.toLowerCase())) return;

      updateLaunchConfig({
        [key]: [
          ...current,
          {
            id: `${key}-${source}-${Date.now()}-${trimmed.slice(0, 16).replace(/\s+/g, '-')}`,
            text: trimmed,
            source,
            sourceRoas: extras?.sourceRoas,
            sourceCopyId: extras?.sourceCopyId,
          },
        ],
      } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const replaceCopyVariants = useCallback(
    (
      key: 'primaryTexts' | 'headlines' | 'descriptions',
      items: CopyItem[],
    ) => {
      updateLaunchConfig({ [key]: items } as Partial<LaunchConfig>);
    },
    [updateLaunchConfig],
  );

  const removeCopyVariant = useCallback(
    (key: 'primaryTexts' | 'headlines' | 'descriptions', id: string) => {
      const current = (launchConfig[key] as CopyItem[] | undefined) || [];
      updateLaunchConfig({
        [key]: current.filter((item) => item.id !== id),
      } as Partial<LaunchConfig>);
    },
    [launchConfig, updateLaunchConfig],
  );

  const handleClaudeCopyAutofill = useCallback(async () => {
    if (!profile?.id || !profile.productName) {
      setCopyAutofillError('Product details are missing, so Claude could not build the copy set.');
      return;
    }

    setCopyAutofillLoading(true);
    setCopyAutofillError(null);

    try {
      const creativeBrief = selectedCreatives
        .slice(0, 10)
        .map((creative, index) => {
          const customFieldSummary = (creative.clickupCustomFields || [])
            .slice(0, 4)
            .map((field) => `${field.name}: ${field.value}`)
            .join(' | ');

          return [
            `${index + 1}. ${creative.creativeName}`,
            creative.clickupTaskName ? `task: ${creative.clickupTaskName}` : null,
            creative.hook ? `hook: ${creative.hook}` : null,
            creative.angle ? `angle: ${creative.angle}` : null,
            creative.creator ? `creator: ${creative.creator}` : null,
            creative.driveParentFolderName ? `folder: ${creative.driveParentFolderName}` : null,
            creative.uploadedAt ? `uploaded: ${creative.uploadedAt}` : null,
            creative.clickupDescription ? `description: ${creative.clickupDescription}` : null,
            customFieldSummary ? `fields: ${customFieldSummary}` : null,
          ]
            .filter(Boolean)
            .join(' | ');
        })
        .join('\n');

      const response = await fetch('/api/creative-hub/copy-library/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productProfileId: profile.id,
          productName: profile.productName,
          productDescription:
            selectedCreatives
              .map((creative) => creative.clickupDescription?.trim())
              .find(Boolean) || '',
          offer:
            winningAds?.uniqueHeadlines[0]?.text ||
            selectedCreatives.map((creative) => creative.hook?.trim()).find(Boolean) ||
            '',
          targetAudience:
            selectedCreatives
              .flatMap((creative) => creative.clickupCustomFields || [])
              .find((field) => /audience|avatar|customer|persona/i.test(field.name))?.value ||
            '',
          selectionContext: creativeBrief,
          profitabilityFloor: launchConfig.roasFloor ?? profile.defaultRoasFloor ?? 1.2,
          existingWinners: (winningAds?.winningAds || []).slice(0, 6).map((ad) => ({
            primaryText: ad.creative.body,
            headline: ad.creative.headline,
            roas: ad.metrics.roas,
            cpa: ad.metrics.cpa,
            ctr: ad.metrics.ctr,
          })),
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        primaryTexts?: string[];
        headlines?: string[];
        descriptions?: string[];
      };

      if (!response.ok) {
        throw new Error(data.error || 'Claude copy regeneration failed');
      }

      const nextPrimaryTexts = createCopyItems(data.primaryTexts || [], 'ai_generated');
      const nextHeadlines = createCopyItems(data.headlines || [], 'ai_generated');
      const nextDescriptions = createCopyItems(data.descriptions || [], 'ai_generated');

      updateLaunchConfig({
        primaryTexts: nextPrimaryTexts.length > 0 ? nextPrimaryTexts : launchConfig.primaryTexts,
        headlines: nextHeadlines.length > 0 ? nextHeadlines : launchConfig.headlines,
        descriptions: nextDescriptions.length > 0 ? nextDescriptions : launchConfig.descriptions,
        ctaType: winningAds?.autoFill.cta || launchConfig.ctaType || 'SHOP_NOW',
      });
    } catch (error) {
      setCopyAutofillError(
        error instanceof Error ? error.message : 'Claude copy regeneration failed.',
      );
    } finally {
      setCopyAutofillLoading(false);
    }
  }, [
    launchConfig.ctaType,
    launchConfig.descriptions,
    launchConfig.destinationUrl,
    launchConfig.headlines,
    launchConfig.primaryTexts,
    launchConfig.roasFloor,
    profile?.defaultRoasFloor,
    profile?.destinationUrl,
    profile?.id,
    profile?.productName,
    selectedCreatives,
    updateLaunchConfig,
    winningAds?.autoFill.cta,
    winningAds?.uniqueHeadlines,
    winningAds?.winningAds,
  ]);

  return (
    <SectionCard
      title={plannerMode === 'batch' ? 'Batch + Copy Planner' : plannerMode === 'schedule' ? 'Schedule + Launch Plan' : plannerMode === 'review' ? 'Review + Launch Plan' : 'Launch Plan'}
      className={cn(
        darkMode
          ? 'border-white/10 bg-[linear-gradient(180deg,rgba(8,16,30,0.96)_0%,rgba(6,12,23,1)_100%)] shadow-[0_26px_60px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.04)]'
          : 'border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)]',
      )}
      headerClassName={cn(darkMode ? 'border-white/10' : 'border-slate-200/80')}
    >
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-[26px] p-4 shadow-[0_16px_36px_rgba(37,99,235,0.16)]',
            darkMode
              ? 'border border-white/10 bg-[linear-gradient(135deg,rgba(10,18,34,0.98)_0%,rgba(20,38,68,0.96)_58%,rgba(37,99,235,0.94)_100%)] text-white'
              : 'border border-sky-100 bg-[linear-gradient(135deg,#fdfefe_0%,#edf5ff_48%,#2563eb_100%)] text-slate-950',
          )}
        >
          <p className={cn('text-[11px] uppercase tracking-[0.22em]', darkMode ? 'text-slate-300' : 'text-slate-600')}>
            Operator brief
          </p>
          <h3 className="mt-1.5 text-base font-semibold">{diagnostics.title}</h3>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className={cn('rounded-[20px] px-3 py-2.5', darkMode ? 'bg-white/10' : 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]')}>
              <p className={cn(darkMode ? 'text-slate-300' : 'text-slate-500')}>Lanes</p>
              <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-950')}>{diagnostics.laneCount}</p>
            </div>
            <div className={cn('rounded-[20px] px-3 py-2.5', darkMode ? 'bg-white/10' : 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]')}>
              <p className={cn(darkMode ? 'text-slate-300' : 'text-slate-500')}>Spend model</p>
              <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-950')}>${diagnostics.totalDailyBudget}</p>
              <p className={cn('mt-1 text-[10px]', darkMode ? 'text-slate-300' : 'text-slate-500')}>
                {structure === 'ABO' ? `$${budget}/lane` : `${structure} total`}
              </p>
            </div>
            <div className={cn('rounded-[20px] px-3 py-2.5', darkMode ? 'bg-white/10' : 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]')}>
              <p className={cn(darkMode ? 'text-slate-300' : 'text-slate-500')}>Go live</p>
              <p className={cn('mt-1 text-sm font-semibold', darkMode ? 'text-white' : 'text-slate-950')}>
                {formatScheduleLabel(launchConfig)}
              </p>
            </div>
          </div>
        </div>
        {(plannerMode === 'full' || plannerMode === 'batch') && (
          <div className="grid gap-4 2xl:grid-cols-[1.2fr_minmax(0,1fr)]">
            <div className={cn(plannerPanelClass, 'p-4')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                    AI launch actions
                  </p>
                  <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                    Pick a draft and apply it
                  </p>
                </div>
                <button
                  onClick={onApplyRecommendedStrategy}
                  disabled={selectedCreatives.length === 0}
                  className={cn(
                    'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                    selectedCreatives.length > 0
                      ? darkMode
                        ? 'bg-white text-slate-950 hover:bg-slate-100'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                      : darkMode
                        ? 'bg-white/10 text-slate-500'
                        : 'bg-slate-100 text-slate-400',
                  )}
                >
                  Quick apply
                </button>
              </div>

              {aiAnalysis.loading && actionCards.length === 0 ? (
                <div className={cn('mt-4 flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm', darkMode ? 'border border-white/8 bg-white/[0.04] text-slate-300' : 'bg-slate-50 text-slate-600')}>
                  <Loader2 className={cn('h-4 w-4 animate-spin', darkMode ? 'text-slate-400' : 'text-slate-500')} />
                  Drafting batch actions from winner history and the current selected set...
                </div>
              ) : (
                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  {aiAnalysis.error && actionCards.length > 0 ? (
                    <div className="xl:col-span-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {aiAnalysis.error}
                    </div>
                  ) : null}
                  {aiAnalysis.error && actionCards.length === 0 ? (
                    <div className="xl:col-span-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {aiAnalysis.error}
                    </div>
                  ) : null}
                  {actionCards.length > 0 ? (
                    actionCards.map((card) => (
                      <div key={card.id} className={cn(plannerInsetClass, 'p-3.5')}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>{card.title}</p>
                            <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>{card.summary}</p>
                          </div>
                          <span className={plannerChipClass}>
                            {card.structure}
                          </span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <span className={plannerChipClass}>
                            {getStrategyLabel(card.strategy)}
                          </span>
                          <span className={plannerChipClass}>
                            ${card.budget}
                          </span>
                          <span className={plannerChipClass}>
                            {card.durationDays} days
                          </span>
                        </div>
                        <p className={cn('mt-2.5 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>{card.rationale}</p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          {card.bestFor.map((item) => (
                            <span key={item} className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', darkMode ? 'bg-sky-500/12 text-sky-200' : 'bg-sky-50 text-sky-700')}>
                              {item}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => onApplyAiLaunchAction(card.id)}
                          className={cn(
                            'mt-3 rounded-full px-3.5 py-2 text-xs font-semibold transition-all',
                            darkMode
                              ? 'bg-white text-slate-950 hover:bg-slate-100'
                              : 'bg-slate-900 text-white hover:bg-slate-800',
                          )}
                        >
                          Apply this draft
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className={cn('rounded-[22px] px-4 py-4 text-sm', darkMode ? 'border border-white/8 bg-white/[0.04] text-slate-400' : 'bg-slate-50 text-slate-500')}>
                      Select creatives to unlock Claude action cards for batching and copy.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={cn(plannerPanelClass, 'p-4')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                    Copy + payload
                  </p>
                  <p className={cn('mt-1.5 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                    Selected copy, CTA, and UTM
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleClaudeCopyAutofill}
                    disabled={copyAutofillLoading || selectedCreatives.length === 0}
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                      copyAutofillLoading || selectedCreatives.length === 0
                        ? darkMode
                          ? 'bg-sky-500/10 text-sky-300/50'
                          : 'bg-blue-50 text-blue-300'
                        : 'bg-blue-600 text-white hover:bg-blue-500',
                    )}
                  >
                    {copyAutofillLoading ? 'Writing…' : 'Claude autofill'}
                  </button>
                  <button
                    onClick={() =>
                      updateLaunchConfig({
                        primaryTexts: createCopyItems(
                          copyPlan?.primaryTexts || winningAds?.autoFill.primaryTexts || [],
                          'winner',
                        ),
                        headlines: createCopyItems(
                          copyPlan?.headlines || winningAds?.autoFill.headlines || [],
                          'winner',
                        ),
                        descriptions: createCopyItems(copyPlan?.descriptions || [], 'ai_generated'),
                        ctaType: winningAds?.autoFill.cta || launchConfig.ctaType || 'SHOP_NOW',
                      })
                    }
                    className={plannerButtonSecondary}
                  >
                    Apply bundle
                  </button>
                </div>
              </div>

              {copyAutofillError ? (
                <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                  {copyAutofillError}
                </div>
              ) : null}

              <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_minmax(0,0.9fr)]">
                <div className={cn(plannerSoftClass, 'p-3')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        CTA
                      </span>
                      <select
                        value={launchConfig.ctaType || winningAds?.autoFill.cta || winningAds?.bestCTA?.type || 'SHOP_NOW'}
                        onChange={(event) => updateLaunchConfig({ ctaType: event.target.value })}
                        className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100' : 'text-slate-900')}
                      >
                        {CTA_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={cn(plannerInsetClass, 'px-3 py-2.5')}>
                      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                        UTM
                      </span>
                      <input
                        value={launchConfig.utmTemplate || profile?.utmTemplate || ''}
                        onChange={(event) => updateLaunchConfig({ utmTemplate: event.target.value })}
                        placeholder="utm_source=facebook&utm_campaign={{campaign.name}}"
                        className={cn('mt-1.5 w-full bg-transparent text-sm font-semibold outline-none', darkMode ? 'text-slate-100 placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400')}
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid gap-2 xl:grid-cols-3">
                    {[
                      { key: 'primaryTexts' as const, label: 'PT', items: primaryTexts },
                      { key: 'headlines' as const, label: 'Headlines', items: headlines },
                      { key: 'descriptions' as const, label: 'Descriptions', items: descriptions },
                    ].map((group) => (
                      <div key={group.key} className={cn(plannerInsetClass, 'p-3')}>
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            {group.label}
                          </p>
                          <span className={plannerChipClass}>
                            {group.items.length}
                          </span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {group.items.length > 0 ? (
                            group.items.slice(0, 2).map((item) => (
                              <div key={item.id} className={cn('flex items-start justify-between gap-2 rounded-xl px-2.5 py-2', darkMode ? 'bg-white/[0.04]' : 'bg-slate-50')}>
                                <p className={cn('line-clamp-2 text-xs leading-5', darkMode ? 'text-slate-200' : 'text-slate-700')}>{item.text}</p>
                                <button
                                  onClick={() => removeCopyVariant(group.key, item.id)}
                                  className={cn('rounded-full p-1 ring-1 transition', darkMode ? 'bg-white/[0.04] text-slate-400 ring-white/10 hover:bg-white/[0.08]' : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-100')}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className={cn('rounded-xl px-2.5 py-2 text-xs', darkMode ? 'bg-white/[0.04] text-slate-500' : 'bg-slate-50 text-slate-500')}>
                              None
                            </div>
                          )}
                          {group.items.length > 2 ? (
                            <div className={cn('text-[11px] font-medium', darkMode ? 'text-slate-500' : 'text-slate-500')}>
                              +{group.items.length - 2} more
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={cn(plannerSoftClass, 'p-3')}>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'primary' as const, label: `Winning PT ${winningAds?.uniquePTs.length || 0}` },
                      { id: 'headlines' as const, label: `Headlines ${winningAds?.uniqueHeadlines.length || 0}` },
                      { id: 'ads' as const, label: `Ads ${winningAds?.winningAds.length || 0}` },
                      { id: 'claude' as const, label: 'Claude set' },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setCopyLibraryTab(tab.id)}
                        className={cn(
                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                          copyLibraryTab === tab.id
                            ? darkMode
                              ? 'bg-white text-slate-950'
                              : 'bg-slate-900 text-white'
                            : darkMode
                              ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.08]'
                              : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 space-y-2">
                    {copyLibraryTab === 'primary' ? (
                      winningAds?.uniquePTs.length ? (
                        winningAds.uniquePTs.slice(0, 3).map((pt) => (
                          <div key={pt.text} className="rounded-2xl bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 text-sm leading-5 text-slate-800">{pt.text}</p>
                              <button
                                onClick={() =>
                                  addCopyVariant('primaryTexts', pt.text, 'winner', {
                                    sourceRoas: pt.combinedRoas,
                                    sourceCopyId: pt.text,
                                  })
                                }
                                className={cn(
                                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                  primaryTexts.some((item) => item.text.trim().toLowerCase() === pt.text.trim().toLowerCase())
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-900 text-white hover:bg-slate-800',
                                )}
                              >
                                {primaryTexts.some((item) => item.text.trim().toLowerCase() === pt.text.trim().toLowerCase()) ? 'Added' : 'Use'}
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                {formatRoasMetric(pt.combinedRoas)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                {formatCurrencyMetric(pt.combinedSpend)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                CTR {formatNumberMetric(pt.avgCtr)}%
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          No winning PT yet.
                        </div>
                      )
                    ) : null}

                    {copyLibraryTab === 'headlines' ? (
                      winningAds?.uniqueHeadlines.length ? (
                        winningAds.uniqueHeadlines.slice(0, 3).map((headline) => (
                          <div key={headline.text} className="rounded-2xl bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="line-clamp-2 text-sm leading-5 text-slate-800">{headline.text}</p>
                              <button
                                onClick={() =>
                                  addCopyVariant('headlines', headline.text, 'winner', {
                                    sourceRoas: headline.combinedRoas,
                                    sourceCopyId: headline.text,
                                  })
                                }
                                className={cn(
                                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                  headlines.some((item) => item.text.trim().toLowerCase() === headline.text.trim().toLowerCase())
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-900 text-white hover:bg-slate-800',
                                )}
                              >
                                {headlines.some((item) => item.text.trim().toLowerCase() === headline.text.trim().toLowerCase()) ? 'Added' : 'Use'}
                              </button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                {formatRoasMetric(headline.combinedRoas)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                {formatCurrencyMetric(headline.combinedSpend)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                Ads {headline.adCount}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          No winning headlines yet.
                        </div>
                      )
                    ) : null}

                    {copyLibraryTab === 'ads' ? (
                      winningAds?.winningAds.length ? (
                        winningAds.winningAds.slice(0, 2).map((ad) => (
                          <div key={ad.id} className="rounded-2xl bg-white p-3">
                            <p className="line-clamp-1 text-sm font-semibold text-slate-900">
                              {ad.creative.headline || ad.name || 'Untitled ad'}
                            </p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
                              {ad.creative.body || 'No primary text captured'}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                {formatRoasMetric(ad.metrics.roas)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                CPC {formatCurrencyMetric(ad.metrics.cpc)}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                CPM {formatCurrencyMetric(ad.metrics.cpm)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {ad.creative.body ? (
                                <button
                                  onClick={() =>
                                    addCopyVariant('primaryTexts', ad.creative.body, 'winner', {
                                      sourceRoas: ad.metrics.roas,
                                      sourceCopyId: ad.id,
                                    })
                                  }
                                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  Use PT
                                </button>
                              ) : null}
                              {ad.creative.headline ? (
                                <button
                                  onClick={() =>
                                    addCopyVariant('headlines', ad.creative.headline, 'winner', {
                                      sourceRoas: ad.metrics.roas,
                                      sourceCopyId: ad.id,
                                    })
                                  }
                                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                >
                                  Use headline
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className={cn(plannerInsetClass, 'px-3 py-3 text-sm', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                          No winning ad examples yet.
                        </div>
                      )
                    ) : null}

                    {copyLibraryTab === 'claude' ? (
                      <div className={cn(plannerInsetClass, 'p-3')}>
                        <div className="grid gap-2">
                          {[
                            {
                              label: 'PT',
                              items: copyPlan?.primaryTexts || [],
                              onApplyAll: () =>
                                replaceCopyVariants(
                                  'primaryTexts',
                                  createCopyItems(copyPlan?.primaryTexts || [], 'ai_generated'),
                                ),
                            },
                            {
                              label: 'Headlines',
                              items: copyPlan?.headlines || [],
                              onApplyAll: () =>
                                replaceCopyVariants(
                                  'headlines',
                                  createCopyItems(copyPlan?.headlines || [], 'ai_generated'),
                                ),
                            },
                            {
                              label: 'Descriptions',
                              items: copyPlan?.descriptions || [],
                              onApplyAll: () =>
                                replaceCopyVariants(
                                  'descriptions',
                                  createCopyItems(copyPlan?.descriptions || [], 'ai_generated'),
                                ),
                            },
                          ].map((group) => (
                            <div key={group.label} className="rounded-xl bg-slate-50 px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                  {group.label}
                                </p>
                                <button
                                  onClick={group.onApplyAll}
                                  disabled={group.items.length === 0}
                                  className={cn(
                                    'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all',
                                    group.items.length > 0
                                      ? 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100'
                                      : 'bg-white text-slate-400 ring-1 ring-slate-200',
                                  )}
                                >
                                  Apply
                                </button>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {group.items.length > 0 ? (
                                  group.items.slice(0, 2).map((item) => (
                                    <div key={item} className="line-clamp-2 text-xs leading-5 text-slate-700">
                                      {item}
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-xs text-slate-500">No Claude draft yet.</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {(plannerMode === 'full' || plannerMode === 'batch') && (
          <div className={cn(plannerPanelClass, 'p-4')}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  Lane controls
                </p>
                <p className={cn('mt-2 text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>
                  Manual fallback controls
                </p>
                <p className={cn('mt-1 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-600')}>
                  Use these only when you want to override the drafted action cards.
                </p>
              </div>
              {batches.length > 0 && (
                <button
                  onClick={onClearBatches}
                  className={plannerButtonSecondary}
                >
                  Clear lanes
                </button>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Set size
              </span>
              {[3, 4, 5].map((size) => (
                <button
                  key={size}
                  onClick={() => setBatchSize(size)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                    batchSize === size
                      ? 'bg-blue-600 text-white'
                      : darkMode
                        ? 'bg-white/[0.05] text-slate-300 hover:bg-white/[0.08]'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {size}/set
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {strategyCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => onApplyStrategy(card.strategy, card.size)}
                  className={cn(
                    'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                    activeStrategy === card.strategy
                      ? darkMode
                        ? 'bg-white text-slate-950'
                        : 'bg-slate-950 text-white'
                      : darkMode
                        ? 'bg-white/[0.04] text-slate-300 ring-1 ring-white/10 hover:bg-white/[0.08]'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {card.label}
                </button>
              ))}
            </div>

            <div className={cn('mt-4 p-3', plannerSoftClass)}>
              <div className="flex items-center justify-between gap-3">
                <p className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  Current lane preview
                </p>
                <span className={plannerChipClass}>
                  {diagnostics.laneCount} lane{diagnostics.laneCount === 1 ? '' : 's'}
                </span>
              </div>

              {batches.length === 0 ? (
                <p className={cn('mt-3 text-xs leading-5', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  Apply a Claude draft or a batching preset to preview how the selected creatives will land in ad sets.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {batches.map((batch) => (
                    <div key={batch.id} className={cn(plannerInsetClass, 'px-3 py-3')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={cn('text-sm font-semibold', darkMode ? 'text-slate-100' : 'text-slate-900')}>{batch.name}</p>
                          <p className={cn('mt-1 text-xs', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                            {batch.creativeIds.length} asset{batch.creativeIds.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className={plannerChipClass}>
                          #{batch.id.replace('batch-', '').replace('draft-', '')}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {batch.creativeIds.map((creativeId) => (
                          <span
                            key={creativeId}
                            className={plannerChipClass}
                          >
                            {truncate(creativeLookup.get(creativeId)?.creativeName || creativeId, 22)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {(plannerMode === 'full' || plannerMode === 'schedule' || plannerMode === 'review') && (
          <div className="grid gap-4 2xl:grid-cols-[1.2fr_minmax(0,1fr)]">
            <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Campaign path
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    updateLaunchConfig({
                      campaignMode: 'existing',
                      adsetMode: launchConfig.adsetMode || 'new_adsets',
                    })
                  }
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                    campaignMode === 'existing'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  Existing
                </button>
                <button
                  onClick={() =>
                    updateLaunchConfig({
                      campaignMode: 'new',
                      adsetMode: 'new_adsets',
                      existingAdsetAssignments: undefined,
                      newCampaignName:
                        launchConfig.newCampaignName ||
                        buildSuggestedCampaignName(profile?.productName),
                    })
                  }
                  className={cn(
                    'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                    campaignMode === 'new'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  New
                </button>
              </div>

              {campaignMode === 'existing' ? (
                <div className="mt-4 grid gap-3">
                  {existingCampaignOptions.length > 0 ? (
                    <>
                      <select
                        value={selectedCampaignOption?.campaignId || ''}
                        onChange={(event) =>
                          updateLaunchConfig({
                            existingCampaignId: event.target.value || undefined,
                            existingAdsetAssignments: undefined,
                          })
                        }
                        className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
                      >
                        {existingCampaignOptions.map((campaign) => (
                          <option key={campaign.campaignId} value={campaign.campaignId}>
                            {campaign.campaignName} • {campaign.structure} • {campaign.effectiveStatus}
                          </option>
                        ))}
                      </select>
                      {selectedCampaignOption ? (
                        <div className="rounded-[18px] bg-slate-50 px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {selectedCampaignOption.campaignType}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {selectedCampaignOption.structure}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {selectedCampaignOption.effectiveStatus}
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                              {selectedCampaignOption.budgetLabel}
                            </span>
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-900">
                            {selectedCampaignOption.campaignName}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">
                            {selectedCampaignOption.recommendation}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                              {selectedCampaignOption.bidStrategyLabel}
                            </span>
                            {selectedCampaignOption.pageName ? (
                              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                                {selectedCampaignOption.pageName}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
                      No active linked campaigns were available for this product. Switch to new campaign mode for a fresh launch path.
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-[20px] border border-slate-200 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Suggested campaign name</span>
                    <input
                      value={launchConfig.newCampaignName || buildSuggestedCampaignName(profile?.productName) || ''}
                      onChange={(event) => updateLaunchConfig({ newCampaignName: event.target.value })}
                      className="mt-2 w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    />
                  </label>
                  <div className="rounded-[20px] bg-slate-50 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Suggested path</span>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {launchDraft?.recommendedStructure || structure} • ${launchDraft?.recommendedBudget || budget}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {launchDraft?.recommendedDurationDays || duration} day test window
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Ad set path
              </p>
              {campaignMode === 'existing' ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        updateLaunchConfig({
                          adsetMode: 'new_adsets',
                          existingAdsetAssignments: undefined,
                        })
                      }
                      className={cn(
                        'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                        (launchConfig.adsetMode || 'new_adsets') === 'new_adsets'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      New ad sets
                    </button>
                    <button
                      onClick={() => updateLaunchConfig({ adsetMode: 'existing_adsets' })}
                      className={cn(
                        'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                        launchConfig.adsetMode === 'existing_adsets'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      Existing ad sets
                    </button>
                  </div>

                  {(launchConfig.adsetMode || 'new_adsets') === 'new_adsets' ? (
                    <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Build fresh ad sets for this launch
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        This will create new ad sets inside the chosen campaign and apply the lane plan you approved in batching.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {[
                          { id: 'one_per_adset' as const, label: 'One per ad set' },
                          { id: 'distribute' as const, label: 'Use lane groups' },
                          { id: 'all_to_one' as const, label: 'All into one ad set' },
                        ].map((option) => (
                          <button
                            key={option.id}
                            onClick={() => updateLaunchConfig({ adsetDistribution: option.id })}
                            className={cn(
                              'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                              (launchConfig.adsetDistribution || 'one_per_adset') === option.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Add into existing ad sets
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Pick the live ad sets you want to use, then assign the selected creatives.
                          </p>
                        </div>
                        {adsetsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                            {campaignAdsets.length} ad sets
                          </span>
                        )}
                      </div>
                      <div className="mt-3 space-y-3">
                        {adsetsLoading ? (
                          <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500">
                            Loading ad sets from the selected campaign...
                          </div>
                        ) : campaignAdsets.length > 0 ? (
                          <>
                            <select
                              value={selectedAssignedAdsetId}
                              onChange={(event) =>
                                updateLaunchConfig({
                                  existingAdsetAssignments: event.target.value
                                    ? {
                                        [event.target.value]: selectedCreatives.map((creative) => creative.id),
                                      }
                                    : undefined,
                                })
                              }
                              className="w-full rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
                            >
                              <option value="">Choose an existing ad set</option>
                              {campaignAdsets.map((adset) => (
                                <option key={adset.id} value={adset.id}>
                                  {adset.name} • {adset.status} • Spend {formatCurrencyMetric(adset.spend)}
                                </option>
                              ))}
                            </select>
                            {selectedAssignedAdset ? (
                              <div className="rounded-[18px] border border-slate-200 bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{selectedAssignedAdset.name}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {selectedAssignedAdset.status} • Spend {formatCurrencyMetric(selectedAssignedAdset.spend)}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => updateLaunchConfig({ existingAdsetAssignments: undefined })}
                                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {selectedCreatives.map((creative) => (
                                    <span
                                      key={`${selectedAssignedAdset.id}-${creative.id}`}
                                      className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                                    >
                                      {truncate(creative.creativeName, 24)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="rounded-2xl bg-white px-4 py-4 text-sm text-slate-500">
                            No active ad sets were returned for this campaign.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
                  New campaigns always create fresh ad sets. Claude will recommend the cleanest lane structure and budget model for you.
                </div>
              )}
            </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Budget, timing, and structure
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => updateLaunchConfig({ structure: 'ABO' })}
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                      structure === 'ABO'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    ABO
                  </button>
                  <button
                    onClick={() => updateLaunchConfig({ structure: 'CBO' })}
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                      structure === 'CBO'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    CBO
                  </button>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-[20px] border border-slate-200 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Budget</span>
                    <div className="mt-2 flex items-center gap-1">
                      <span className="text-sm font-semibold text-slate-500">$</span>
                      <input
                        type="number"
                        min={1}
                        value={budget}
                        onChange={(event) =>
                          updateLaunchConfig({ dailyBudget: Number(event.target.value) || 0 })
                        }
                        className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      />
                    </div>
                  </label>
                  <label className="rounded-[20px] border border-slate-200 px-4 py-3">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Duration</span>
                    <div className="mt-2 flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={duration}
                        onChange={(event) =>
                          updateLaunchConfig({ testDuration: Number(event.target.value) || 0 })
                        }
                        className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                      />
                      <span className="text-xs text-slate-500">days</span>
                    </div>
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      updateLaunchConfig({
                        launchTime: 'immediately',
                        scheduledDate: undefined,
                      })
                    }
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                      launchTime === 'immediately'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    Immediate
                  </button>
                  <button
                    onClick={() =>
                      updateLaunchConfig({
                        launchTime: 'scheduled',
                        scheduledDate:
                          launchConfig.scheduledDate || new Date().toISOString().slice(0, 10),
                        scheduledTime: launchConfig.scheduledTime || '09:00',
                      })
                    }
                    className={cn(
                      'rounded-2xl px-3 py-2 text-sm font-semibold transition-all',
                      launchTime === 'scheduled'
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    Scheduled
                  </button>
                </div>

                {launchTime === 'scheduled' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(event) => updateLaunchConfig({ scheduledDate: event.target.value })}
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(event) => updateLaunchConfig({ scheduledTime: event.target.value })}
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  AI management
                </p>
                <div className="mt-3 flex items-center justify-between rounded-[20px] bg-slate-50 px-4 py-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Post-launch Claude management</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Claude can monitor the launch, but every change still requires confirmation.
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      updateLaunchConfig({
                        aiAutopilotEnabled: !(launchConfig.aiAutopilotEnabled ?? true),
                        aiAutopilotRequiresConfirmation: true,
                      })
                    }
                    className={cn(
                      'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                      launchConfig.aiAutopilotEnabled ?? true
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700',
                    )}
                  >
                    {launchConfig.aiAutopilotEnabled ?? true ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                  <p className="text-xs leading-6 text-slate-600">
                    Profitability is currently judged at{' '}
                    <span className="font-semibold text-slate-900">
                      {(launchConfig.roasFloor ?? launchDraft?.profitabilityFloor ?? 1.2).toFixed(1)}x ROAS
                    </span>{' '}
                    because this is a digital-product workflow.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Launch payload
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: 'Destination URL',
                      value: launchConfig.destinationUrl || profile?.destinationUrl || 'Missing destination URL',
                    },
                    {
                      label: 'UTM template',
                      value: launchConfig.utmTemplate || profile?.utmTemplate || 'Not set',
                    },
                    {
                      label: 'Pixel',
                      value: profile?.pixelName || profile?.pixelId || 'Missing pixel',
                    },
                    {
                      label: 'Page',
                      value: profile?.pageName || 'No linked page',
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[18px] bg-slate-50 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-[20px] bg-slate-50 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Copy handoff
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {copyPlan?.primaryTexts.length || primaryTexts.length || 0} primary texts,{' '}
                    {copyPlan?.headlines.length || headlines.length || 0} headlines, CTA{' '}
                    <span className="font-semibold text-slate-900">
                      {winningAds?.autoFill.cta || launchConfig.ctaType || 'SHOP_NOW'}
                    </span>
                    .
                  </p>
                  {(copyPlan?.primaryTexts.length || winningAds?.autoFill.primaryTexts.length || 0) > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(copyPlan?.primaryTexts || winningAds?.autoFill.primaryTexts || [])
                        .slice(0, 3)
                        .map((text, index) => (
                          <span
                            key={`${text}-${index}`}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200"
                          >
                            {truncate(text, 52)}
                          </span>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        {(plannerMode === 'full' || plannerMode === 'schedule' || plannerMode === 'review') && (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid gap-4 xl:grid-cols-4">
                {[
                  { label: 'Selected creatives', value: selectedCreatives.length },
                  { label: 'Lanes', value: diagnostics.laneCount },
                  { label: 'Primary texts', value: primaryTexts.length || copyPlan?.primaryTexts.length || 0 },
                  { label: 'Headlines', value: headlines.length || copyPlan?.headlines.length || 0 },
                ].map((item) => (
                  <div key={item.label} className="rounded-[20px] bg-slate-50 px-4 py-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Backend readiness
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Live checks cover tokens, upload readiness, landing page reachability, duplicate creatives, and product collisions.
                  </p>
                </div>
                {healthState.loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : healthState.report ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                    {healthState.report.failures} fail · {healthState.report.warnings} warn
                  </span>
                ) : null}
              </div>

              {healthState.error && (
                <div className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {healthState.error}
                </div>
              )}

              {healthState.report ? (
                <div className="mt-3">
                  <HealthCheckPanel report={healthState.report} />
                </div>
              ) : (
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  Select creatives to run the launch checks.
                </div>
              )}

              {reviewHint && (
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  {reviewHint}
                </div>
              )}
            </div>
            <button
              onClick={onReviewLaunch}
              disabled={reviewDisabled}
              className={cn(
                'inline-flex w-full items-center justify-center gap-2 rounded-[22px] px-4 py-3 text-sm font-semibold transition-all',
                !reviewDisabled
                  ? 'bg-slate-950 text-white shadow-[0_16px_32px_rgba(15,23,42,0.22)] hover:bg-slate-900'
                  : 'bg-slate-100 text-slate-400',
              )}
            >
              {healthState.loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {selectedCreatives.length > 0
                ? `Run final review & launch for ${selectedCreatives.length} asset${selectedCreatives.length === 1 ? '' : 's'}`
                : 'Select assets to continue'}
            </button>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function AiStrategistPanel({
  storeId,
  productId,
  selectedCreatives,
  focusedCreative,
  diagnostics,
  aiAnalysis,
  aiChat,
  fetchAnalysis,
  sendChat,
  onApplyStrategy,
}: {
  storeId: string;
  productId: string | null;
  selectedCreatives: InboxCreative[];
  focusedCreative: InboxCreative | null;
  diagnostics: SelectionDiagnostics;
  aiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  aiChat: {
    messages: Array<{ role: 'user' | 'assistant'; content: string; actionItems?: string[] }>;
    loading: boolean;
    meta?: {
      mode?: string;
      model?: string;
      toolCalls?: number;
      apiKeySource?: string;
      selectionAware?: boolean;
      degradedReason?: string;
    };
  };
  fetchAnalysis: (storeId: string, productProfileId: string) => Promise<void>;
  sendChat: (storeId: string, productProfileId: string, message: string) => Promise<void>;
  onApplyStrategy: (strategy: BatchStrategy, size: number) => void;
}) {
  const [activeTab, setActiveTab] = useState<AiTab>('brief');
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const selectionKey = useMemo(
    () => selectedCreatives.map((creative) => creative.id).sort().join('|') || 'none',
    [selectedCreatives],
  );

  useEffect(() => {
    if (
      productId &&
      storeId &&
      !aiAnalysis.loading &&
      !aiAnalysis.error &&
      (!aiAnalysis.data || (aiAnalysis.data.meta?.selectionKey || 'none') !== selectionKey)
    ) {
      void fetchAnalysis(storeId, productId);
    }
  }, [productId, storeId, aiAnalysis.data, aiAnalysis.error, aiAnalysis.loading, fetchAnalysis, selectionKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiChat.messages]);

  const strategyMeta = aiAnalysis.data?.meta;
  const effectiveSelectionPlan = useMemo(
    () =>
      aiAnalysis.data?.selectionPlan || {
        selectedCount: selectedCreatives.length,
        testedCount: selectedCreatives.filter((creative) => creative.alreadyTested).length,
        winnerCount: selectedCreatives.filter((creative) => creative.pastTestResult?.status === 'winner').length,
        untestedCount: selectedCreatives.filter((creative) => !creative.alreadyTested).length,
        uniqueAngles: diagnostics.uniqueAngles,
        uniqueHooks: diagnostics.uniqueHooks,
        uniqueCreators: diagnostics.uniqueCreators,
        uniqueFolders: diagnostics.uniqueFolders,
        uniqueFormats: diagnostics.uniqueFormats,
        recommendedStrategy: diagnostics.recommendedStrategy,
        recommendedSize: diagnostics.recommendedSize,
        title: diagnostics.title,
        reason: diagnostics.reason,
        strengths: diagnostics.strengths,
        cautions: diagnostics.warnings,
        nextMoves: [
          diagnostics.recommendedStrategy === 'one_per_adset'
            ? 'Start with one creative per ad set before mixing multiple variables.'
            : `Apply a ${getStrategyLabel(diagnostics.recommendedStrategy).toLowerCase()} structure before launch.`,
          diagnostics.uniqueHooks > 1 || diagnostics.uniqueAngles > 1
            ? 'Keep each lane focused on one obvious hook or angle question.'
            : 'Add one sharper challenger concept before expanding spend.',
          selectedCreatives.some((creative) => creative.pastTestResult?.status === 'winner')
            ? 'Hold your winner aside as control and do not bury it inside a large mix.'
            : 'Pick a clear control asset so the first launch has a stable benchmark.',
        ],
      },
    [aiAnalysis.data?.selectionPlan, diagnostics, selectedCreatives],
  );
  const historySummary = aiAnalysis.data?.insights;
  const historyModeLabel = getAiModeLabel(strategyMeta?.mode);
  const chatModeLabel = getAiModeLabel(aiChat.meta?.mode);
  const avoidMixingMessage =
    effectiveSelectionPlan.cautions[0] ||
    'No obvious mix conflict surfaced. Keep the first lane focused on one main question.';
  const nextActionMessage =
    effectiveSelectionPlan.nextMoves[0] ||
    'Move into review after you lock the first lane structure.';
  const quickPrompts = useMemo(
    () => [
      selectedCreatives.length > 0
        ? `Build me the cleanest test plan for these ${selectedCreatives.length} selected creatives.`
        : 'What is the best next creative test for this product?',
      focusedCreative
        ? `How would a media buyer position "${truncate(focusedCreative.creativeName, 40)}" against the rest of the set?`
        : 'What should I avoid testing together in the same batch?',
      'Give me a winner-plus-challengers batch structure',
    ],
    [focusedCreative, selectedCreatives.length],
  );

  const handleSend = useCallback(() => {
    if (!productId || !chatInput.trim()) return;
    void sendChat(storeId, productId, chatInput.trim());
    setChatInput('');
  }, [chatInput, productId, sendChat, storeId]);

  return (
    <SectionCard
      title="AI Strategist"
      action={
        <button
          onClick={() => {
            if (productId) {
              void fetchAnalysis(storeId, productId);
            }
          }}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Refresh brief
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[24px] bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_55%,#1d4ed8_100%)] p-4 text-white shadow-[0_18px_40px_rgba(30,64,175,0.22)]">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/12 p-2.5">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-300">
                Selected set + market context
              </p>
              <p className="mt-1 text-sm font-medium text-slate-100">
                {selectedCreatives.length > 0
                  ? `${selectedCreatives.length} assets ready for a buyer-grade launch plan`
                  : 'Analyzing this product for the next best test'}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-100/90">
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              Focus
              <p className="mt-1 text-sm font-semibold text-white">
                {focusedCreative?.creativeName || 'All assets'}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-3 py-2">
              Selected
              <p className="mt-1 text-sm font-semibold text-white">
                {selectedCreatives.length} creatives
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setActiveTab('brief')}
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all',
              activeTab === 'brief'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Strategy brief
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all',
              activeTab === 'chat'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Ask Claude
          </button>
        </div>

        {activeTab === 'brief' ? (
          <div className="space-y-4">
            {aiAnalysis.loading && (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                Building a selection-aware plan from product history and the current asset set...
              </div>
            )}

            {aiAnalysis.error && (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p>{aiAnalysis.error}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {historyModeLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {aiAnalysis.data?.source || 'fallback'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {aiAnalysis.data?.model || 'rule-based'}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {aiAnalysis.data?.analyzedAds || 0} ads analyzed
              </span>
              {strategyMeta?.selectionAware && (
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                  Selection-aware
                </span>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Best first structure
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {getStrategyLabel(effectiveSelectionPlan.recommendedStrategy)}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {effectiveSelectionPlan.reason}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Keep separate
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  Do not muddy the first read
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {avoidMixingMessage}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Next move
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  What to do now
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  {nextActionMessage}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Selected-set plan
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">
                    {effectiveSelectionPlan.title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {effectiveSelectionPlan.reason}
                  </p>
                </div>
                <button
                  onClick={() =>
                    onApplyStrategy(
                      effectiveSelectionPlan.recommendedStrategy,
                      effectiveSelectionPlan.recommendedSize,
                    )
                  }
                  disabled={selectedCreatives.length === 0}
                  className={cn(
                    'rounded-full px-3 py-2 text-xs font-semibold transition-all',
                    selectedCreatives.length > 0
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-slate-100 text-slate-400',
                  )}
                >
                  Apply {getStrategyLabel(effectiveSelectionPlan.recommendedStrategy)}
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Creatives</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {effectiveSelectionPlan.selectedCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Untested</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {effectiveSelectionPlan.untestedCount}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Hooks</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {effectiveSelectionPlan.uniqueHooks}
                  </p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-3 py-2">
                  <p className="text-slate-500">Formats</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {effectiveSelectionPlan.uniqueFormats}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="rounded-2xl bg-emerald-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Strengths
                  </p>
                  <div className="mt-2 space-y-2">
                    {(effectiveSelectionPlan.strengths.length > 0
                      ? effectiveSelectionPlan.strengths
                      : ['No major strengths surfaced yet.']).map((item) => (
                      <div key={item} className="flex gap-2 text-xs text-emerald-800">
                        <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-amber-50 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Watch-outs
                  </p>
                  <div className="mt-2 space-y-2">
                    {(effectiveSelectionPlan.cautions.length > 0
                      ? effectiveSelectionPlan.cautions
                      : ['No major structural risk called out for this selection.']).map((item) => (
                      <div key={item} className="flex gap-2 text-xs text-amber-800">
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Next moves
                </p>
                <div className="mt-2 space-y-2">
                  {effectiveSelectionPlan.nextMoves.slice(0, 3).map((item) => (
                    <div key={item} className="flex gap-2 text-sm text-slate-700">
                      <TestTube2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-500" />
                      <p>{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <BarChart3 className="h-3.5 w-3.5" />
                Meta history
              </div>
              {historySummary ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    {historySummary.summary}
                  </p>

                  {aiAnalysis.data?.analyzedAds === 0 && (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                      No winning Meta ads were available for this product yet, so the brief above is leaning on the selected creatives more than historical winners.
                    </div>
                  )}

                  {historySummary.winningPatterns.length > 0 && (
                    <div className="mt-4 space-y-3">
                      {historySummary.winningPatterns.slice(0, 3).map((pattern, index) => (
                        <div key={`${pattern.pattern}-${index}`} className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-sm font-semibold text-slate-900">{pattern.pattern}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {pattern.avgRoas.toFixed(1)}x avg ROAS
                          </p>
                          <p className="mt-2 text-xs leading-5 text-slate-500">{pattern.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 space-y-2">
                    {historySummary.actionItems.slice(0, 4).map((item, index) => (
                      <div key={`${item}-${index}`} className="flex gap-2 rounded-2xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                        <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600" />
                        <p>{item}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Refresh the brief to pull market history for this product.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {chatModeLabel}
              </span>
              {aiChat.meta?.model && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {aiChat.meta.model}
                </span>
              )}
              {typeof aiChat.meta?.toolCalls === 'number' && (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                  {aiChat.meta.toolCalls} tool call{aiChat.meta.toolCalls === 1 ? '' : 's'}
                </span>
              )}
              {aiChat.meta?.selectionAware && (
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                  Selection-aware
                </span>
              )}
            </div>
            {aiChat.meta?.degradedReason && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Claude is temporarily unavailable, so this answer is using the built-in planner. {aiChat.meta.degradedReason}
              </div>
            )}
            <div className="space-y-2">
              {aiChat.messages.length === 0 && (
                <div className="space-y-2">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      disabled={aiChat.loading}
                      onClick={() => {
                        setChatInput(prompt);
                        if (productId) {
                          void sendChat(storeId, productId, prompt);
                        }
                      }}
                      className={cn(
                        'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-700 transition',
                        aiChat.loading ? 'cursor-not-allowed opacity-60' : 'hover:bg-slate-50',
                      )}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
                {aiChat.messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm leading-6',
                      message.role === 'user'
                        ? 'ml-8 bg-slate-900 text-white'
                        : 'mr-5 border border-slate-200 bg-white text-slate-700',
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.actionItems && message.actionItems.length > 0 && (
                      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                        {message.actionItems.map((item) => (
                          <p key={item} className="text-xs text-slate-500">
                            {item}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {aiChat.loading && (
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                    Thinking through the test plan...
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask Claude how to structure this selected test..."
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400"
              />
              <button
                onClick={handleSend}
                disabled={!chatInput.trim() || aiChat.loading || !productId}
                className={cn(
                  'rounded-2xl px-4 py-3 text-sm font-semibold transition-all',
                  chatInput.trim() && !aiChat.loading && productId
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-400',
                )}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function PreviewModal({
  creative,
  onClose,
}: {
  creative: InboxCreative;
  onClose: () => void;
}) {
  const previewUrl = getPreviewUrl(creative);
  const hasVideo = isVideoCreative(creative);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 px-6 py-10 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.98 }}
        transition={{ duration: 0.18 }}
        onClick={(event) => event.stopPropagation()}
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[32px] bg-white shadow-[0_30px_80px_rgba(15,23,42,0.35)]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Full Preview
            </p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{creative.creativeName}</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2.5 text-slate-700 hover:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-h-0 items-center justify-center bg-slate-950 p-6">
            {previewUrl ? (
              hasVideo ? (
                <video
                  src={previewUrl}
                  controls
                  playsInline
                  className="max-h-full max-w-full rounded-[24px] bg-black"
                />
              ) : (
                <img
                  src={previewUrl}
                  alt={creative.creativeName}
                  className="max-h-full max-w-full rounded-[24px] object-contain"
                />
              )
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-400">
                No preview available
              </div>
            )}
          </div>

          <div className="overflow-y-auto border-l border-slate-200 bg-slate-50 p-6">
            <div className="space-y-4">
              <div className="rounded-2xl bg-white p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Task
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">{creative.clickupTaskName}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {creative.driveParentFolderName || creative.clickupListName || 'Creative source'}
                </p>
              </div>
              {creative.clickupDescription && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Description
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{creative.clickupDescription}</p>
                </div>
              )}
              {creative.clickupCustomFields && creative.clickupCustomFields.length > 0 && (
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Custom fields
                  </p>
                  <div className="mt-3 space-y-2">
                    {creative.clickupCustomFields.map((field) => (
                      <div key={field.id} className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{field.name}</p>
                        {getClickUpFieldHref(field) ? (
                          <a
                            href={getClickUpFieldHref(field) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 break-all text-sm text-blue-700 hover:text-blue-800 hover:underline"
                          >
                            {formatClickUpFieldValue(field)}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          <p className="mt-1 text-sm text-slate-700">{formatClickUpFieldValue(field)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function LaunchStudioStickyHeader({
  headerVariant,
  setHeaderVariant,
  theme,
  setTheme,
  productName,
  storeLabel,
  launchSetCount,
  activeStep,
  selectedCount,
  batchCount,
  scheduleLabel,
  onStepChange,
  onClose,
}: {
  headerVariant: LaunchStudioHeaderVariant;
  setHeaderVariant: (value: LaunchStudioHeaderVariant) => void;
  theme: LaunchStudioTheme;
  setTheme: (value: LaunchStudioTheme) => void;
  productName?: string;
  storeLabel?: string;
  launchSetCount: number;
  activeStep: LaunchStudioStep;
  selectedCount: number;
  batchCount: number;
  scheduleLabel: string;
  onStepChange: (step: LaunchStudioStep) => void;
  onClose: () => void;
}) {
  const steps = [
    { id: 'select' as const, label: 'Select', helper: `${selectedCount} picked` },
    { id: 'batch' as const, label: 'Batch', helper: `${batchCount} lanes` },
    { id: 'schedule' as const, label: 'Launch', helper: scheduleLabel },
  ];
  const darkMode = theme === 'dark';

  return (
    <header
      className={cn(
        'sticky top-0 z-20 px-4 py-2.5 backdrop-blur-xl',
        darkMode
          ? 'border-b border-white/10 bg-[linear-gradient(180deg,rgba(4,10,20,0.92)_0%,rgba(7,15,28,0.86)_100%)] shadow-[0_18px_48px_rgba(0,0,0,0.34)]'
          : 'border-b border-white/70 bg-[rgba(248,251,255,0.94)] shadow-[0_8px_24px_rgba(148,163,184,0.10)]',
      )}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {headerVariant === 'slimbar' ? (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_55%,#38bdf8_100%)] p-2 text-white shadow-[0_12px_24px_rgba(29,78,216,0.18)]">
                <Rocket className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn('truncate text-sm font-semibold', darkMode ? 'text-slate-50' : 'text-slate-950')}>
                    {productName || 'Creative Launch Studio'}
                  </p>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]',
                      darkMode
                        ? 'border border-white/10 bg-white/[0.04] text-slate-300'
                        : 'border border-slate-200 bg-white text-slate-500',
                    )}
                  >
                    {storeLabel || 'Store'}
                  </span>
                </div>
                <div className={cn('mt-1 flex flex-wrap items-center gap-1.5 text-[11px]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  <span className={cn('rounded-full px-2 py-0.5', darkMode ? 'bg-white/[0.04] text-slate-300' : 'bg-slate-100')}>
                    {launchSetCount} launch assets
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5', darkMode ? 'bg-white/[0.04] text-slate-300' : 'bg-slate-100')}>
                    {activeStep === 'select' ? 'Selection' : activeStep === 'batch' ? 'Batching' : 'Launch setup'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {headerVariant === 'splitbar' ? (
            <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
              <div className={cn('min-w-0 rounded-[18px] px-3 py-2', darkMode ? 'border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border border-slate-200 bg-white')}>
                <p className={cn('truncate text-[13px] font-semibold', darkMode ? 'text-slate-50' : 'text-slate-950')}>
                  {productName || 'Creative Launch Studio'}
                </p>
                <p className={cn('mt-0.5 truncate text-[11px]', darkMode ? 'text-slate-400' : 'text-slate-500')}>
                  {storeLabel || 'Store context'} • {launchSetCount} launch assets
                </p>
              </div>
              <div className={cn('flex items-center gap-1 overflow-x-auto rounded-[18px] px-2 py-1.5', darkMode ? 'border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border border-slate-200 bg-white')}>
                {steps.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => onStepChange(step.id)}
                    className={cn(
                      'rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition',
                      activeStep === step.id
                        ? darkMode
                          ? 'bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-sky-50 shadow-[0_14px_28px_rgba(14,165,233,0.18)]'
                          : 'bg-slate-900 text-white'
                        : darkMode
                          ? 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.07]'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                    )}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {headerVariant === 'chipbar' ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className={cn('min-w-0 rounded-[18px] px-3 py-2', darkMode ? 'border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border border-slate-200 bg-white')}>
                <p className={cn('truncate text-[13px] font-semibold', darkMode ? 'text-slate-50' : 'text-slate-950')}>
                  {productName || 'Creative Launch Studio'}
                </p>
                <p className={cn('mt-0.5 text-[11px]', darkMode ? 'text-slate-400' : 'text-slate-500')}>{storeLabel || 'Store context'}</p>
              </div>
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', darkMode ? 'border border-white/10 bg-white/[0.03] text-slate-200' : 'border border-slate-200 bg-white text-slate-700')}>
                {launchSetCount} assets
              </span>
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', darkMode ? 'border border-white/10 bg-white/[0.03] text-slate-200' : 'border border-slate-200 bg-white text-slate-700')}>
                {steps.find((step) => step.id === activeStep)?.label}
              </span>
              <div className={cn('flex items-center gap-1 rounded-full p-1', darkMode ? 'border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border border-slate-200 bg-white')}>
                {steps.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => onStepChange(step.id)}
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition',
                      activeStep === step.id
                        ? darkMode
                          ? 'bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-sky-100 shadow-[0_12px_26px_rgba(14,165,233,0.16)]'
                          : 'bg-sky-100 text-sky-700'
                        : darkMode
                          ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                          : 'text-slate-500 hover:bg-slate-100',
                    )}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <div className={cn('flex items-center gap-1 rounded-full p-1', darkMode ? 'border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'border border-slate-200 bg-white')}>
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition',
                  darkMode
                    ? 'bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-sky-100 shadow-[0_10px_24px_rgba(14,165,233,0.18)] hover:brightness-[1.04]'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                )}
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {darkMode ? 'Light' : 'Dark'}
              </button>
              {HEADER_VARIANTS.map((variant) => (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setHeaderVariant(variant.id)}
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] transition',
                    headerVariant === variant.id
                      ? darkMode
                        ? 'bg-white text-slate-950 shadow-[0_10px_22px_rgba(255,255,255,0.08)]'
                        : 'bg-slate-900 text-white'
                      : darkMode
                        ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
                        : 'text-slate-500 hover:bg-slate-100',
                  )}
                  title={variant.helper}
                >
                  {variant.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className={cn(
                'rounded-full p-2 shadow-[0_8px_20px_rgba(15,23,42,0.05)]',
                darkMode
                  ? 'border border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                  : 'border border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {headerVariant === 'slimbar' ? (
          <div className="grid gap-1.5 md:grid-cols-3">
            {steps.map((step) => (
              <button
                key={step.id}
                onClick={() => onStepChange(step.id)}
                className={cn(
                  'flex items-center justify-between rounded-[16px] border px-3 py-2 text-left transition',
                  activeStep === step.id
                    ? darkMode
                      ? 'border-sky-400/55 bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-white shadow-[0_16px_30px_rgba(14,165,233,0.16)]'
                      : 'border-slate-900 bg-slate-900 text-white'
                    : darkMode
                      ? 'border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                )}
              >
                <span className="text-xs font-semibold">{step.label}</span>
                <span
                  className={cn(
                    'text-[10px]',
                    activeStep === step.id
                      ? darkMode
                        ? 'text-sky-200'
                        : 'text-slate-300'
                      : darkMode
                        ? 'text-slate-400'
                        : 'text-slate-500',
                  )}
                >
                  {step.helper}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function CreativeLaunchStudio({ storeId }: CreativeLaunchStudioProps) {
  const resolvedStoreId = storeId || '';
  const isOpen = useCreativeHubStore((state) => state.launchStudioOpen);
  const productId = useCreativeHubStore((state) => state.launchStudioProductId);
  const close = useCreativeHubStore((state) => state.closeLaunchStudio);
  const profiles = useCreativeHubStore((state) => state.profiles);
  const inboxCreatives = useCreativeHubStore((state) => state.inboxCreatives);
  const selectedIds = useCreativeHubStore((state) => state.selectedCreativeIds);
  const toggleCreativeSelection = useCreativeHubStore((state) => state.toggleCreativeSelection);
  const setSelectedCreativeIds = useCreativeHubStore((state) => state.setSelectedCreativeIds);
  const deselectAllCreatives = useCreativeHubStore((state) => state.deselectAllCreatives);
  const batches = useCreativeHubStore((state) => state.batches);
  const batchStrategy = useCreativeHubStore((state) => state.batchStrategy);
  const autoBatch = useCreativeHubStore((state) => state.autoBatch);
  const clearBatches = useCreativeHubStore((state) => state.clearBatches);
  const launchConfig = useCreativeHubStore((state) => state.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((state) => state.updateLaunchConfig);
  const openLaunchWizardForProduct = useCreativeHubStore((state) => state.openLaunchWizardForProduct);
  const setLaunchStep = useCreativeHubStore((state) => state.setLaunchStep);
  const inboxLoading = useCreativeHubStore((state) => state.inboxLoading);
  const inboxError = useCreativeHubStore((state) => state.inboxError);
  const inboxNotConnected = useCreativeHubStore((state) => state.inboxNotConnected);
  const inboxNotConfigured = useCreativeHubStore((state) => state.inboxNotConfigured);
  const aiAnalysis = useCreativeHubStore((state) => state.launchStudioAiAnalysis);
  const aiChat = useCreativeHubStore((state) => state.launchStudioAiChat);
  const fetchAiAnalysis = useCreativeHubStore((state) => state.fetchLaunchStudioAiAnalysis);
  const sendAiChat = useCreativeHubStore((state) => state.sendLaunchStudioAiChat);
  const fetchWinningAds = useCreativeHubStore((state) => state.fetchWinningAds);
  const winningAds = useCreativeHubStore((state) => state.winningAds);
  const googleDriveConnected = useCreativeHubStore((state) => state.googleDriveConnected);
  const checkGoogleDriveConnection = useCreativeHubStore((state) => state.checkGoogleDriveConnection);
  const syncInbox = useCreativeHubStore((state) => state.syncInbox);
  const getLaunchStudioPreference = useLaunchStudioPreferencesStore((state) => state.getPreference);
  const setLaunchStudioPreference = useLaunchStudioPreferencesStore((state) => state.setPreference);

  const [browserMode, setBrowserMode] = useState<BrowserMode>('all_assets');
  const [sourceChip, setSourceChip] = useState<SelectionSourceChip>('all');
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [activeFieldName, setActiveFieldName] = useState<string | null>(null);
  const [activeFacetId, setActiveFacetId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [formatFilter, setFormatFilter] = useState<CreativeFormat | 'all'>('all');
  const [testedFilter, setTestedFilter] = useState<TestedFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recommended');
  const [batchSize, setBatchSize] = useState(3);
  const [activeStep, setActiveStep] = useState<LaunchStudioStep>('select');
  const [selectionViewMode, setSelectionViewMode] = useState<SelectionViewMode>('table');
  const [selectionDensity, setSelectionDensity] = useState<'compact' | 'comfortable'>('compact');
  const [headerVariant, setHeaderVariant] = useState<LaunchStudioHeaderVariant>('slimbar');
  const [plannerVariant, setPlannerVariant] = useState<LaunchStudioPlannerVariant>('option1');
  const [studioTheme, setStudioTheme] = useState<LaunchStudioTheme>('light');
  const [selectionTableMode, setSelectionTableMode] = useState<SelectionTableMode>('default');
  const [tableLayoutMode, setTableLayoutMode] = useState<TableLayoutMode>('grouped');
  const [columnTaskId, setColumnTaskId] = useState<string | null>(null);
  const [columnFolderId, setColumnFolderId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>('inspect');
  const [smartFiltersOpen, setSmartFiltersOpen] = useState(false);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [uploadDatePreset, setUploadDatePreset] = useState<UploadDatePreset>('all');
  const [customDateStart, setCustomDateStart] = useState('');
  const [customDateEnd, setCustomDateEnd] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<SelectionColumnKey[]>(DEFAULT_SELECTION_COLUMNS);
  const [expandedTableTaskIds, setExpandedTableTaskIds] = useState<string[]>([]);
  const [expandedTableFolderIds, setExpandedTableFolderIds] = useState<string[]>([]);
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [selectedCustomFieldColumns, setSelectedCustomFieldColumns] = useState<string[]>([]);
  const [tableColumnOrder, setTableColumnOrder] = useState<string[]>(
    DEFAULT_SELECTION_COLUMNS.map((column) => `base:${column}`),
  );
  const [tableSort, setTableSort] = useState<{ columnId: string; direction: TableSortDirection } | null>(null);
  const [tableColumnFilters, setTableColumnFilters] = useState<Record<string, string[]>>({});
  const [openTableColumnMenuId, setOpenTableColumnMenuId] = useState<string | null>(null);
  const [tableColumnMenuPosition, setTableColumnMenuPosition] = useState<TableColumnMenuPosition | null>(null);
  const [aiTagMap, setAiTagMap] = useState<Record<string, CreativeAiTagSet>>({});
  const [aiTaggingState, setAiTaggingState] = useState<{
    loading: boolean;
    error: string | null;
    lastTaggedAt?: string;
  }>({
    loading: false,
    error: null,
    lastTaggedAt: undefined,
  });
  const tableColumnMenuRef = useRef<HTMLDivElement | null>(null);
  const tableColumnMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const [healthState, setHealthState] = useState<LaunchHealthState>({
    loading: false,
    report: null,
    error: null,
    requestKey: undefined,
  });

  const profile = useMemo<ProductProfile | undefined>(
    () => profiles.find((item) => item.id === productId),
    [profiles, productId],
  );
  const preferenceKey = useMemo(
    () => (resolvedStoreId && productId ? `${resolvedStoreId}:${productId}` : null),
    [productId, resolvedStoreId],
  );

  const productCreativesBase = useMemo(
    () =>
      inboxCreatives.filter(
        (creative) =>
          (!productId || creative.productProfileId === productId) &&
          (creative.uploadStatus === 'ready' || creative.driveUrl),
      ),
    [inboxCreatives, productId],
  );
  const productCreatives = useMemo(
    () =>
      productCreativesBase.map((creative) =>
        aiTagMap[creative.id]
          ? {
              ...creative,
              aiTags: aiTagMap[creative.id],
            }
          : creative,
      ),
    [aiTagMap, productCreativesBase],
  );

  const selectedCreatives = useMemo(
    () => productCreatives.filter((creative) => selectedIds.has(creative.id)),
    [productCreatives, selectedIds],
  );

  const handleLoadAiTags = useCallback(async () => {
    if (!resolvedStoreId || !productId || productCreatives.length === 0 || aiTaggingState.loading) {
      return;
    }

    setAiTaggingState((current) => ({ ...current, loading: true, error: null }));
    try {
      const res = await fetch('/api/creative-hub/ai-tagging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: resolvedStoreId,
          productProfileId: productId,
          productName: profile?.productName,
          creatives: productCreatives,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate Gemini tags');
      }
      setAiTagMap(data.tags || {});
      setAiTaggingState({
        loading: false,
        error: null,
        lastTaggedAt: new Date().toISOString(),
      });
    } catch (error) {
      setAiTaggingState({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate Gemini tags',
        lastTaggedAt: undefined,
      });
    }
  }, [aiTaggingState.loading, productCreatives, productId, profile?.productName, resolvedStoreId]);

  const defaultDiagnostics = useMemo(
    () =>
      buildSelectionDiagnostics({
        selectedCreatives,
        batches: [],
        batchSize,
        budget: launchConfig.dailyBudget ?? profile?.defaultBudget ?? 20,
        structure: launchConfig.structure ?? profile?.defaultStructure ?? 'ABO',
      }),
    [
      batchSize,
      launchConfig.dailyBudget,
      launchConfig.structure,
      profile?.defaultBudget,
      profile?.defaultStructure,
      selectedCreatives,
    ],
  );

  const effectiveStrategy =
    batches.length > 0 ? batchStrategy || defaultDiagnostics.recommendedStrategy : defaultDiagnostics.recommendedStrategy;
  const effectiveBatchSize =
    effectiveStrategy === 'one_per_adset' ? 1 : Math.max(batchSize, 1);
  const effectiveBatches = useMemo(
    () =>
      batches.length > 0
        ? batches
        : buildDraftBatches(selectedCreatives, effectiveStrategy, effectiveBatchSize),
    [batches, effectiveBatchSize, effectiveStrategy, selectedCreatives],
  );

  const launchCreativeIds = useMemo(
    () =>
      effectiveBatches.length > 0
        ? [...new Set(effectiveBatches.flatMap((batch) => batch.creativeIds))]
        : selectedCreatives.map((creative) => creative.id),
    [effectiveBatches, selectedCreatives],
  );

  const creativeLookup = useMemo(
    () => new Map(productCreatives.map((creative) => [creative.id, creative])),
    [productCreatives],
  );

  const launchScopeCreatives = useMemo(
    () =>
      launchCreativeIds
        .map((creativeId) => creativeLookup.get(creativeId))
        .filter((creative): creative is InboxCreative => !!creative),
    [creativeLookup, launchCreativeIds],
  );
  const launchSelectionKey = useMemo(
    () => [...launchCreativeIds].sort().join('|') || 'none',
    [launchCreativeIds],
  );

  const taskGroups = useMemo(
    () => buildSourceGroups(productCreatives, selectedIds, 'task'),
    [productCreatives, selectedIds],
  );
  const folderGroups = useMemo(
    () => buildSourceGroups(
      productCreatives.filter((creative) => !!creative.driveFolderId || !!creative.driveParentFolderName),
      selectedIds,
      'folder',
    ),
    [productCreatives, selectedIds],
  );
  const currentGroups = browserMode === 'by_folder' ? folderGroups : taskGroups;

  const effectiveFormatFilter = useMemo<CreativeFormat | 'all'>(() => {
    if (sourceChip === 'images') return 'image';
    if (sourceChip === 'videos') return 'video';
    return formatFilter;
  }, [formatFilter, sourceChip]);

  const effectiveTestedFilter = useMemo<TestedFilter>(() => {
    if (sourceChip === 'untested') return 'untested';
    if (sourceChip === 'winners') return 'winner';
    if (sourceChip === 'testing') return 'tested';
    return testedFilter;
  }, [sourceChip, testedFilter]);

  useEffect(() => {
    if (!isOpen || !storeId) return;
    void checkGoogleDriveConnection(storeId);
    if (productId) {
      void fetchWinningAds(storeId, productId);
    }
  }, [checkGoogleDriveConnection, fetchWinningAds, isOpen, productId, storeId]);

  useEffect(() => {
    if (!isOpen) {
      setActiveStep('select');
      setWorkbenchTab('inspect');
      setSourceChip('all');
      setActiveFacetId(null);
      setSearch('');
      setFormatFilter('all');
      setTestedFilter('all');
      setSortMode('recommended');
      setBrowserMode('all_assets');
      setActiveGroupId(null);
      setColumnTaskId(null);
      setColumnFolderId(null);
      setFocusedId(null);
      setPreviewCreative(null);
      setSmartFiltersOpen(false);
      setDetailsDrawerOpen(false);
      setUploadDatePreset('all');
      setCustomDateStart('');
      setCustomDateEnd('');
      setShowSelectedOnly(false);
      setExpandedTableTaskIds([]);
      setExpandedTableFolderIds([]);
      setSelectionTableMode('default');
      setTableLayoutMode('grouped');
      setVisibleColumns(DEFAULT_SELECTION_COLUMNS);
      setSelectedCustomFieldColumns([]);
      setTableColumnOrder(DEFAULT_SELECTION_COLUMNS.map((column) => `base:${column}`));
      setTableSort(null);
      setTableColumnFilters({});
      setOpenTableColumnMenuId(null);
      setTableColumnMenuPosition(null);
      tableColumnMenuAnchorRef.current = null;
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !productId) return;
    const hasPresetSelection = (launchConfig.selectedCreativeIds?.length || 0) > 0;
    setActiveStep(hasPresetSelection ? 'batch' : 'select');
    setWorkbenchTab(hasPresetSelection ? 'schedule' : 'inspect');
    setSourceChip('all');
    setActiveFacetId(null);
    setSearch('');
    setFormatFilter('all');
    setTestedFilter('all');
    setSortMode('recommended');
    setBrowserMode('all_assets');
    setActiveGroupId(null);
    setColumnTaskId(null);
    setColumnFolderId(null);
    setFocusedId(null);
    setPreviewCreative(null);
    setSmartFiltersOpen(false);
    setDetailsDrawerOpen(false);
    setUploadDatePreset('all');
    setCustomDateStart('');
    setCustomDateEnd('');
    setShowSelectedOnly(false);
    setExpandedTableTaskIds([]);
    setExpandedTableFolderIds([]);
    setSelectionTableMode('default');
    setTableLayoutMode('grouped');
    setVisibleColumns(DEFAULT_SELECTION_COLUMNS);
    setSelectedCustomFieldColumns([]);
    setTableColumnOrder(DEFAULT_SELECTION_COLUMNS.map((column) => `base:${column}`));
    setTableSort(null);
    setTableColumnFilters({});
    setOpenTableColumnMenuId(null);
    setTableColumnMenuPosition(null);
    tableColumnMenuAnchorRef.current = null;
  }, [isOpen, launchConfig.selectedCreativeIds, productId]);

  useEffect(() => {
    if (!detailsDrawerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailsDrawerOpen]);

  useEffect(() => {
    if (!preferenceKey) return;
    const preference = getLaunchStudioPreference(preferenceKey);
    if (!preference) return;
    setBrowserMode(preference.browserMode);
    setSelectionViewMode(normalizeSelectionViewMode(preference.selectionViewMode));
    setSelectionDensity(preference.density);
    setHeaderVariant(preference.headerVariant || 'slimbar');
    setPlannerVariant(preference.plannerVariant || 'option1');
    setStudioTheme(preference.theme || 'light');
    if (preference.activeStep) {
      setActiveStep(preference.activeStep);
    }
  }, [getLaunchStudioPreference, preferenceKey]);

  useEffect(() => {
    if (!preferenceKey) return;
    setLaunchStudioPreference(preferenceKey, {
      browserMode,
      selectionViewMode: normalizeSelectionViewMode(selectionViewMode),
      density: selectionDensity,
      headerVariant,
      plannerVariant,
      theme: studioTheme,
      activeStep,
    });
  }, [
    activeStep,
    browserMode,
    headerVariant,
    plannerVariant,
    preferenceKey,
    selectionDensity,
    selectionViewMode,
    setLaunchStudioPreference,
    studioTheme,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const persistedIds = launchConfig.selectedCreativeIds || [];
    if (selectedIds.size === 0 && persistedIds.length > 0) {
      setSelectedCreativeIds(persistedIds);
    }
  }, [isOpen, launchConfig.selectedCreativeIds, selectedIds.size, setSelectedCreativeIds]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      documentElement.style.overflow = prevHtmlOverflow;
      documentElement.style.overscrollBehavior = prevHtmlOverscroll;
    };
  }, [isOpen]);

  const effectiveActiveGroupId = useMemo(() => {
    if (browserMode === 'all_assets') return null;
    if (activeGroupId && currentGroups.some((group) => group.id === activeGroupId)) {
      return activeGroupId;
    }
    return currentGroups[0]?.id || null;
  }, [activeGroupId, browserMode, currentGroups]);

  const currentGroup = useMemo(
    () => currentGroups.find((group) => group.id === effectiveActiveGroupId) || null,
    [currentGroups, effectiveActiveGroupId],
  );

  const scopedAssets = useMemo(() => {
    if (browserMode === 'all_assets' || !effectiveActiveGroupId) return productCreatives;
    return currentGroup?.assets || [];
  }, [browserMode, currentGroup, effectiveActiveGroupId, productCreatives]);

  const applySelectionFilters = useCallback(
    (assets: InboxCreative[]) =>
      applyStudioFilters({
        assets,
        search,
        formatFilter: effectiveFormatFilter,
        testedFilter: effectiveTestedFilter,
        sortMode,
        selectedIds,
        sourceChip,
        activeFacetId,
      }).filter((creative) =>
        matchesUploadDatePreset(
          getAssetUploadedAt(creative),
          uploadDatePreset,
          customDateStart,
          customDateEnd,
        ),
      ).filter((creative) => !showSelectedOnly || selectedIds.has(creative.id)),
    [
      activeFacetId,
      customDateEnd,
      customDateStart,
      effectiveFormatFilter,
      effectiveTestedFilter,
      search,
      selectedIds,
      showSelectedOnly,
      sortMode,
      sourceChip,
      uploadDatePreset,
    ],
  );

  const visibleAssets = useMemo(
    () => applySelectionFilters(scopedAssets),
    [applySelectionFilters, scopedAssets],
  );

  const hierarchicalTableGroups = useMemo<HierarchicalTableTaskGroup[]>(
    () =>
      buildSourceGroups(visibleAssets, selectedIds, 'task').map((taskGroup) => ({
        ...taskGroup,
        folders: buildSourceGroups(taskGroup.assets, selectedIds, 'folder'),
      })),
    [selectedIds, visibleAssets],
  );

  const focusedCreative = useMemo(
    () =>
      productCreatives.find((creative) => creative.id === focusedId) ||
      selectedCreatives[0] ||
      visibleAssets[0] ||
      null,
    [focusedId, productCreatives, selectedCreatives, visibleAssets],
  );

  const effectiveColumnTaskId = useMemo(() => {
    if (columnTaskId && taskGroups.some((group) => group.id === columnTaskId)) {
      return columnTaskId;
    }

    if (browserMode === 'by_task' && effectiveActiveGroupId && taskGroups.some((group) => group.id === effectiveActiveGroupId)) {
      return effectiveActiveGroupId;
    }

    if (browserMode === 'by_folder' && effectiveActiveGroupId) {
      const matchedTask = taskGroups.find((group) =>
        group.assets.some(
          (creative) =>
            (creative.driveFolderId ||
              creative.driveParentFolderName ||
              `${creative.clickupTaskId}-ungrouped`) === effectiveActiveGroupId,
        ),
      );
      if (matchedTask) return matchedTask.id;
    }

    return focusedCreative?.clickupTaskId || taskGroups[0]?.id || null;
  }, [browserMode, columnTaskId, effectiveActiveGroupId, focusedCreative?.clickupTaskId, taskGroups]);

  const columnTaskGroup = useMemo(
    () => taskGroups.find((group) => group.id === effectiveColumnTaskId) || null,
    [effectiveColumnTaskId, taskGroups],
  );

  const columnFolderGroups = useMemo(() => {
    const taskAssets = columnTaskGroup?.assets || [];
    if (taskAssets.length === 0) return [] as SourceGroup[];

    const nestedFolderGroups = buildSourceGroups(
      taskAssets.filter((creative) => !!creative.driveFolderId || !!creative.driveParentFolderName),
      selectedIds,
      'folder',
    );

    return [
      {
        id: `${columnTaskGroup?.id || 'task'}::all`,
        label: 'All assets in task',
        count: taskAssets.length,
        kind: 'folder' as const,
        assets: taskAssets,
        subtitle: columnTaskGroup?.label || undefined,
        selectedCount: taskAssets.filter((creative) => selectedIds.has(creative.id)).length,
      },
      ...nestedFolderGroups,
    ];
  }, [columnTaskGroup, selectedIds]);

  const effectiveColumnFolderId = useMemo(() => {
    if (columnFolderId && columnFolderGroups.some((group) => group.id === columnFolderId)) {
      return columnFolderId;
    }
    if (browserMode === 'by_folder' && effectiveActiveGroupId) {
      const matchedFolder = columnFolderGroups.find((group) => group.id === effectiveActiveGroupId);
      if (matchedFolder) return matchedFolder.id;
    }
    return columnFolderGroups[0]?.id || null;
  }, [browserMode, columnFolderGroups, columnFolderId, effectiveActiveGroupId]);

  const columnFolderGroup = useMemo(
    () => columnFolderGroups.find((group) => group.id === effectiveColumnFolderId) || null,
    [columnFolderGroups, effectiveColumnFolderId],
  );

  const columnVisibleAssets = useMemo(
    () => applySelectionFilters(columnFolderGroup?.assets || columnTaskGroup?.assets || []),
    [applySelectionFilters, columnFolderGroup?.assets, columnTaskGroup?.assets],
  );

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (previewCreative) {
          setPreviewCreative(null);
        } else {
          close();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeydown);
    }

    return () => window.removeEventListener('keydown', handleKeydown);
  }, [close, isOpen, previewCreative]);

  useEffect(() => {
    if (!isOpen) {
      setWorkbenchTab('inspect');
      setSelectionViewMode('table');
      setHealthState({ loading: false, report: null, error: null, requestKey: undefined });
    }
  }, [isOpen]);

  const totalVideos = productCreatives.filter((creative) => creative.creativeFormat === 'video').length;
  const totalImages = productCreatives.filter((creative) => creative.creativeFormat === 'image').length;
  const totalWinners = productCreatives.filter(
    (creative) => creative.pastTestResult?.status === 'winner',
  ).length;
  const totalDriveAssets = productCreatives.filter((creative) => creative.sourceType === 'drive_asset').length;
  const folderedAssets = productCreatives.filter(
    (creative) => creative.driveFolderId || creative.driveParentFolderName,
  ).length;
  const untestedAssets = productCreatives.filter((creative) => !creative.alreadyTested).length;
  const customFieldCount = productCreatives.reduce(
    (sum, creative) => sum + (creative.clickupCustomFields?.length || 0),
    0,
  );
  const sourceGroupCount = taskGroups.length + folderGroups.length;
  const defaultCampaignId =
    launchConfig.existingCampaignId ||
    getProfileActiveCampaigns(profile).find((campaign) => campaign.campaignType === 'testing')?.campaignId ||
    getProfileActiveCampaigns(profile)[0]?.campaignId;

  const preparedLaunchConfig = useMemo<Partial<LaunchConfig>>(
    () => ({
      ...launchConfig,
      productProfileId: productId || launchConfig.productProfileId || '',
      selectedCreativeIds: launchCreativeIds,
      selectedCreativeSnapshots: launchScopeCreatives,
      campaignMode:
        launchConfig.campaignMode || (defaultCampaignId ? 'existing' : 'new'),
      existingCampaignId: defaultCampaignId,
      newCampaignName:
        launchConfig.newCampaignName ||
        (defaultCampaignId ? undefined : buildSuggestedCampaignName(profile?.productName)),
      adsetMode: launchConfig.adsetMode || 'new_adsets',
      adsetDistribution:
        launchConfig.adsetDistribution ||
        (effectiveBatches.length > 0 ? 'distribute' : launchCreativeIds.length > 1 ? 'one_per_adset' : 'all_to_one'),
      structure: launchConfig.structure || profile?.defaultStructure || 'ABO',
      adAccountId: launchConfig.adAccountId || profile?.adAccountId,
      pageId: launchConfig.pageId || profile?.pageId,
      instagramActorId: launchConfig.instagramActorId || profile?.instagramActorId,
      pixelId: launchConfig.pixelId || profile?.pixelId,
      conversionEvent: launchConfig.conversionEvent || profile?.conversionEvent,
      destinationUrl: launchConfig.destinationUrl || profile?.destinationUrl,
      dailyBudget: launchConfig.dailyBudget ?? profile?.defaultBudget ?? 20,
      testDuration: launchConfig.testDuration ?? profile?.defaultDuration ?? 3,
      bidStrategy:
        launchConfig.bidStrategy || 'LOWEST_COST_WITHOUT_CAP',
      bidAmount: launchConfig.bidAmount ?? profile?.defaultBidAmount,
      roasFloor: launchConfig.roasFloor ?? profile?.defaultRoasFloor,
      launchStatus: launchConfig.launchStatus || 'ACTIVE',
      adLaunchStatus: launchConfig.adLaunchStatus || launchConfig.launchStatus || 'ACTIVE',
      launchTime: launchConfig.launchTime || 'immediately',
      scheduledDate:
        launchConfig.launchTime === 'scheduled' ? launchConfig.scheduledDate : undefined,
      scheduledTime: launchConfig.scheduledTime || '09:00',
      endDate: launchConfig.endDate,
      attributionWindow: launchConfig.attributionWindow || '7d_click_1d_engagement',
      utmTemplate: launchConfig.utmTemplate || profile?.utmTemplate,
      primaryTexts: launchConfig.primaryTexts || [],
      headlines: launchConfig.headlines || [],
      descriptions: launchConfig.descriptions || [],
      ctaType: launchConfig.ctaType || 'SHOP_NOW',
      advantageCreative: launchConfig.advantageCreative ?? false,
      batches: effectiveBatches.length > 0 ? effectiveBatches : undefined,
      batchStrategy:
        effectiveBatches.length > 0
          ? launchConfig.batchStrategy || effectiveStrategy
          : launchConfig.batchStrategy,
      creativesPerBatch: effectiveBatchSize,
      launchMode: 'quick',
      aiMinSpend: launchConfig.aiMinSpend ?? profile?.aiMinSpend,
      aiMinImpressions: launchConfig.aiMinImpressions ?? profile?.aiMinImpressions,
      aiMinHours: launchConfig.aiMinHours ?? profile?.aiMinHours,
      aiEvalFrequency: launchConfig.aiEvalFrequency || profile?.aiEvalFrequency,
    }),
    [
      defaultCampaignId,
      effectiveBatchSize,
      effectiveBatches,
      effectiveStrategy,
      launchConfig,
      launchCreativeIds,
      launchScopeCreatives,
      productId,
      profile,
    ],
  );

  const diagnostics = useMemo(
    () =>
      buildSelectionDiagnostics({
        selectedCreatives: launchScopeCreatives,
        batches: effectiveBatches,
        batchSize,
        budget: preparedLaunchConfig.dailyBudget ?? 20,
        structure: preparedLaunchConfig.structure ?? 'ABO',
      }),
    [
      batchSize,
      effectiveBatches,
      launchScopeCreatives,
      preparedLaunchConfig.dailyBudget,
      preparedLaunchConfig.structure,
    ],
  );
  const existingCampaignOptions = useMemo(
    () => buildExistingCampaignOptions(profile, launchScopeCreatives.length),
    [launchScopeCreatives.length, profile],
  );

  const launchHealthKey = useMemo(
    () => buildLaunchHealthKey(preparedLaunchConfig, launchCreativeIds),
    [launchCreativeIds, preparedLaunchConfig],
  );
  const hasFreshHealthReport =
    healthState.requestKey === launchHealthKey && Boolean(healthState.report);
  const reviewDisabled =
    launchCreativeIds.length === 0 ||
    inboxLoading ||
    healthState.loading ||
    !hasFreshHealthReport ||
    Boolean(healthState.report && healthState.report.failures > 0);
  const reviewHint =
    launchCreativeIds.length === 0
      ? 'Select at least one creative to build the launch plan.'
      : inboxLoading
        ? 'Creative assets are still loading from ClickUp and Google Drive.'
        : healthState.loading
          ? 'Running a fresh backend readiness check for the current schedule and lane setup.'
          : !hasFreshHealthReport
            ? 'Run one fresh health check after changing schedule, budget, or lane setup before opening review.'
            : healthState.report && healthState.report.failures > 0
              ? 'Fix the failing backend checks before opening the review and launch step.'
              : 'Review is synced to the latest schedule, budget, and lane plan.';

  const handleSelectVisible = useCallback(() => {
    for (const creative of visibleAssets) {
      if (!selectedIds.has(creative.id)) {
        toggleCreativeSelection(creative.id);
      }
    }
  }, [selectedIds, toggleCreativeSelection, visibleAssets]);

  const handleAddCustomColumn = useCallback((fieldName: string) => {
    if (!fieldName.trim()) return;
    const columnId = getCustomColumnId(fieldName);
    setSelectedCustomFieldColumns((current) =>
      current.includes(fieldName) ? current : [...current, fieldName],
    );
    setTableColumnOrder((current) => (current.includes(columnId) ? current : [...current, columnId]));
  }, []);

  const handleRemoveTableColumn = useCallback((columnId: string) => {
    if (columnId.startsWith('base:')) {
      const baseKey = columnId.replace('base:', '') as SelectionColumnKey;
      setVisibleColumns((current) => current.filter((item) => item !== baseKey));
    }
    if (columnId.startsWith('custom:')) {
      const fieldName = columnId.replace('custom:', '');
      setSelectedCustomFieldColumns((current) => current.filter((item) => item !== fieldName));
    }
    setTableColumnOrder((current) => current.filter((item) => item !== columnId));
    setTableColumnFilters((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
    setTableSort((current) => (current?.columnId === columnId ? null : current));
  }, []);

  const handleSetTableSort = useCallback((columnId: string, direction: TableSortDirection) => {
    setTableSort({ columnId, direction });
  }, []);
  const handleToggleTableFilterValue = useCallback((columnId: string, value: string) => {
    setTableColumnFilters((current) => {
      const currentValues = current[columnId] || [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];
      if (nextValues.length === 0) {
        const next = { ...current };
        delete next[columnId];
        return next;
      }
      return { ...current, [columnId]: nextValues };
    });
  }, []);
  const handleClearTableColumnFilter = useCallback((columnId: string) => {
    if (columnId === 'base:uploaded') {
      setUploadDatePreset('all');
      setCustomDateStart('');
      setCustomDateEnd('');
      return;
    }
    setTableColumnFilters((current) => {
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  }, []);

  const handleTableColumnDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setTableColumnOrder((current) => {
      const oldIndex = current.indexOf(String(active.id));
      const newIndex = current.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return current;
      return arrayMove(current, oldIndex, newIndex);
    });
  }, []);

  const handleSourceChipSelect = useCallback(
    (nextChip: SelectionSourceChip) => {
      setSourceChip(nextChip);
      setActiveFieldName(null);
      setActiveFacetId(null);
      setColumnFolderId(null);
      if (nextChip === 'tasks') {
        setBrowserMode('by_task');
        setColumnTaskId(taskGroups[0]?.id || null);
        return;
      }
      if (nextChip === 'folders') {
        setBrowserMode('by_folder');
        setColumnTaskId(null);
        return;
      }
      setBrowserMode('all_assets');
      setColumnTaskId(null);
    },
    [taskGroups],
  );

  const handleSelectCreatives = useCallback(
    (creatives: InboxCreative[]) => {
      for (const creative of creatives) {
        if (!selectedIds.has(creative.id)) {
          toggleCreativeSelection(creative.id);
        }
      }
    },
    [selectedIds, toggleCreativeSelection],
  );

  const handleToggleGroupSelection = useCallback(
    (creatives: InboxCreative[]) => {
      const allSelected = creatives.every((creative) => selectedIds.has(creative.id));
      for (const creative of creatives) {
        if (allSelected) {
          if (selectedIds.has(creative.id)) {
            toggleCreativeSelection(creative.id);
          }
        } else if (!selectedIds.has(creative.id)) {
          toggleCreativeSelection(creative.id);
        }
      }
    },
    [selectedIds, toggleCreativeSelection],
  );

  const handleToggleTableTask = useCallback((taskId: string) => {
    setExpandedTableTaskIds((current) =>
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId],
    );
  }, []);

  const handleToggleTableFolder = useCallback((folderId: string) => {
    setExpandedTableFolderIds((current) =>
      current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId],
    );
  }, []);

  const handleAiRecommendSelection = useCallback(() => {
    const recommended = buildAiRecommendedSelection(visibleAssets);
    handleSelectCreatives(recommended);
  }, [handleSelectCreatives, visibleAssets]);

  const handleApplyStrategy = useCallback(
    (strategy: BatchStrategy, size: number) => {
      const effectiveSize = strategy === 'one_per_adset' ? 1 : size;
      autoBatch(strategy, effectiveSize);
    },
    [autoBatch],
  );

  const handleApplyAiLaunchAction = useCallback(
    (actionId: string) => {
      const action = aiAnalysis.data?.launchDraft?.actionCards.find((item) => item.id === actionId);
      if (!action) return;
      handleApplyStrategy(action.strategy, action.recommendedSize);
      updateLaunchConfig({
        campaignMode: action.campaignMode,
        structure: action.structure,
        dailyBudget: action.budget,
        testDuration: action.durationDays,
        newCampaignName:
          action.campaignMode === 'new'
            ? preparedLaunchConfig.newCampaignName ||
              (profile?.productName ? buildSuggestedCampaignName(profile.productName) : undefined)
            : preparedLaunchConfig.newCampaignName,
        roasFloor: launchConfig.roasFloor ?? profile?.defaultRoasFloor ?? 1.2,
        primaryTexts: action.primaryTexts.length > 0
          ? createCopyItems(action.primaryTexts, 'ai_generated')
          : preparedLaunchConfig.primaryTexts,
        headlines: action.headlines.length > 0
          ? createCopyItems(action.headlines, 'ai_generated')
          : preparedLaunchConfig.headlines,
        descriptions: action.descriptions.length > 0
          ? createCopyItems(action.descriptions, 'ai_generated')
          : preparedLaunchConfig.descriptions,
        ctaType: winningAds?.autoFill?.cta || preparedLaunchConfig.ctaType || 'SHOP_NOW',
        aiAutopilotEnabled: true,
        aiAutopilotRequiresConfirmation: true,
      });
      setActiveStep('schedule');
      setWorkbenchTab('schedule');
    },
    [
      aiAnalysis.data?.launchDraft?.actionCards,
      handleApplyStrategy,
      launchConfig.roasFloor,
      preparedLaunchConfig.ctaType,
      preparedLaunchConfig.descriptions,
      preparedLaunchConfig.headlines,
      preparedLaunchConfig.newCampaignName,
      preparedLaunchConfig.primaryTexts,
      profile?.defaultRoasFloor,
      profile?.productName,
      updateLaunchConfig,
      setWorkbenchTab,
      winningAds?.autoFill?.cta,
    ],
  );

  const runLaunchHealthCheck = useCallback(async () => {
    if (!resolvedStoreId || !preparedLaunchConfig.productProfileId || launchScopeCreatives.length === 0) {
      setHealthState({ loading: false, report: null, error: null, requestKey: undefined });
      return;
    }

    setHealthState((current) => ({ ...current, loading: true, error: null }));

    try {
      const res = await fetch('/api/creative-hub/launch/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: resolvedStoreId,
          launchConfig: preparedLaunchConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Health check failed');
      }

      setHealthState({
        loading: false,
        report: data as PreLaunchReport,
        error: null,
        requestKey: launchHealthKey,
      });
    } catch (error) {
      setHealthState({
        loading: false,
        report: null,
        error: error instanceof Error ? error.message : 'Health check failed',
        requestKey: undefined,
      });
    }
  }, [launchHealthKey, launchScopeCreatives.length, preparedLaunchConfig, resolvedStoreId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!resolvedStoreId || launchScopeCreatives.length === 0) {
      setHealthState({ loading: false, report: null, error: null, requestKey: undefined });
      return;
    }

    const timer = window.setTimeout(() => {
      void runLaunchHealthCheck();
    }, 450);

    return () => window.clearTimeout(timer);
  }, [
    isOpen,
    launchScopeCreatives.length,
    preparedLaunchConfig.dailyBudget,
    preparedLaunchConfig.structure,
    preparedLaunchConfig.launchStatus,
    preparedLaunchConfig.launchTime,
    preparedLaunchConfig.scheduledDate,
    preparedLaunchConfig.scheduledTime,
    preparedLaunchConfig.endDate,
    preparedLaunchConfig.campaignMode,
    preparedLaunchConfig.existingCampaignId,
    preparedLaunchConfig.newCampaignName,
    resolvedStoreId,
    runLaunchHealthCheck,
  ]);

  useEffect(() => {
    if (!isOpen || !resolvedStoreId || !productId || launchCreativeIds.length === 0) return;
    if (aiAnalysis.loading || aiAnalysis.error) return;
    if ((aiAnalysis.data?.meta?.selectionKey || 'none') === launchSelectionKey) return;

    const timer = window.setTimeout(() => {
      void fetchAiAnalysis(resolvedStoreId, productId);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    aiAnalysis.data?.meta?.selectionKey,
    aiAnalysis.error,
    aiAnalysis.loading,
    fetchAiAnalysis,
    isOpen,
    launchCreativeIds.length,
    launchSelectionKey,
    productId,
    resolvedStoreId,
  ]);

  useEffect(() => {
    setAiTagMap({});
    setAiTaggingState({ loading: false, error: null, lastTaggedAt: undefined });
  }, [productId]);

  const handleLaunch = useCallback(() => {
    if (!productId) return;
    const creativeIds = launchCreativeIds;

    if (
      creativeIds.length === 0 ||
      healthState.loading ||
      healthState.requestKey !== launchHealthKey ||
      !healthState.report ||
      healthState.report.failures > 0
    ) {
      return;
    }
    updateLaunchConfig({
      ...preparedLaunchConfig,
      healthCheckReport: healthState.report,
    });
    openLaunchWizardForProduct(productId, creativeIds);
    setLaunchStep(4);
  }, [
    healthState.loading,
    healthState.report,
    healthState.requestKey,
    launchHealthKey,
    launchCreativeIds,
    openLaunchWizardForProduct,
    preparedLaunchConfig,
    productId,
    setLaunchStep,
    updateLaunchConfig,
  ]);

  const setStudioStep = useCallback((step: LaunchStudioStep) => {
    setActiveStep(step);
    if (step === 'select') {
      setWorkbenchTab('inspect');
      return;
    }
    setWorkbenchTab('schedule');
  }, []);
  const handleResetSelectionControls = useCallback(() => {
    setSourceChip('all');
    setActiveFieldName(null);
    setActiveFacetId(null);
    setBrowserMode('all_assets');
    setActiveGroupId(null);
    setColumnTaskId(null);
    setColumnFolderId(null);
    setFocusedId(null);
    setPreviewCreative(null);
    setSearch('');
    setSmartFiltersOpen(false);
    setDetailsDrawerOpen(false);
    setFormatFilter('all');
    setTestedFilter('all');
    setSortMode('recommended');
    setSelectionViewMode('table');
    setSelectionTableMode('default');
    setTableLayoutMode('grouped');
    setUploadDatePreset('all');
    setCustomDateStart('');
    setCustomDateEnd('');
    setShowSelectedOnly(false);
    setExpandedTableTaskIds([]);
    setExpandedTableFolderIds([]);
    setVisibleColumns(DEFAULT_SELECTION_COLUMNS);
    setSelectedCustomFieldColumns([]);
    setTableColumnOrder(DEFAULT_SELECTION_COLUMNS.map((column) => `base:${column}`));
    setTableColumnFilters({});
    setTableSort(null);
    setOpenTableColumnMenuId(null);
    deselectAllCreatives();
  }, [deselectAllCreatives]);
  const currentSelectionLabel =
    browserMode === 'all_assets'
      ? 'All assets'
      : `${browserMode === 'by_folder' ? 'Folder' : 'Task'}: ${currentGroup?.label || 'None selected'}`;
  const normalizedSelectionViewMode = normalizeSelectionViewMode(selectionViewMode);
  const explorerVisibleAssets =
    normalizedSelectionViewMode === 'list'
        ? columnVisibleAssets
        : visibleAssets;
  const explorerGroupLabel =
    normalizedSelectionViewMode === 'list'
      ? columnFolderGroup?.label || columnTaskGroup?.label || 'Column Browser'
      : currentSelectionLabel;
  const selectedPreviewCreatives = launchScopeCreatives.slice(0, 6);
  const showSelectionStage = activeStep === 'select';
  const studioStickyOffsetClass = 'lg:top-[92px] lg:max-h-[calc(100vh-92px)]';
  const listColumnOptions: Array<{ id: SelectionColumnKey; label: string }> = [
    { id: 'asset', label: 'Asset' },
    { id: 'media', label: 'Media' },
    { id: 'task', label: 'Task' },
    { id: 'folder', label: 'Folder' },
    { id: 'uploaded', label: 'Upload date' },
    { id: 'creator', label: 'Created by' },
    { id: 'status', label: 'Status' },
    { id: 'fields', label: 'Custom fields' },
  ];
  const customFieldFacets = useMemo(
    () => buildCustomFieldFacets(productCreatives),
    [productCreatives],
  );
  const customFieldFacetGroups = useMemo(
    () => buildCustomFieldFacetGroups(customFieldFacets),
    [customFieldFacets],
  );
  const visibleColumnSet = useMemo(() => new Set(visibleColumns), [visibleColumns]);
  const showAiColumns = selectionTableMode !== 'default';
  const showAiOnlyColumns = selectionTableMode === 'ai';
  const availableCustomFieldNames = useMemo(
    () => customFieldFacetGroups.map((group) => group.fieldName),
    [customFieldFacetGroups],
  );
  const tableColumnSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const activeTableColumns = useMemo<DynamicTableColumn[]>(() => {
    const baseColumns: DynamicTableColumn[] = visibleColumns.map((column) => ({
      id: `base:${column}`,
      label: BASE_COLUMN_LABELS[column],
      kind: 'base',
      baseKey: column,
    }));
    const customColumns: DynamicTableColumn[] = selectedCustomFieldColumns
      .filter((fieldName) => availableCustomFieldNames.includes(fieldName))
      .map((fieldName) => ({
        id: getCustomColumnId(fieldName),
        label: fieldName,
        kind: 'custom',
        fieldName,
      }));
    const aiColumns: DynamicTableColumn[] = showAiColumns
      ? TABLE_AI_COLUMNS.map((column) => ({
          id: getAiColumnId(column.id),
          label: column.label,
          kind: 'ai',
          aiKey: column.id,
        }))
      : [];

    const allColumns = [...baseColumns, ...customColumns, ...aiColumns];
    const columnMap = new Map(allColumns.map((column) => [column.id, column]));
    const ordered = tableColumnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is DynamicTableColumn => Boolean(column));
    const remaining = allColumns.filter((column) => !ordered.some((item) => item.id === column.id));
    return [...ordered, ...remaining];
  }, [
    availableCustomFieldNames,
    selectedCustomFieldColumns,
    showAiColumns,
    tableColumnOrder,
    visibleColumns,
  ]);
  const getTableColumnText = useCallback(
    (creative: InboxCreative, column: DynamicTableColumn): string => {
      if (column.kind === 'base') {
        switch (column.baseKey) {
          case 'asset':
            return [creative.creativeName, creative.clickupTaskName].filter(Boolean).join(' ');
          case 'media':
            return creative.creativeFormat ? creative.creativeFormat.toUpperCase() : '';
          case 'task':
            return creative.clickupTaskName || '';
          case 'folder':
            return creative.driveParentFolderName || '';
          case 'uploaded':
            return formatAssetDate(getAssetUploadedAt(creative)) || '';
          case 'creator':
            return creative.creator || creative.clickupAssignees?.[0]?.username || '';
          case 'status':
            return creative.clickupTaskStatus || creative.pastTestResult?.status || (creative.alreadyTested ? 'tested' : 'untested');
          case 'fields':
            return (creative.clickupCustomFields || [])
              .filter((field) => field.hasValue !== false)
              .map((field) => `${field.name} ${formatClickUpFieldValue(field)}`)
              .join(' ');
          default:
            return '';
        }
      }

      if (column.kind === 'custom') {
        const field = (creative.clickupCustomFields || []).find((item) => item.name === column.fieldName);
        return field ? formatClickUpFieldValue(field) : '';
      }

      const tags = deriveStrategistTags(creative);
      switch (column.aiKey) {
        case 'awarenessStage':
          return tags.awarenessStage;
        case 'targetAge':
          return tags.targetAge;
        case 'persona':
          return tags.persona;
        case 'gender':
          return tags.gender;
        case 'angle':
          return tags.angle;
        default:
          return '';
      }
    },
    [],
  );
  const getTableStatusMeta = useCallback((creative: InboxCreative) => {
    const rawStatus =
      creative.clickupTaskStatus ||
      creative.pastTestResult?.status ||
      (creative.alreadyTested ? 'tested' : 'untested');
    const normalized = rawStatus.trim().toLowerCase();

    if (normalized.includes('ready')) {
      return {
        label: 'READY TO LAUNCH',
        className:
          'bg-[linear-gradient(180deg,rgba(14,165,233,0.98)_0%,rgba(2,132,199,1)_100%)] text-white ring-1 ring-sky-300/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_22px_rgba(14,165,233,0.18)]',
      };
    }
    if (normalized.includes('winner')) {
      return {
        label: 'WINNER',
        className:
          'bg-[linear-gradient(180deg,rgba(16,185,129,0.98)_0%,rgba(5,150,105,1)_100%)] text-white ring-1 ring-emerald-300/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_10px_22px_rgba(16,185,129,0.16)]',
      };
    }
    if (normalized.includes('testing')) {
      return {
        label: 'TESTING',
        className:
          'bg-[linear-gradient(180deg,rgba(254,240,138,0.98)_0%,rgba(253,224,71,0.98)_100%)] text-amber-950 ring-1 ring-amber-300/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)]',
      };
    }

    return {
      label: normalized === 'untested' ? 'UNTESTED' : rawStatus.replace(/(^|\s)\S/g, (char) => char.toUpperCase()),
      className:
        studioTheme === 'dark'
          ? 'bg-[linear-gradient(180deg,rgba(18,28,46,0.96)_0%,rgba(11,20,36,0.98)_100%)] text-slate-200 ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
          : 'bg-[linear-gradient(180deg,rgba(248,250,252,1)_0%,rgba(241,245,249,0.96)_100%)] text-slate-700 ring-1 ring-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.92)]',
    };
  }, [studioTheme]);
  const getTableGroupSummaryText = useCallback(
    (assets: InboxCreative[], column: DynamicTableColumn, kind: 'task' | 'folder', label: string): string => {
      if (assets.length === 0) return '';

      if (column.kind === 'base') {
        switch (column.baseKey) {
          case 'asset':
            return `${label} · ${assets.length} creative${assets.length === 1 ? '' : 's'}`;
          case 'media': {
            const formats = [...new Set(assets.map((creative) => creative.creativeFormat?.toUpperCase()).filter(Boolean))];
            if (formats.length === 0) return '-';
            return formats.length <= 2 ? formats.join(' • ') : `${formats[0]} +${formats.length - 1}`;
          }
          case 'task':
            return kind === 'task'
              ? label
              : [...new Set(assets.map((creative) => creative.clickupTaskName).filter(Boolean))].slice(0, 2).join(', ') || '-';
          case 'folder': {
            if (kind === 'folder') return label;
            const folderCount = new Set(assets.map((creative) => creative.driveFolderId || creative.driveParentFolderName).filter(Boolean)).size;
            return folderCount > 0 ? `${folderCount} folder${folderCount === 1 ? '' : 's'}` : 'Direct assets';
          }
          case 'uploaded': {
            const timestamps = assets
              .map((creative) => getAssetUploadedAt(creative))
              .filter((value): value is string => Boolean(value))
              .map((value) => new Date(value).getTime())
              .filter((value) => !Number.isNaN(value));
            if (timestamps.length === 0) return '-';
            return formatAssetDate(new Date(Math.max(...timestamps)).toISOString()) || '-';
          }
          case 'creator': {
            const creators = [
              ...new Set(
                assets
                  .map((creative) => creative.creator || creative.clickupAssignees?.[0]?.username)
                  .filter((value): value is string => Boolean(value)),
              ),
            ];
            if (creators.length === 0) return '-';
            return creators.length === 1 ? creators[0] : `${creators[0]} +${creators.length - 1}`;
          }
          case 'status': {
            const statuses = [...new Set(assets.map((creative) => getTableColumnText(creative, column)).filter(Boolean))];
            if (statuses.length === 0) return '-';
            return statuses.length <= 2 ? statuses.join(' • ') : `${statuses[0]} +${statuses.length - 1}`;
          }
          case 'fields': {
            const filledFields = new Set(
              assets.flatMap((creative) =>
                (creative.clickupCustomFields || [])
                  .filter((field) => field.hasValue !== false && formatClickUpFieldValue(field).trim())
                  .map((field) => field.name),
              ),
            );
            return filledFields.size > 0 ? `${filledFields.size} field${filledFields.size === 1 ? '' : 's'}` : 'No fields';
          }
          default:
            return '';
        }
      }

      const values = [...new Set(assets.map((creative) => getTableColumnText(creative, column).trim()).filter(Boolean))];
      if (values.length === 0) return '-';
      return values.length <= 2 ? values.join(' • ') : `${values[0]} +${values.length - 1}`;
    },
    [getTableColumnText],
  );
  const tableVisibleAssets = useMemo(() => {
    const filtered = visibleAssets.filter((creative) =>
      activeTableColumns.every((column) => {
        if (column.kind === 'base' && column.baseKey === 'uploaded') {
          return matchesUploadDatePreset(
            getAssetUploadedAt(creative),
            uploadDatePreset,
            customDateStart,
            customDateEnd,
          );
        }

        const selectedValues = tableColumnFilters[column.id] || [];
        if (selectedValues.length === 0) return true;
        const currentValue = getTableColumnText(creative, column).trim();
        return selectedValues.includes(currentValue);
      }),
    );

    if (!tableSort) return filtered;

    const sortColumn = activeTableColumns.find((column) => column.id === tableSort.columnId);
    if (!sortColumn) return filtered;

    const sorted = [...filtered].sort((a, b) => {
      const aValue = getTableColumnText(a, sortColumn).trim();
      const bValue = getTableColumnText(b, sortColumn).trim();
      const aDate = Date.parse(aValue);
      const bDate = Date.parse(bValue);

      if (!Number.isNaN(aDate) && !Number.isNaN(bDate)) {
        return aDate - bDate;
      }

      const aNumber = Number(aValue);
      const bNumber = Number(bValue);
      if (!Number.isNaN(aNumber) && !Number.isNaN(bNumber) && aValue !== '' && bValue !== '') {
        return aNumber - bNumber;
      }

      return aValue.localeCompare(bValue, undefined, { numeric: true, sensitivity: 'base' });
    });

    return tableSort.direction === 'asc' ? sorted : sorted.reverse();
  }, [
    activeTableColumns,
    customDateEnd,
    customDateStart,
    getTableColumnText,
    tableColumnFilters,
    tableSort,
    uploadDatePreset,
    visibleAssets,
  ]);
  const summarizeColumnValues = useCallback(
    (assets: InboxCreative[], column: DynamicTableColumn): string[] => {
      if (column.kind === 'base') {
        switch (column.baseKey) {
          case 'asset':
            return [`${assets.length} creative${assets.length === 1 ? '' : 's'}`];
          case 'media':
            return [
              ...new Set(
                assets
                  .map((creative) => creative.creativeFormat?.toUpperCase())
                  .filter((value): value is string => Boolean(value)),
              ),
            ].slice(0, 2);
          case 'task':
            return [
              ...new Set(
                assets
                  .map((creative) => creative.clickupTaskName)
                  .filter((value): value is string => Boolean(value)),
              ),
            ].slice(0, 2);
          case 'folder':
            return [
              ...new Set(
                assets
                  .map((creative) => creative.driveParentFolderName)
                  .filter((value): value is string => Boolean(value)),
              ),
            ].slice(0, 2);
          case 'uploaded': {
            const latest = [...assets]
              .map((creative) => getAssetUploadedAt(creative))
              .filter(Boolean)
              .sort((a, b) => new Date(b || 0).getTime() - new Date(a || 0).getTime())[0];
            return latest ? [`Latest ${formatAssetDate(latest) || latest}`] : [];
          }
          case 'creator':
            return [
              ...new Set(
                assets
                  .map((creative) => creative.creator || creative.clickupAssignees?.[0]?.username)
                  .filter((value): value is string => Boolean(value)),
              ),
            ].slice(0, 2);
          case 'status':
            return [...new Set(assets.map((creative) => creative.clickupTaskStatus || creative.pastTestResult?.status || (creative.alreadyTested ? 'tested' : 'untested')).filter(Boolean))].slice(0, 2);
          case 'fields': {
            const values = assets.flatMap((creative) =>
              (creative.clickupCustomFields || [])
                .filter((field) => field.hasValue !== false)
                .slice(0, 3)
                .map((field) => `${field.name}: ${truncate(formatClickUpFieldValue(field), 16)}`),
            );
            return [...new Set(values)].slice(0, 2);
          }
          default:
            return [];
        }
      }

      return [
        ...new Set(
          assets
            .map((creative) => getTableColumnText(creative, column).trim())
            .filter(Boolean),
        ),
      ].slice(0, 2);
    },
    [getTableColumnText],
  );
  const tableHierarchicalGroups = useMemo<HierarchicalTableTaskGroup[]>(
    () =>
      buildSourceGroups(tableVisibleAssets, selectedIds, 'task', { preserveInputOrder: true }).map((taskGroup) => ({
        ...taskGroup,
        folders: buildSourceGroups(taskGroup.assets, selectedIds, 'folder', { preserveInputOrder: true }),
      })),
    [selectedIds, tableVisibleAssets],
  );
  const flatTableCreatives = useMemo(
    () => [...new Map(tableVisibleAssets.map((creative) => [creative.id, creative])).values()],
    [tableVisibleAssets],
  );
  const tableColumnCount = 1 + activeTableColumns.length;
  const tableColumnFilterOptions = useMemo<Record<string, Array<{ value: string; count: number }>>>(() => {
    return Object.fromEntries(
      activeTableColumns.map((column) => {
        if (column.kind === 'base' && column.baseKey === 'uploaded') {
          return [column.id, []];
        }

        const counts = new Map<string, number>();
        for (const creative of visibleAssets) {
          const value = getTableColumnText(creative, column).trim();
          if (!value) continue;
          counts.set(value, (counts.get(value) || 0) + 1);
        }

        return [
          column.id,
          [...counts.entries()]
            .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: 'base' }))
            .slice(0, 120)
            .map(([value, count]) => ({ value, count })),
        ];
      }),
    );
  }, [activeTableColumns, getTableColumnText, visibleAssets]);
  const activeFieldValues = useMemo(
    () =>
      activeFieldName
        ? customFieldFacetGroups.find((group) => group.fieldName === activeFieldName)?.values || []
        : [],
    [activeFieldName, customFieldFacetGroups],
  );
  const freshVisibleAssets = useMemo(
    () =>
      [...visibleAssets]
        .sort((a, b) => {
          const aTime = new Date(getAssetUploadedAt(a) || 0).getTime();
          const bTime = new Date(getAssetUploadedAt(b) || 0).getTime();
          return bTime - aTime;
        })
        .slice(0, 12),
    [visibleAssets],
  );
  const focusQueueCreatives = useMemo(() => {
    if (!focusedCreative) {
      return visibleAssets.slice(0, 10);
    }
    return [
      focusedCreative,
      ...visibleAssets.filter((creative) => creative.id !== focusedCreative.id),
    ].slice(0, 10);
  }, [focusedCreative, visibleAssets]);
  const discoveryChips: Array<{
    id: SelectionSourceChip;
    label: string;
    value: string | number;
  }> = [
    { id: 'all', label: 'All', value: productCreatives.length },
    { id: 'tasks', label: 'Tasks', value: taskGroups.length },
    { id: 'folders', label: 'Folders', value: folderGroups.length },
    { id: 'untested', label: 'Untested', value: untestedAssets },
    {
      id: 'testing',
      label: 'Testing',
      value: productCreatives.filter(
        (creative) =>
          creative.alreadyTested && creative.pastTestResult?.status !== 'winner',
      ).length,
    },
    { id: 'winners', label: 'Winners', value: totalWinners },
    { id: 'fresh', label: 'Fresh', value: freshVisibleAssets.length },
    { id: 'images', label: 'Images', value: totalImages },
    { id: 'videos', label: 'Videos', value: totalVideos },
  ];
  const workbenchTabs: Array<{
    id: WorkbenchTab;
    label: string;
    icon: typeof Eye;
    helper: string;
  }> = [
    { id: 'inspect', label: 'Preview', icon: Eye, helper: 'Preview the focused asset with media controls' },
    { id: 'task', label: 'ClickUp', icon: FolderTree, helper: 'Read task context, description, and custom fields' },
    { id: 'schedule', label: 'Details', icon: BarChart3, helper: 'Inspect source, upload, and testing metadata' },
    { id: 'ai', label: 'AI Context', icon: Sparkles, helper: 'See what Claude will use to recommend the plan' },
  ];
  const focusedCreativeDescription =
    focusedCreative?.clickupDescription ||
    focusedCreative?.hook ||
    focusedCreative?.angle ||
    focusedCreative?.driveParentFolderName ||
    focusedCreative?.clickupListName ||
    '';
  const focusedCreativeUploadedLabel = formatAssetDate(
    focusedCreative ? getAssetUploadedAt(focusedCreative) : undefined,
  );
  const focusedCreativeUpdatedLabel = formatAssetDate(
    focusedCreative ? getAssetUpdatedAt(focusedCreative) : undefined,
  );
  const focusedCreativeFieldPreview = focusedCreative?.clickupCustomFields?.slice(0, 4) || [];
  const handleRefreshClickup = useCallback(() => {
    if (!resolvedStoreId) return;
    void syncInbox(resolvedStoreId);
  }, [resolvedStoreId, syncInbox]);
  const renderCreativeTableRow = useCallback(
    (creative: InboxCreative, rowKeyPrefix: string, indentLevel = 0) => {
      const creatorLabel = creative.creator || creative.clickupAssignees?.[0]?.username || 'Unknown';
      const folderLabel = creative.driveParentFolderName || 'Direct asset';
      const uploadLabel = formatAssetDate(getAssetUploadedAt(creative)) || 'Unknown';
      const fieldPreview = creative.clickupCustomFields?.slice(0, 2) || [];
      const previewUrl = getThumbnailUrl(creative);

      return (
        <tr
          key={`${rowKeyPrefix}-${creative.id}`}
          onClick={() => {
            setFocusedId(creative.id);
            setDetailsDrawerOpen(true);
          }}
          className={cn(
            'cursor-pointer align-top transition-colors hover:bg-slate-50',
            focusedCreative?.id === creative.id ? 'bg-sky-50/70' : 'bg-white',
          )}
        >
          <td className="px-3 py-3">
            <button
              onClick={(event) => {
                event.stopPropagation();
                toggleCreativeSelection(creative.id);
              }}
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-all',
                selectedIds.has(creative.id)
                  ? 'border-sky-500 bg-sky-500 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
              )}
              style={indentLevel > 0 ? { marginLeft: `${Math.min(indentLevel * 16, 40)}px` } : undefined}
            >
              {selectedIds.has(creative.id) ? <Check className="h-4 w-4" /> : ''}
            </button>
          </td>
          {activeTableColumns.map((column) => {
            if (column.kind === 'base' && column.baseKey === 'asset') {
              return (
                <td key={column.id} className="px-3 py-3">
                  <div className="flex min-w-[260px] items-center gap-3">
                    <div className="relative h-11 w-11 overflow-hidden rounded-xl bg-slate-100">
                      {previewUrl ? (
                        <>
                          <img
                            src={previewUrl}
                            alt={creative.creativeName}
                            className="h-full w-full object-cover"
                          />
                          {isVideoCreative(creative) ? (
                            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-slate-950/55 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                              Preview
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          {isVideoCreative(creative) ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{creative.creativeName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {[creative.clickupTaskName, folderLabel, creatorLabel, uploadLabel].filter(Boolean).join(' • ')}
                      </p>
                    </div>
                  </div>
                </td>
              );
            }

            if (column.kind === 'base' && column.baseKey === 'status') {
              return (
                <td key={column.id} className="px-3 py-3">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {creative.clickupTaskStatus || creative.pastTestResult?.status || (creative.alreadyTested ? 'Tested' : 'Untested')}
                  </span>
                </td>
              );
            }

            if (column.kind === 'base' && column.baseKey === 'fields') {
              return (
                <td key={column.id} className="px-3 py-3">
                  <div className="flex min-w-[210px] flex-wrap gap-1.5">
                    {fieldPreview.length > 0 ? (
                      fieldPreview.map((field) => (
                        <span
                          key={field.id}
                          className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                        >
                          {field.name}: {truncate(formatClickUpFieldValue(field), 18)}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400">No fields</span>
                    )}
                  </div>
                </td>
              );
            }

            return (
              <td key={column.id} className="px-3 py-3 text-slate-700">
                {getTableColumnText(creative, column) || <span className="text-slate-400">-</span>}
              </td>
            );
          })}
        </tr>
      );
    },
    [activeTableColumns, focusedCreative?.id, getTableColumnText, selectedIds, toggleCreativeSelection],
  );

  useEffect(() => {
    if (!openTableColumnMenuId) return;
    if (!activeTableColumns.some((column) => column.id === openTableColumnMenuId)) {
      setOpenTableColumnMenuId(null);
      setTableColumnMenuPosition(null);
      tableColumnMenuAnchorRef.current = null;
    }
  }, [activeTableColumns, openTableColumnMenuId]);

  useEffect(() => {
    if (!openTableColumnMenuId) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (tableColumnMenuRef.current?.contains(event.target as Node)) return;
      if (tableColumnMenuAnchorRef.current?.contains(event.target as Node)) return;
      setOpenTableColumnMenuId(null);
      setTableColumnMenuPosition(null);
      tableColumnMenuAnchorRef.current = null;
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [openTableColumnMenuId]);

  useEffect(() => {
    if (!openTableColumnMenuId) return;

    const handleViewportChange = () => {
      setOpenTableColumnMenuId(null);
      setTableColumnMenuPosition(null);
      tableColumnMenuAnchorRef.current = null;
    };

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [openTableColumnMenuId]);

  if (!isOpen) return null;

  const renderTableColumnMenu = (
    column: DynamicTableColumn,
    isUploadedColumn: boolean,
    selectedValues: string[],
    columnOptions: Array<{ value: string; count: number }>,
  ) => {
    if (!tableColumnMenuPosition || typeof document === 'undefined') return null;

    return createPortal(
      <div
        ref={tableColumnMenuRef}
        className="fixed z-[80] w-[280px] overflow-hidden rounded-[20px] border border-slate-200 bg-white/98 shadow-[0_22px_48px_rgba(15,23,42,0.14)] backdrop-blur"
        style={{
          top: tableColumnMenuPosition.top,
          left: tableColumnMenuPosition.left,
          maxHeight: `min(560px, calc(100vh - ${tableColumnMenuPosition.top + 24}px))`,
        }}
      >
        <div className="border-b border-slate-200/80 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {column.label}
          </p>
        </div>

        <div className="border-b border-slate-200/80 px-3 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Sort
          </p>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                handleSetTableSort(column.id, 'asc');
                setOpenTableColumnMenuId(null);
                setTableColumnMenuPosition(null);
                tableColumnMenuAnchorRef.current = null;
              }}
              className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span>Sort ascending</span>
              <ArrowUp className="h-4 w-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                handleSetTableSort(column.id, 'desc');
                setOpenTableColumnMenuId(null);
                setTableColumnMenuPosition(null);
                tableColumnMenuAnchorRef.current = null;
              }}
              className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span>Sort descending</span>
              <ArrowDown className="h-4 w-4 text-slate-400" />
            </button>
            <button
              type="button"
              onClick={() => {
                setTableSort(null);
                setOpenTableColumnMenuId(null);
                setTableColumnMenuPosition(null);
                tableColumnMenuAnchorRef.current = null;
              }}
              className="flex w-full items-center justify-between rounded-[12px] px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <span>Clear sort</span>
              <X className="h-4 w-4 text-slate-300" />
            </button>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Filter
            </p>
            <button
              type="button"
              onClick={() => handleClearTableColumnFilter(column.id)}
              className="text-[11px] font-semibold text-slate-500 transition hover:text-slate-700"
            >
              Clear
            </button>
          </div>

          {isUploadedColumn ? (
            <div className="space-y-2 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['all', 'Any date'],
                  ['today', 'Today'],
                  ['this_week', 'This week'],
                  ['last_7', 'Last 7 days'],
                  ['last_30', 'Last 30 days'],
                  ['custom', 'Custom range'],
                ] as Array<[UploadDatePreset, string]>).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setUploadDatePreset(preset)}
                    className={cn(
                      'rounded-[12px] px-3 py-2 text-left text-sm font-medium transition',
                      uploadDatePreset === preset
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {uploadDatePreset === 'custom' ? (
                <div className="grid gap-2">
                  <input
                    type="date"
                    value={customDateStart}
                    onChange={(event) => setCustomDateStart(event.target.value)}
                    className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                  />
                  <input
                    type="date"
                    value={customDateEnd}
                    onChange={(event) => setCustomDateEnd(event.target.value)}
                    className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                  />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="max-h-[260px] space-y-1 overflow-y-auto pr-1">
              {columnOptions.length > 0 ? (
                columnOptions.map((option) => {
                  const checked = selectedValues.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleTableFilterValue(column.id, option.value)}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                        <span className="truncate font-medium">{option.value}</span>
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">{option.count}</span>
                    </label>
                  );
                })
              ) : (
                <p className="px-2.5 py-2 text-sm text-slate-400">No values available</p>
              )}
            </div>
          )}
        </div>
      </div>,
      document.body,
    );
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="launch-studio"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className={cn(
          'fixed inset-0 z-[80] overflow-hidden text-slate-900',
          studioTheme === 'dark'
            ? 'launch-studio-theme-dark bg-[radial-gradient(circle_at_top_left,#14365d_0%,#091324_38%,#040915_100%)] text-slate-100'
            : 'bg-[radial-gradient(circle_at_top,#fff8ef_0%,#f8fbff_28%,#eef4fb_100%)] text-slate-900',
        )}
      >
        <motion.div
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="h-full min-h-screen overflow-y-auto"
        >
          <LaunchStudioStickyHeader
            headerVariant={headerVariant}
            setHeaderVariant={setHeaderVariant}
            theme={studioTheme}
            setTheme={setStudioTheme}
            productName={profile?.productName}
            storeLabel={resolvedStoreId || profile?.clickupListName || 'Store context'}
            launchSetCount={launchScopeCreatives.length}
            activeStep={activeStep}
            selectedCount={selectedCreatives.length}
            batchCount={effectiveBatches.length}
            scheduleLabel={
              preparedLaunchConfig.campaignMode === 'new'
                ? 'New draft'
                : 'Draft setup'
            }
            onStepChange={setStudioStep}
            onClose={close}
          />

          <div
            className={cn(
              'grid items-start',
              showSelectionStage
                ? 'grid-cols-[minmax(0,1fr)]'
                : 'lg:grid-cols-[280px_minmax(0,1fr)]',
            )}
          >
            {showSelectionStage ? null : (
              <div
                className={cn(
                  'space-y-4 p-4 lg:sticky lg:overflow-y-auto',
                  studioTheme === 'dark'
                    ? 'border-r border-white/10 bg-[linear-gradient(180deg,rgba(6,11,22,0.92)_0%,rgba(7,13,25,0.98)_100%)]'
                    : 'border-r border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fa_100%)]',
                  studioStickyOffsetClass,
                )}
              >
                <StepSummaryCard
                  eyebrow="Step 1"
                  title={`${selectedCreatives.length} selected`}
                  description={`${currentSelectionLabel}. ${selectedCreatives.length > 0 ? 'Selection saved.' : 'Choose creatives first.'}`}
                  actionLabel="Edit selection"
                  onAction={() => setStudioStep('select')}
                >
                  <div className="flex flex-wrap gap-2">
                    {selectedPreviewCreatives.length > 0 ? (
                      selectedPreviewCreatives.map((creative) => (
                        <span
                          key={creative.id}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                        >
                          {truncate(creative.creativeName, 20)}
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                        No creatives selected yet
                      </span>
                    )}
                  </div>
                </StepSummaryCard>

                <StepSummaryCard
                  eyebrow="Step 2"
                  title={`${diagnostics.laneCount} planned lane${diagnostics.laneCount === 1 ? '' : 's'}`}
                  description={`${getStrategyLabel(diagnostics.recommendedStrategy)} selected.`}
                  actionLabel="Open batching"
                  onAction={() => setStudioStep('batch')}
                />

                <StepSummaryCard
                  eyebrow="Step 3"
                  title="Launch draft ready"
                  description={`${preparedLaunchConfig.campaignMode === 'new' ? 'New campaign draft' : 'Existing campaign draft'} • ${formatScheduleLabel(preparedLaunchConfig)}`}
                  actionLabel="Open launch setup"
                  onAction={() => setStudioStep('schedule')}
                />
              </div>
            )}

            <div className="min-w-0">
              {showSelectionStage ? (
                <>
                  <div className="space-y-4 px-4 pt-6 pb-10">
                    <section
                      className={cn(
                        'overflow-hidden rounded-[28px] backdrop-blur',
                        studioTheme === 'dark'
                          ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(7,14,26,0.72)_0%,rgba(5,10,20,0.9)_100%)] shadow-[0_28px_72px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.04)]'
                          : 'border border-white/80 bg-[rgba(255,255,255,0.9)] shadow-[0_18px_48px_rgba(148,163,184,0.16)]',
                      )}
                    >
                      <div className={cn('space-y-3 px-4 py-4', studioTheme === 'dark' ? 'border-b border-slate-800/80' : 'border-b border-slate-200')}>
                        <div className={cn('rounded-[18px] px-3 py-2.5 shadow-[0_10px_24px_rgba(15,23,42,0.05)]', studioTheme === 'dark' ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(8,16,30,0.92)_0%,rgba(9,19,35,0.98)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'border border-slate-200 bg-white')}>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative min-w-[240px] flex-[1.1_1_320px]">
                              <Search className={cn('pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')} />
                              <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search creatives, tasks, tags, hooks, angles..."
                                className={cn(
                                  'w-full rounded-[12px] px-9 py-2 text-sm outline-none transition focus:border-sky-300 focus:ring-2',
                                  studioTheme === 'dark'
                                    ? 'border border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:ring-sky-500/20'
                                    : 'border border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:ring-sky-100',
                                )}
                              />
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              <div className={cn('flex items-center gap-1.5 rounded-[12px] px-2 py-1', studioTheme === 'dark' ? 'border border-white/10 bg-white/[0.03]' : 'border border-slate-200 bg-slate-50')}>
                                <span className={cn('text-[11px] font-semibold', studioTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>View</span>
                                <div title="Switch list, browser, gallery, or focus view">
                                  <SelectionModeSwitcher
                                    viewMode={selectionViewMode}
                                    setViewMode={setSelectionViewMode}
                                    darkMode={studioTheme === 'dark'}
                                  />
                                </div>
                              </div>
                              <div className={cn('grid grid-cols-3 overflow-hidden rounded-[12px] border', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                                {([
                                  { id: 'default' as const, label: 'ClickUp' },
                                  { id: 'ai' as const, label: 'AI' },
                                  { id: 'merged' as const, label: 'Merged' },
                                ]).map((mode) => (
                                  <button
                                    key={mode.id}
                                    onClick={async () => {
                                      setSelectionTableMode(mode.id);
                                      if (mode.id !== 'default') {
                                        await handleLoadAiTags();
                                      }
                                    }}
                                    className={cn(
                                      'px-3 py-1.5 text-[11px] font-semibold transition-all',
                                      selectionTableMode === mode.id
                                        ? studioTheme === 'dark'
                                          ? 'bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-sky-100 shadow-[0_10px_24px_rgba(14,165,233,0.16)]'
                                          : 'bg-white text-sky-700 shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                                        : studioTheme === 'dark'
                                          ? 'text-slate-300 hover:bg-white/[0.05]'
                                          : 'text-slate-600 hover:bg-white',
                                    )}
                                  >
                                    {mode.label}
                                  </button>
                                ))}
                              </div>
                              <div className={cn('grid grid-cols-2 overflow-hidden rounded-[12px] border', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50')}>
                                {([
                                  { id: 'grouped' as const, label: 'Tasks' },
                                  { id: 'creatives' as const, label: 'Creatives' },
                                ]).map((mode) => (
                                  <button
                                    key={mode.id}
                                    type="button"
                                    title={mode.id === 'grouped' ? 'Show ClickUp-like task and folder summary rows' : 'Show every creative as a flat table row'}
                                    onClick={() => setTableLayoutMode(mode.id)}
                                    className={cn(
                                      'px-3 py-1.5 text-[11px] font-semibold transition-all',
                                      tableLayoutMode === mode.id
                                        ? studioTheme === 'dark'
                                          ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(228,235,247,0.98)_100%)] text-slate-950 shadow-[0_10px_22px_rgba(255,255,255,0.08)]'
                                          : 'bg-white text-slate-900 shadow-[0_6px_14px_rgba(15,23,42,0.08)]'
                                        : studioTheme === 'dark'
                                          ? 'text-slate-300 hover:bg-white/[0.05]'
                                          : 'text-slate-600 hover:bg-white',
                                    )}
                                  >
                                    {mode.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        {aiTaggingState.error ? (
                          <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Gemini tagging could not complete: {aiTaggingState.error}
                          </div>
                        ) : null}

                        {smartFiltersOpen && normalizeSelectionViewMode(selectionViewMode) !== 'table' ? (
                          <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-3">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                              <select
                                value={sourceChip}
                                onChange={(event) => handleSourceChipSelect(event.target.value as SelectionSourceChip)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                {discoveryChips.map((chip) => (
                                  <option key={chip.id} value={chip.id}>
                                    {chip.label} ({chip.value})
                                  </option>
                                ))}
                              </select>
                              <select
                                value={uploadDatePreset}
                                onChange={(event) => setUploadDatePreset(event.target.value as UploadDatePreset)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                <option value="all">Any upload date</option>
                                <option value="today">Today</option>
                                <option value="this_week">This week</option>
                                <option value="last_7">Last 7 days</option>
                                <option value="last_30">Last 30 days</option>
                                <option value="custom">Custom range</option>
                              </select>
                              <select
                                value={testedFilter}
                                onChange={(event) => setTestedFilter(event.target.value as TestedFilter)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                <option value="all">All statuses</option>
                                <option value="untested">Untested</option>
                                <option value="winner">Winners</option>
                                <option value="tested">Previously tested</option>
                              </select>
                              <select
                                value={formatFilter}
                                onChange={(event) => setFormatFilter(event.target.value as CreativeFormat | 'all')}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                <option value="all">All formats</option>
                                <option value="image">Images</option>
                                <option value="video">Videos</option>
                                <option value="carousel">Carousels</option>
                              </select>
                              <select
                                value={activeFieldName || ''}
                                onChange={(event) => {
                                  const nextFieldName = event.target.value || null;
                                  setActiveFieldName(nextFieldName);
                                  setActiveFacetId(null);
                                }}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                <option value="">All ClickUp fields</option>
                                {customFieldFacetGroups.map((group) => (
                                  <option key={group.fieldName} value={group.fieldName}>
                                    {group.fieldName} ({group.count})
                                  </option>
                                ))}
                              </select>
                              <select
                                value={activeFacetId || ''}
                                disabled={!activeFieldName}
                                onChange={(event) => setActiveFacetId(event.target.value || null)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                <option value="">
                                  {activeFieldName ? 'All values' : 'Pick a ClickUp field first'}
                                </option>
                                {activeFieldValues.map((facet) => (
                                  <option key={facet.id} value={facet.id}>
                                    {facet.label} ({facet.count})
                                  </option>
                                ))}
                              </select>
                              <select
                                value={sortMode}
                                onChange={(event) => setSortMode(event.target.value as SortMode)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                              >
                                <option value="recommended">Recommended sort</option>
                                <option value="name">Name</option>
                                <option value="format">Format</option>
                                <option value="tested">Test signal</option>
                              </select>
                              <button
                                onClick={() => handleSelectCreatives(visibleAssets)}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Select all filtered
                              </button>
                              <button
                                onClick={handleResetSelectionControls}
                                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Reset filters
                              </button>
                            </div>

                            {uploadDatePreset === 'custom' ? (
                              <div className="mt-3 grid gap-2 md:grid-cols-2">
                                <input
                                  type="date"
                                  value={customDateStart}
                                  onChange={(event) => setCustomDateStart(event.target.value)}
                                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                                />
                                <input
                                  type="date"
                                  value={customDateEnd}
                                  onChange={(event) => setCustomDateEnd(event.target.value)}
                                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                                />
                              </div>
                            ) : null}

                            {normalizeSelectionViewMode(selectionViewMode) === 'table' ? (
                              <div className="mt-3 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                  {listColumnOptions.map((column) => {
                                    const active = visibleColumnSet.has(column.id);
                                    return (
                                      <button
                                        key={column.id}
                                        onClick={() => {
                                          const columnId = `base:${column.id}`;
                                          setVisibleColumns((current) =>
                                            current.includes(column.id)
                                              ? current.filter((item) => item !== column.id)
                                              : [...current, column.id],
                                          );
                                          setTableColumnOrder((current) =>
                                            active
                                              ? current.filter((item) => item !== columnId)
                                              : current.includes(columnId)
                                                ? current
                                                : [...current, columnId],
                                          );
                                        }}
                                        className={cn(
                                          'rounded-full px-3 py-1.5 text-xs font-semibold transition-all',
                                          active
                                            ? 'bg-slate-900 text-white'
                                            : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                                        )}
                                      >
                                        {column.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="grid gap-2 lg:grid-cols-[220px_minmax(0,1fr)]">
                                  <select
                                    value=""
                                    onChange={(event) => {
                                      const fieldName = event.target.value;
                                      if (!fieldName) return;
                                      handleAddCustomColumn(fieldName);
                                      event.currentTarget.value = '';
                                    }}
                                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 outline-none"
                                  >
                                    <option value="">Add ClickUp column</option>
                                    {availableCustomFieldNames
                                      .filter((fieldName) => !selectedCustomFieldColumns.includes(fieldName))
                                      .map((fieldName) => (
                                        <option key={fieldName} value={fieldName}>
                                          {fieldName}
                                        </option>
                                      ))}
                                  </select>
                                  <DndContext
                                    sensors={tableColumnSensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleTableColumnDragEnd}
                                  >
                                    <SortableContext
                                      items={activeTableColumns.map((column) => column.id)}
                                      strategy={horizontalListSortingStrategy}
                                    >
                                      <div className="flex min-h-[42px] flex-wrap gap-2">
                                        {activeTableColumns.map((column) => (
                                          <SortableTableColumnChip
                                            key={column.id}
                                            column={column}
                                            darkMode={studioTheme === 'dark'}
                                            onRemove={column.kind === 'ai' ? undefined : handleRemoveTableColumn}
                                          />
                                        ))}
                                      </div>
                                    </SortableContext>
                                  </DndContext>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </section>

                    <section className={cn('overflow-hidden rounded-[24px] shadow-[0_10px_30px_rgba(15,23,42,0.06)]', studioTheme === 'dark' ? 'border border-slate-800 bg-[#08111f]' : 'border border-slate-200 bg-white')}>
                      <div className={cn('px-4 py-2.5', studioTheme === 'dark' ? 'border-b border-slate-800' : 'border-b border-slate-200')}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className={cn('min-w-0 flex flex-wrap items-center gap-2 text-sm', studioTheme === 'dark' ? 'text-slate-400' : 'text-slate-600')}>
                            <span className={cn('text-[11px] font-semibold uppercase tracking-[0.2em]', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-500')}>
                              Explorer
                            </span>
                            <span className={cn('font-semibold', studioTheme === 'dark' ? 'text-slate-100' : 'text-slate-950')}>
                              {normalizedSelectionViewMode === 'table'
                                ? 'List view'
                                : normalizedSelectionViewMode === 'list'
                                ? 'Task -> folder -> assets'
                                : browserMode === 'all_assets'
                                  ? 'Creative browser'
                                  : currentGroup?.label || 'Collection view'}
                            </span>
                            <span>{explorerVisibleAssets.length} visible</span>
                            <span>{selectedCreatives.length} selected</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {normalizedSelectionViewMode !== 'table' ? (
                              <ExplorerActionButton
                                onClick={() => setSmartFiltersOpen((current) => !current)}
                                active={smartFiltersOpen}
                                tooltip="Filters"
                                darkMode={studioTheme === 'dark'}
                                icon={<Sparkles className="h-3.5 w-3.5" />}
                              />
                            ) : null}
                            <ExplorerActionButton
                              onClick={() => setShowSelectedOnly((current) => !current)}
                              active={showSelectedOnly}
                              tooltip={showSelectedOnly ? 'Show all rows' : 'View selected'}
                              darkMode={studioTheme === 'dark'}
                              icon={<Eye className="h-3.5 w-3.5" />}
                            />
                            <ExplorerActionButton
                              onClick={handleResetSelectionControls}
                              tooltip="Reset"
                              darkMode={studioTheme === 'dark'}
                              icon={<RefreshCw className="h-3.5 w-3.5" />}
                            />
                            <ExplorerActionButton
                              onClick={() => setDetailsDrawerOpen(true)}
                              active={detailsDrawerOpen}
                              tooltip="Details"
                              darkMode={studioTheme === 'dark'}
                              icon={<BarChart3 className="h-3.5 w-3.5" />}
                            />
                          </div>
                        </div>

                        {!googleDriveConnected && productCreatives.some((creative) => !!creative.driveUrl) && (
                          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            Google Drive previews are using fallback behavior. Connect Drive for the best media fidelity.
                          </div>
                        )}
                      </div>

                      <div className="grid gap-4 p-4">
                        <div className="min-w-0">
                        {inboxLoading && productCreatives.length === 0 ? (
                          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-center">
                            <Loader2 className="h-10 w-10 animate-spin text-slate-400" />
                            <p className="mt-4 text-base font-semibold text-slate-900">
                              Loading creatives for this product
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                              Pulling ClickUp tasks and Google Drive assets for {profile?.productName || 'this product'}.
                            </p>
                          </div>
                        ) : inboxNotConnected ? (
                          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-amber-200 bg-amber-50 text-center">
                            <AlertCircle className="h-10 w-10 text-amber-500" />
                            <p className="mt-4 text-base font-semibold text-amber-900">
                              ClickUp is not connected for this store
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-amber-800">
                              Connect ClickUp first so Creative Hub can pull tasks and attached Drive links for this product.
                            </p>
                          </div>
                        ) : inboxNotConfigured ? (
                          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-center">
                            <FolderTree className="h-10 w-10 text-slate-400" />
                            <p className="mt-4 text-base font-semibold text-slate-900">
                              This product is not mapped to a ClickUp list
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                              Add the ClickUp list on the Product Profile so we can load the correct tasks and creatives here.
                            </p>
                          </div>
                        ) : inboxError && productCreatives.length === 0 ? (
                          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-rose-200 bg-rose-50 text-center">
                            <AlertCircle className="h-10 w-10 text-rose-500" />
                            <p className="mt-4 text-base font-semibold text-rose-900">
                              Creative load failed
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-rose-700">
                              {inboxError}
                            </p>
                          </div>
                        ) : explorerVisibleAssets.length === 0 ? (
                          <div className="flex h-full min-h-[300px] flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-200 bg-slate-50 text-center">
                            <ImageIcon className="h-10 w-10 text-slate-400" />
                            <p className="mt-4 text-base font-semibold text-slate-900">
                              {currentGroup && currentGroup.count > 0
                                ? 'This group has assets, but none match the current filters'
                                : 'No creatives match the current filters'}
                            </p>
                            <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                              {currentGroup && currentGroup.count > 0
                                ? `Try clearing the search or switching the format filter. ${currentGroup.label} has ${currentGroup.count} total assets available.`
                                : 'Try switching to another task or folder, loosen the tested-status filters, or search for a different hook or tag.'}
                            </p>
                            <button
                              onClick={() => {
                                setSearch('');
                                setFormatFilter('all');
                                setTestedFilter('all');
                              }}
                              className="mt-4 rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_24px_rgba(14,165,233,0.22)] transition hover:bg-sky-500"
                            >
                              Clear filters
                            </button>
                          </div>
                        ) : normalizeSelectionViewMode(selectionViewMode) === 'table' ? (
                          <div className={cn('overflow-hidden rounded-[20px] shadow-[0_14px_34px_rgba(15,23,42,0.05)]', studioTheme === 'dark' ? 'border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,29,0.96)_0%,rgba(6,10,19,1)_100%)] shadow-[0_26px_60px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.03)]' : 'border border-slate-200/90 bg-white')}>
                            <div className="overflow-x-auto">
                              <table className={cn('min-w-[1420px] text-[13px] leading-6', studioTheme === 'dark' ? 'divide-y divide-white/10' : 'divide-y divide-slate-200')}>
                                <thead className={cn('text-left', studioTheme === 'dark' ? 'bg-[linear-gradient(180deg,rgba(12,24,43,0.98)_0%,rgba(8,16,30,0.98)_100%)]' : 'bg-[linear-gradient(180deg,rgba(248,250,252,0.92)_0%,rgba(255,255,255,1)_100%)]')}>
                                  <tr>
                                    <th className={cn('w-[52px] px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.22em]', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                                      Row
                                    </th>
                                    {activeTableColumns.map((column) => {
                                      const isUploadedColumn = column.kind === 'base' && column.baseKey === 'uploaded';
                                      const selectedValues = tableColumnFilters[column.id] || [];
                                      const hasValueFilter = isUploadedColumn
                                        ? uploadDatePreset !== 'all' || Boolean(customDateStart) || Boolean(customDateEnd)
                                        : selectedValues.length > 0;
                                      const isMenuOpen = openTableColumnMenuId === column.id;
                                      const columnOptions = tableColumnFilterOptions[column.id] || [];

                                      return (
                                        <th key={column.id} className="relative min-w-[180px] px-3 py-3 align-top">
                                          <div className="relative">
                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                const anchor = event.currentTarget;

                                                setOpenTableColumnMenuId((current) => {
                                                  if (current === column.id) {
                                                    setTableColumnMenuPosition(null);
                                                    tableColumnMenuAnchorRef.current = null;
                                                    return null;
                                                  }

                                                  const menuWidth = 280;
                                                  const margin = 12;
                                                  const rect = anchor.getBoundingClientRect();
                                                  const left = Math.min(
                                                    Math.max(rect.right - menuWidth, margin),
                                                    window.innerWidth - menuWidth - margin,
                                                  );

                                                  setTableColumnMenuPosition({
                                                    top: Math.max(rect.bottom + 10, margin),
                                                    left,
                                                  });
                                                  tableColumnMenuAnchorRef.current = anchor;
                                                  return column.id;
                                                });
                                              }}
                                              className={cn(
                                                'group flex items-center gap-2 rounded-[10px] px-2 py-1.5 text-left text-[11px] font-semibold tracking-[0.01em] transition-all',
                                                isMenuOpen || hasValueFilter || tableSort?.columnId === column.id
                                                  ? studioTheme === 'dark'
                                                    ? 'bg-[linear-gradient(180deg,rgba(13,52,79,0.98)_0%,rgba(11,33,60,0.98)_100%)] text-sky-100 shadow-[0_10px_22px_rgba(14,165,233,0.16),inset_0_0_0_1px_rgba(125,211,252,0.24)]'
                                                    : 'bg-sky-50 text-sky-700 shadow-[inset_0_0_0_1px_rgba(186,230,253,0.95)]'
                                                  : studioTheme === 'dark'
                                                    ? 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                                                    : 'text-slate-500 hover:bg-white hover:text-slate-700',
                                              )}
                                            >
                                              <span>{column.label}</span>
                                              <SortIndicator
                                                active={tableSort?.columnId === column.id}
                                                direction={tableSort?.columnId === column.id ? tableSort.direction : undefined}
                                                darkMode={studioTheme === 'dark'}
                                              />
                                            </button>
                                          </div>
                                          {isMenuOpen
                                            ? renderTableColumnMenu(
                                                column,
                                                isUploadedColumn,
                                                selectedValues,
                                                columnOptions,
                                              )
                                            : null}
                                        </th>
                                      );
                                    })}
                                  </tr>
                                </thead>
                                <tbody className={cn(studioTheme === 'dark' ? 'divide-y divide-white/10 bg-transparent' : 'divide-y divide-slate-200 bg-white')}>
                                  {tableLayoutMode === 'grouped' ? tableHierarchicalGroups.map((taskGroup) => {
                                    const taskExpanded =
                                      expandedTableTaskIds.includes(taskGroup.id) || showSelectedOnly;
                                    const taskSelectionState =
                                      taskGroup.selectedCount === 0
                                        ? 'none'
                                        : taskGroup.selectedCount === taskGroup.count
                                          ? 'all'
                                          : 'partial';

                                    return (
                                      <Fragment key={`task-group-${taskGroup.id}`}>
                                        <tr
                                          key={`task-row-${taskGroup.id}`}
                                          className={cn(
                                            'transition-colors',
                                            taskSelectionState === 'all'
                                              ? studioTheme === 'dark'
                                                ? 'bg-[linear-gradient(180deg,rgba(18,54,86,0.9)_0%,rgba(11,31,53,0.98)_100%)] shadow-[inset_3px_0_0_0_rgba(125,211,252,0.92)] hover:bg-[linear-gradient(180deg,rgba(21,61,97,0.94)_0%,rgba(12,35,58,0.99)_100%)]'
                                                : 'bg-sky-100/90 shadow-[inset_3px_0_0_0_rgba(14,165,233,0.78)] hover:bg-sky-100'
                                              : taskSelectionState === 'partial'
                                                ? studioTheme === 'dark'
                                                  ? 'bg-[linear-gradient(180deg,rgba(12,30,52,0.98)_0%,rgba(9,23,40,0.98)_100%)] shadow-[inset_3px_0_0_0_rgba(56,189,248,0.6)] hover:bg-[linear-gradient(180deg,rgba(14,35,59,0.99)_0%,rgba(10,26,45,0.99)_100%)]'
                                                  : 'bg-sky-50/90 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.58)] hover:bg-sky-50'
                                                : studioTheme === 'dark'
                                                  ? 'bg-[linear-gradient(180deg,rgba(9,17,31,0.96)_0%,rgba(6,12,23,0.98)_100%)] hover:bg-[linear-gradient(180deg,rgba(11,21,38,0.98)_0%,rgba(8,15,28,0.99)_100%)]'
                                                  : 'bg-slate-50/80 hover:bg-slate-100/90',
                                          )}
                                        >
                                          <td className="px-3 py-2.5">
                                            <div className="flex items-center gap-2">
                                              <button
                                                onClick={() => handleToggleGroupSelection(taskGroup.assets)}
                                                className={cn(
                                                  'inline-flex h-7 w-7 items-center justify-center rounded-[10px] border text-xs font-semibold transition-all',
                                                  taskSelectionState === 'all'
                                                    ? 'border-sky-500 bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.24)]'
                                                    : taskSelectionState === 'partial'
                                                      ? studioTheme === 'dark'
                                                        ? 'border-sky-400/40 bg-[rgba(56,189,248,0.12)] text-sky-200'
                                                        : 'border-sky-300 bg-sky-100 text-sky-700'
                                                      : studioTheme === 'dark'
                                                        ? 'border-white/12 bg-white/[0.03] text-slate-500 hover:border-white/20 hover:bg-white/[0.05]'
                                                        : 'border-slate-300 bg-white text-slate-400 hover:border-slate-400 hover:bg-slate-50',
                                                )}
                                                aria-label={`${taskSelectionState === 'all' ? 'Unselect' : 'Select'} ${taskGroup.label}`}
                                                title={`${taskSelectionState === 'all' ? 'Unselect' : 'Select'} ${taskGroup.label}`}
                                              >
                                                {taskSelectionState === 'all' ? (
                                                  <Check className="h-4 w-4" />
                                                ) : taskSelectionState === 'partial' ? (
                                                  <span className="h-0.5 w-3 rounded-full bg-current" />
                                                ) : null}
                                              </button>
                                              <button
                                                onClick={() => handleToggleTableTask(taskGroup.id)}
                                                className={cn('inline-flex h-7 w-7 items-center justify-center rounded-[10px] border transition', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
                                                aria-label={`${taskExpanded ? 'Collapse' : 'Expand'} ${taskGroup.label}`}
                                              >
                                                <ChevronDown
                                                  className={cn(
                                                    'h-4 w-4 transition-transform',
                                                    taskExpanded ? 'rotate-0' : '-rotate-90',
                                                  )}
                                                />
                                              </button>
                                            </div>
                                          </td>
                                          {activeTableColumns.map((column) => {
                                            if (column.kind === 'base' && column.baseKey === 'asset') {
                                              return (
                                                <td key={column.id} className="px-3 py-2.5">
                                                  <div className="flex min-w-[260px] items-center gap-2.5">
                                                    <p className={cn('truncate text-[14px] font-semibold tracking-[-0.01em]', studioTheme === 'dark' ? 'text-slate-100' : 'text-slate-950')}>{taskGroup.label}</p>
                                                    <span
                                                      className={cn(
                                                        'inline-flex h-6 min-w-[30px] shrink-0 items-center justify-center rounded-full px-2.5 text-[10px] font-semibold tracking-[0.08em] ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
                                                        taskSelectionState === 'all'
                                                          ? studioTheme === 'dark'
                                                            ? 'bg-[rgba(56,189,248,0.14)] text-sky-100 ring-sky-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                            : 'bg-sky-100 text-sky-700 ring-sky-200'
                                                          : taskSelectionState === 'partial'
                                                            ? studioTheme === 'dark'
                                                              ? 'bg-[rgba(14,165,233,0.08)] text-sky-100 ring-sky-400/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                                                              : 'bg-sky-50 text-sky-700 ring-sky-200'
                                                            : studioTheme === 'dark'
                                                              ? 'bg-white/[0.03] text-slate-300 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                                              : 'bg-white text-slate-600 ring-slate-200',
                                                      )}
                                                      title={`${taskGroup.count} creatives`}
                                                    >
                                                      {taskGroup.count}
                                                    </span>
                                                  </div>
                                                </td>
                                              );
                                            }

                                            return (
                                              <td key={column.id} className="px-3 py-2.5">
                                                <span
                                                          className={getTableCellTextClass(column, studioTheme === 'dark')}
                                                  title={getTableGroupSummaryText(taskGroup.assets, column, 'task', taskGroup.label)}
                                                >
                                                  {getTableGroupSummaryText(taskGroup.assets, column, 'task', taskGroup.label)}
                                                </span>
                                              </td>
                                            );
                                          })}
                                        </tr>

                                        {taskExpanded
                                          ? taskGroup.folders.map((folderGroup) => {
                                              const folderExpanded =
                                                expandedTableFolderIds.includes(folderGroup.id) || showSelectedOnly;
                                              const folderSelectionState =
                                                folderGroup.selectedCount === 0
                                                  ? 'none'
                                                  : folderGroup.selectedCount === folderGroup.count
                                                    ? 'all'
                                                    : 'partial';

                                              return (
                                                <Fragment key={`folder-group-${taskGroup.id}-${folderGroup.id}`}>
                                                  <tr
                                                    key={`folder-row-${taskGroup.id}-${folderGroup.id}`}
                                                    className={cn(
                                                      'transition-colors',
                                                      folderSelectionState === 'all'
                                                        ? studioTheme === 'dark'
                                                          ? 'bg-[linear-gradient(180deg,rgba(14,47,75,0.78)_0%,rgba(10,30,50,0.94)_100%)] shadow-[inset_3px_0_0_0_rgba(125,211,252,0.68)] hover:bg-[linear-gradient(180deg,rgba(17,54,85,0.84)_0%,rgba(11,34,56,0.96)_100%)]'
                                                          : 'bg-sky-50/90 shadow-[inset_3px_0_0_0_rgba(14,165,233,0.56)] hover:bg-sky-50'
                                                      : folderSelectionState === 'partial'
                                                          ? studioTheme === 'dark'
                                                            ? 'bg-[linear-gradient(180deg,rgba(11,27,47,0.96)_0%,rgba(9,22,39,0.98)_100%)] shadow-[inset_3px_0_0_0_rgba(56,189,248,0.46)] hover:bg-[linear-gradient(180deg,rgba(13,32,54,0.98)_0%,rgba(10,24,43,0.99)_100%)]'
                                                            : 'bg-sky-50/75 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.42)] hover:bg-sky-50'
                                                          : studioTheme === 'dark'
                                                            ? 'bg-[linear-gradient(180deg,rgba(10,20,36,0.92)_0%,rgba(8,16,30,0.96)_100%)] hover:bg-[linear-gradient(180deg,rgba(12,24,42,0.96)_0%,rgba(10,19,34,0.98)_100%)]'
                                                            : 'bg-sky-50/35 hover:bg-sky-50/60',
                                                    )}
                                                  >
                                                    <td className="px-3 py-2.5">
                                                      <div className="ml-6 flex items-center gap-2">
                                                        <button
                                                          onClick={() => handleToggleGroupSelection(folderGroup.assets)}
                                                          className={cn(
                                                            'inline-flex h-7 w-7 items-center justify-center rounded-[10px] border text-xs font-semibold transition-all',
                                                            folderSelectionState === 'all'
                                                              ? 'border-sky-500 bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.22)]'
                                                              : folderSelectionState === 'partial'
                                                                ? studioTheme === 'dark'
                                                                  ? 'border-sky-400/40 bg-[rgba(56,189,248,0.12)] text-sky-200'
                                                                  : 'border-sky-300 bg-sky-100 text-sky-700'
                                                                : studioTheme === 'dark'
                                                                  ? 'border-white/12 bg-white/[0.03] text-slate-500 hover:bg-white/[0.05]'
                                                                  : 'border-sky-200 bg-white text-sky-400 hover:bg-sky-50',
                                                          )}
                                                          aria-label={`${folderSelectionState === 'all' ? 'Unselect' : 'Select'} ${folderGroup.label}`}
                                                          title={`${folderSelectionState === 'all' ? 'Unselect' : 'Select'} ${folderGroup.label}`}
                                                        >
                                                          {folderSelectionState === 'all' ? (
                                                            <Check className="h-4 w-4" />
                                                          ) : folderSelectionState === 'partial' ? (
                                                            <span className="h-0.5 w-3 rounded-full bg-current" />
                                                          ) : null}
                                                        </button>
                                                        <button
                                                          onClick={() => handleToggleTableFolder(folderGroup.id)}
                                                          className={cn('inline-flex h-7 w-7 items-center justify-center rounded-[10px] border transition', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]' : 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50')}
                                                          aria-label={`${folderExpanded ? 'Collapse' : 'Expand'} ${folderGroup.label}`}
                                                        >
                                                          <ChevronDown
                                                            className={cn(
                                                              'h-4 w-4 transition-transform',
                                                              folderExpanded ? 'rotate-0' : '-rotate-90',
                                                            )}
                                                          />
                                                        </button>
                                                      </div>
                                                    </td>
                                                    {activeTableColumns.map((column) => {
                                                      if (column.kind === 'base' && column.baseKey === 'asset') {
                                                        return (
                                                          <td key={column.id} className="px-3 py-2.5">
                                                            <div className="flex min-w-[240px] items-center gap-2">
                                                              <p className={cn('truncate text-[13px] font-semibold tracking-[0.01em]', studioTheme === 'dark' ? 'text-slate-200' : 'text-slate-900')}>{folderGroup.label}</p>
                                                              <span
                                                                className={cn(
                                                                  'inline-flex h-6 min-w-[30px] shrink-0 items-center justify-center rounded-full px-2.5 text-[10px] font-semibold tracking-[0.08em] ring-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]',
                                                                  folderSelectionState === 'all'
                                                                    ? studioTheme === 'dark'
                                                                      ? 'bg-[rgba(56,189,248,0.14)] text-sky-100 ring-sky-400/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                                                      : 'bg-sky-100 text-sky-700 ring-sky-200'
                                                                    : folderSelectionState === 'partial'
                                                                      ? studioTheme === 'dark'
                                                                        ? 'bg-[rgba(14,165,233,0.08)] text-sky-100 ring-sky-400/16 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                                                                        : 'bg-sky-50 text-sky-700 ring-sky-200'
                                                                      : studioTheme === 'dark'
                                                                        ? 'bg-white/[0.03] text-slate-300 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]'
                                                                        : 'bg-white text-sky-700 ring-sky-200',
                                                                )}
                                                                title={`${folderGroup.count} creatives`}
                                                              >
                                                                {folderGroup.count}
                                                              </span>
                                                            </div>
                                                          </td>
                                                        );
                                                      }

                                                      return (
                                                        <td key={column.id} className="px-3 py-2.5">
                                                          <span
                                                            className={getTableCellTextClass(column, studioTheme === 'dark')}
                                                            title={getTableGroupSummaryText(folderGroup.assets, column, 'folder', folderGroup.label)}
                                                          >
                                                            {getTableGroupSummaryText(folderGroup.assets, column, 'folder', folderGroup.label)}
                                                          </span>
                                                        </td>
                                                      );
                                                    })}
                                                  </tr>

                                                  {folderExpanded
                                                    ? folderGroup.assets.map((creative, creativeIndex) => {
                                                        const statusMeta = getTableStatusMeta(creative);
                                                        const mediaMeta = getTableMediaMeta(creative, studioTheme === 'dark');
                                                        const fieldPreview =
                                                          creative.clickupCustomFields?.slice(0, 2) || [];
                                                        const previewUrl = getThumbnailUrl(creative);
                                                        const creativeSelected = selectedIds.has(creative.id);

                                                        return (
                                                          <tr
                                                            key={creative.id}
                                                            onClick={() => {
                                                              setFocusedId(creative.id);
                                                              setDetailsDrawerOpen(true);
                                                            }}
                                                            className={cn(
                                                              'cursor-pointer align-top transition-colors',
                                                              creativeSelected
                                                                ? studioTheme === 'dark'
                                                                  ? 'bg-[linear-gradient(180deg,rgba(11,37,60,0.98)_0%,rgba(9,27,47,0.98)_100%)] shadow-[inset_3px_0_0_0_rgba(56,189,248,0.62)] hover:bg-[linear-gradient(180deg,rgba(13,45,72,0.99)_0%,rgba(10,31,54,0.99)_100%)]'
                                                                  : 'bg-sky-50/90 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.52)] hover:bg-sky-50'
                                                                : focusedCreative?.id === creative.id
                                                                  ? studioTheme === 'dark'
                                                                    ? creativeIndex % 2 === 0
                                                                      ? 'bg-[rgba(11,24,42,0.98)] hover:bg-[rgba(13,29,49,1)]'
                                                                      : 'bg-[rgba(12,27,46,0.98)] hover:bg-[rgba(14,32,53,1)]'
                                                                    : 'bg-slate-50'
                                                                  : studioTheme === 'dark'
                                                                    ? creativeIndex % 2 === 0
                                                                      ? 'bg-[rgba(8,16,30,0.92)] hover:bg-[rgba(10,21,38,0.98)]'
                                                                      : 'bg-[rgba(10,20,36,0.96)] hover:bg-[rgba(12,25,43,0.98)]'
                                                                    : 'bg-white hover:bg-slate-50/80',
                                                            )}
                                                          >
                                                            <td className="px-3 py-2.5">
                                                              <button
                                                                onClick={(event) => {
                                                                  event.stopPropagation();
                                                                  toggleCreativeSelection(creative.id);
                                                                }}
                                                                className={cn(
                                                                  'ml-10 inline-flex h-7 w-7 items-center justify-center rounded-[10px] border text-xs font-semibold transition-all',
                                                                  creativeSelected
                                                                    ? 'border-sky-500 bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.24)]'
                                                                    : studioTheme === 'dark'
                                                                      ? 'border-white/12 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07]'
                                                                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                                                                )}
                                                              >
                                                                {creativeSelected ? <Check className="h-4 w-4" /> : ''}
                                                              </button>
                                                            </td>
                                                            {activeTableColumns.map((column) => {
                                                              if (column.kind === 'base' && column.baseKey === 'asset') {
                                                                return (
                                                                  <td key={column.id} className="px-3 py-2.5">
                                                                    <div className="flex min-w-[260px] items-center gap-2.5">
                                                                      <div className={cn('relative h-9 w-9 overflow-hidden rounded-[12px] ring-1', studioTheme === 'dark' ? 'bg-white/[0.04] ring-white/10' : 'bg-slate-100 ring-slate-200/80')}>
                                                                        {previewUrl ? (
                                                                          <>
                                                                            <img
                                                                              src={previewUrl}
                                                                              alt={creative.creativeName}
                                                                              className="h-full w-full object-cover"
                                                                            />
                                                                          </>
                                                                        ) : (
                                                                          <div className={cn('flex h-full w-full items-center justify-center', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                                                                            {isVideoCreative(creative) ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                                                                          </div>
                                                                        )}
                                                                      </div>
                                                                      <div className="min-w-0">
                                                                        <p className={cn('truncate text-[13px] font-semibold tracking-[0.01em]', studioTheme === 'dark' ? 'text-slate-100' : 'text-slate-900')}>
                                                                          {creative.creativeName}
                                                                        </p>
                                                                        <p className={cn('truncate text-[10px] font-semibold uppercase tracking-[0.18em]', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                                                                          {mediaMeta.label}
                                                                        </p>
                                                                      </div>
                                                                    </div>
                                                                  </td>
                                                                );
                                                              }

                                                              if (column.kind === 'base' && column.baseKey === 'media') {
                                                                return (
                                                                  <td key={column.id} className="px-3 py-2.5">
                                                                    <span
                                                                      className={cn(
                                                                        'inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                                                                        mediaMeta.className,
                                                                      )}
                                                                    >
                                                                      {mediaMeta.label}
                                                                    </span>
                                                                  </td>
                                                                );
                                                              }

                                                              if (column.kind === 'base' && column.baseKey === 'status') {
                                                                return (
                                                                  <td key={column.id} className="px-3 py-2.5">
                                                                    <span className={cn('inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]', statusMeta.className)}>
                                                                      {statusMeta.label}
                                                                    </span>
                                                                  </td>
                                                                );
                                                              }

                                                              if (column.kind === 'base' && column.baseKey === 'fields') {
                                                                return (
                                                                  <td key={column.id} className="px-3 py-2.5">
                                                                    <div className="flex min-w-[210px] flex-wrap gap-1.5">
                                                                      {fieldPreview.length > 0 ? (
                                                                        fieldPreview.map((field) => (
                                                                          <span
                                                                            key={field.id}
                                                                            className={cn('rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.01em]', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}
                                                                          >
                                                                            {field.name}: {truncate(formatClickUpFieldValue(field), 18)}
                                                                          </span>
                                                                        ))
                                                                      ) : (
                                                                        <span className={cn('text-xs', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>No fields</span>
                                                                      )}
                                                                    </div>
                                                                  </td>
                                                                );
                                                              }

                                                              return (
                                                                <td key={column.id} className="px-3 py-2.5">
                                                                  {getTableColumnText(creative, column) ? (
                                                                    <span className={getTableCellTextClass(column, studioTheme === 'dark')}>
                                                                      {getTableColumnText(creative, column)}
                                                                    </span>
                                                                  ) : (
                                                                    <span className={cn(studioTheme === 'dark' ? 'text-slate-600' : 'text-slate-400')}>-</span>
                                                                  )}
                                                                </td>
                                                              );
                                                            })}
                                                          </tr>
                                                        );
                                                      })
                                                    : null}
                                                </Fragment>
                                              );
                                            })
                                          : null}
                                      </Fragment>
                                    );
                                  }) : flatTableCreatives.map((creative, index) => {
                                    const fieldPreview = creative.clickupCustomFields?.slice(0, 2) || [];
                                    const previewUrl = getThumbnailUrl(creative);
                                    const statusMeta = getTableStatusMeta(creative);
                                    const mediaMeta = getTableMediaMeta(creative, studioTheme === 'dark');
                                    const creativeSelected = selectedIds.has(creative.id);

                                    return (
                                      <tr
                                        key={`flat-${creative.id}`}
                                        onClick={() => {
                                          setFocusedId(creative.id);
                                          setDetailsDrawerOpen(true);
                                        }}
                                        className={cn(
                                          'cursor-pointer align-top transition-colors',
                                          creativeSelected
                                            ? studioTheme === 'dark'
                                              ? 'bg-[linear-gradient(180deg,rgba(11,37,60,0.98)_0%,rgba(9,27,47,0.98)_100%)] shadow-[inset_3px_0_0_0_rgba(56,189,248,0.62)] hover:bg-[linear-gradient(180deg,rgba(13,45,72,0.99)_0%,rgba(10,31,54,0.99)_100%)]'
                                              : 'bg-sky-50/90 shadow-[inset_3px_0_0_0_rgba(56,189,248,0.52)] hover:bg-sky-50'
                                            : focusedCreative?.id === creative.id
                                              ? studioTheme === 'dark'
                                                ? index % 2 === 0
                                                  ? 'bg-[rgba(11,24,42,0.98)] hover:bg-[rgba(13,29,49,1)]'
                                                  : 'bg-[rgba(12,27,46,0.98)] hover:bg-[rgba(14,32,53,1)]'
                                                : 'bg-slate-50'
                                              : studioTheme === 'dark'
                                                ? index % 2 === 0
                                                  ? 'bg-[rgba(8,16,30,0.92)] hover:bg-[rgba(10,21,38,0.98)]'
                                                  : 'bg-[rgba(10,20,36,0.96)] hover:bg-[rgba(12,25,43,0.98)]'
                                                : 'bg-white hover:bg-slate-50/80',
                                        )}
                                      >
                                        <td className="px-3 py-2.5">
                                          <button
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              toggleCreativeSelection(creative.id);
                                            }}
                                            className={cn(
                                              'inline-flex h-7 w-7 items-center justify-center rounded-[10px] border text-xs font-semibold transition-all',
                                              creativeSelected
                                                ? 'border-sky-500 bg-sky-500 text-white shadow-[0_10px_22px_rgba(14,165,233,0.24)]'
                                                : studioTheme === 'dark'
                                                  ? 'border-white/12 bg-white/[0.04] text-slate-400 hover:bg-white/[0.07]'
                                                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                                            )}
                                            title={`Select row ${index + 1}`}
                                          >
                                            {creativeSelected ? <Check className="h-4 w-4" /> : ''}
                                          </button>
                                        </td>
                                        {activeTableColumns.map((column) => {
                                          if (column.kind === 'base' && column.baseKey === 'asset') {
                                            return (
                                              <td key={column.id} className="px-3 py-2.5">
                                                <div className="flex min-w-[260px] items-center gap-2.5">
                                                  <div className={cn('relative h-9 w-9 overflow-hidden rounded-[12px] ring-1', studioTheme === 'dark' ? 'bg-white/[0.04] ring-white/10' : 'bg-slate-100 ring-slate-200/80')}>
                                                    {previewUrl ? (
                                                      <img
                                                        src={previewUrl}
                                                        alt={creative.creativeName}
                                                        className="h-full w-full object-cover"
                                                      />
                                                    ) : (
                                                      <div className={cn('flex h-full w-full items-center justify-center', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                                                        {isVideoCreative(creative) ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="min-w-0">
                                                    <p className={cn('truncate text-[13px] font-semibold tracking-[0.01em]', studioTheme === 'dark' ? 'text-slate-100' : 'text-slate-900')}>
                                                      {creative.creativeName}
                                                    </p>
                                                    <p className={cn('truncate text-[10px] font-semibold uppercase tracking-[0.18em]', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>
                                                      {mediaMeta.label}
                                                    </p>
                                                  </div>
                                                </div>
                                              </td>
                                            );
                                          }

                                          if (column.kind === 'base' && column.baseKey === 'media') {
                                            return (
                                              <td key={column.id} className="px-3 py-2.5">
                                                <span
                                                  className={cn(
                                                    'inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                                                    mediaMeta.className,
                                                  )}
                                                >
                                                  {mediaMeta.label}
                                                </span>
                                              </td>
                                            );
                                          }

                                          if (column.kind === 'base' && column.baseKey === 'status') {
                                            return (
                                              <td key={column.id} className="px-3 py-2.5">
                                                <span className={cn('inline-flex rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em]', statusMeta.className)}>
                                                  {statusMeta.label}
                                                </span>
                                              </td>
                                            );
                                          }

                                          if (column.kind === 'base' && column.baseKey === 'fields') {
                                            return (
                                              <td key={column.id} className="px-3 py-2.5">
                                                <div className="flex min-w-[210px] flex-wrap gap-1.5">
                                                  {fieldPreview.length > 0 ? (
                                                    fieldPreview.map((field) => (
                                                      <span
                                                        key={field.id}
                                                        className={cn('rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-[0.01em]', studioTheme === 'dark' ? 'border-white/10 bg-white/[0.04] text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600')}
                                                      >
                                                        {field.name}: {truncate(formatClickUpFieldValue(field), 18)}
                                                      </span>
                                                    ))
                                                  ) : (
                                                    <span className={cn('text-xs', studioTheme === 'dark' ? 'text-slate-500' : 'text-slate-400')}>No fields</span>
                                                  )}
                                                </div>
                                              </td>
                                            );
                                          }

                                          return (
                                            <td key={column.id} className="px-3 py-2.5">
                                              {getTableColumnText(creative, column) ? (
                                                <span className={getTableCellTextClass(column, studioTheme === 'dark')}>
                                                  {getTableColumnText(creative, column)}
                                                </span>
                                              ) : (
                                                <span className={cn(studioTheme === 'dark' ? 'text-slate-600' : 'text-slate-400')}>-</span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : normalizeSelectionViewMode(selectionViewMode) === 'list' ? (
                          <div className="grid gap-3 xl:grid-cols-[200px_220px_minmax(0,1fr)]">
                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-2.5">
                              <div className="mb-3">
                                <p className="text-sm font-semibold text-slate-900">Tasks</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">Open or select in one click.</p>
                              </div>
                              <div className="space-y-2">
                                {taskGroups.length > 0 ? (
                                  taskGroups.map((group) => (
                                    <div
                                      key={group.id}
                                      className={cn(
                                        'rounded-[14px] border px-3 py-2 transition-all',
                                        effectiveColumnTaskId === group.id
                                          ? 'border-sky-200 bg-sky-50/90 text-slate-950 shadow-[0_10px_22px_rgba(14,165,233,0.10)]'
                                          : 'border-slate-200 bg-white hover:border-slate-300',
                                      )}
                                    >
                                      <button
                                        onClick={() => {
                                          if (effectiveColumnTaskId === group.id && browserMode === 'by_task') {
                                            setBrowserMode('all_assets');
                                            setActiveGroupId(null);
                                            setColumnTaskId(null);
                                            setColumnFolderId(null);
                                            return;
                                          }
                                          setBrowserMode('by_task');
                                          setActiveGroupId(group.id);
                                          setColumnTaskId(group.id);
                                          setColumnFolderId(null);
                                          setFocusedId(group.assets[0]?.id || null);
                                        }}
                                        className="w-full text-left"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold leading-5">
                                              {group.label}
                                            </p>
                                          </div>
                                          <span
                                            className={cn(
                                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                              effectiveColumnTaskId === group.id
                                                ? 'bg-white text-sky-700 ring-1 ring-sky-100'
                                                : 'bg-slate-100 text-slate-600',
                                            )}
                                          >
                                            {group.count}
                                          </span>
                                        </div>
                                      </button>
                                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                        <span className={cn('rounded-full px-3 py-1.5 font-semibold whitespace-nowrap', effectiveColumnTaskId === group.id ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600')}>
                                          {group.selectedCount} selected
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-500 whitespace-nowrap">
                                          {group.count} total
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm leading-6 text-slate-500">
                                    No ClickUp tasks were available for this product.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-2.5">
                              <div className="mb-3">
                                <p className="text-sm font-semibold text-slate-900">Folders</p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">Open or select in one click.</p>
                              </div>
                              <div className="space-y-2">
                                {columnFolderGroups.length > 0 ? (
                                  columnFolderGroups.map((group) => (
                                    <div
                                      key={group.id}
                                      className={cn(
                                        'rounded-[14px] border px-3 py-2 transition-all',
                                        effectiveColumnFolderId === group.id
                                          ? 'border-sky-200 bg-sky-50/90 text-slate-950 shadow-[0_10px_22px_rgba(14,165,233,0.10)]'
                                          : 'border-slate-200 bg-white hover:border-slate-300',
                                      )}
                                    >
                                      <button
                                        onClick={() => {
                                          if (effectiveColumnFolderId === group.id && browserMode !== 'all_assets') {
                                            setBrowserMode('by_task');
                                            setColumnFolderId(null);
                                            setActiveGroupId(columnTaskGroup?.id || null);
                                            return;
                                          }
                                          setBrowserMode(group.label === 'All assets in task' ? 'by_task' : 'by_folder');
                                          setColumnFolderId(group.id);
                                          if (group.label !== 'All assets in task') {
                                            setActiveGroupId(group.id);
                                          }
                                          setFocusedId(group.assets[0]?.id || null);
                                        }}
                                        className="w-full text-left"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="min-w-0">
                                            <p className="break-words text-sm font-semibold leading-5">
                                              {group.label}
                                            </p>
                                          </div>
                                          <span
                                            className={cn(
                                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                              effectiveColumnFolderId === group.id
                                                ? 'bg-white text-sky-700 ring-1 ring-sky-100'
                                                : 'bg-slate-100 text-slate-600',
                                            )}
                                          >
                                            {group.count}
                                          </span>
                                        </div>
                                      </button>
                                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                        <span className={cn('rounded-full px-3 py-1.5 font-semibold whitespace-nowrap', effectiveColumnFolderId === group.id ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600')}>
                                          {group.selectedCount} selected
                                        </span>
                                        <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-500 whitespace-nowrap">
                                          {group.count} total
                                        </span>
                                      </div>
                                    </div>
                                  ))
                                ) : (
                                  <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-4 py-6 text-sm leading-6 text-slate-500">
                                    This task has no nested Drive folders. Use the task column to review all assets directly.
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="rounded-[22px] border border-slate-200 bg-white p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Creatives</p>
                                  <p className="mt-1 text-xs leading-5 text-slate-500">
                                    Full task names, uploaded dates, ClickUp fields, and selection stay visible here.
                                  </p>
                                </div>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                  {columnVisibleAssets.length}
                                </span>
                              </div>

                              {columnVisibleAssets.length > 0 ? (
                                <div className="space-y-3">
                                  {columnVisibleAssets.map((creative) => (
                                    <AssetListRow
                                      key={creative.id}
                                      creative={creative}
                                      selected={selectedIds.has(creative.id)}
                                      focused={focusedCreative?.id === creative.id}
                                      onToggle={() => toggleCreativeSelection(creative.id)}
                                      onFocus={() => setFocusedId(creative.id)}
                                      onPreview={() => setPreviewCreative(creative)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm leading-6 text-slate-500">
                                  No assets match the current task, folder, and filter combination.
                                </div>
                              )}
                            </div>
                          </div>
                        ) : normalizeSelectionViewMode(selectionViewMode) === 'grid' ? (
                          <div
                            className={cn(
                              'grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
                              selectionDensity === 'compact' ? '3xl:grid-cols-6' : '3xl:grid-cols-5',
                            )}
                          >
                            {visibleAssets.map((creative) => (
                              <CompactAssetCard
                                key={creative.id}
                                creative={creative}
                                selected={selectedIds.has(creative.id)}
                                focused={focusedCreative?.id === creative.id}
                                onToggle={() => toggleCreativeSelection(creative.id)}
                                onFocus={() => setFocusedId(creative.id)}
                                onPreview={() => setPreviewCreative(creative)}
                                onBrowseFolder={
                                  creative.driveFolderId
                                    ? () => {
                                        setBrowserMode('by_folder');
                                        setActiveGroupId(creative.driveFolderId || null);
                                      }
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        ) : normalizeSelectionViewMode(selectionViewMode) === 'focus' ? (
                          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                            <div>
                              {focusedCreative ? (
                                <AssetCard
                                  creative={focusedCreative}
                                  selected={selectedIds.has(focusedCreative.id)}
                                  focused
                                  onToggle={() => toggleCreativeSelection(focusedCreative.id)}
                                  onFocus={() => setFocusedId(focusedCreative.id)}
                                  onPreview={() => setPreviewCreative(focusedCreative)}
                                  onBrowseFolder={
                                    focusedCreative.driveFolderId
                                      ? () => {
                                          setBrowserMode('by_folder');
                                          setActiveGroupId(focusedCreative.driveFolderId || null);
                                        }
                                      : undefined
                                  }
                                />
                              ) : null}
                            </div>
                            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">Queue</p>
                                  <p className="mt-1 text-xs text-slate-500">Use this when you want one hero preview with quick switching.</p>
                                </div>
                                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200">
                                  {focusQueueCreatives.length}
                                </span>
                              </div>
                              <div className="space-y-2">
                                {focusQueueCreatives.map((creative) => (
                                  <button
                                    key={creative.id}
                                    onClick={() => setFocusedId(creative.id)}
                                    className={cn(
                                      'w-full rounded-[18px] border px-3 py-3 text-left transition-all',
                                      focusedCreative?.id === creative.id
                                        ? 'border-sky-200 bg-sky-50/90 text-slate-950 shadow-[0_10px_22px_rgba(14,165,233,0.08)]'
                                        : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
                                    )}
                                  >
                                    <p className="break-words text-sm font-semibold leading-5">
                                      {creative.clickupTaskName}
                                    </p>
                                    <p className={cn('mt-1 break-words text-xs leading-5', focusedCreative?.id === creative.id ? 'text-slate-600' : 'text-slate-500')}>
                                      {creative.creativeName}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                            This view is no longer part of the main workflow.
                          </div>
                        )}
                        </div>

                        {detailsDrawerOpen ? (
                          <>
                            <motion.button
                              type="button"
                              aria-label="Close creative details"
                              onClick={() => setDetailsDrawerOpen(false)}
                              className="fixed inset-0 z-40 bg-slate-950/18 backdrop-blur-[1px]"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            />
                            <motion.aside
                              initial={{ opacity: 0, x: 24 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 24 }}
                              transition={{ duration: 0.2 }}
                              className={cn(
                                'fixed right-3 top-[96px] z-50 flex h-[calc(100vh-112px)] w-[min(92vw,440px)] flex-col overflow-hidden rounded-[24px] shadow-[0_28px_70px_rgba(15,23,42,0.2)] lg:right-4 lg:top-[96px] lg:h-[calc(100vh-112px)]',
                                studioTheme === 'dark'
                                  ? 'border border-slate-800 bg-[#08111f]'
                                  : 'border border-slate-200 bg-white',
                              )}
                            >
                              <div className="border-b border-slate-200 px-4 py-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      Creative details
                                    </p>
                                    <p className="mt-1 text-sm text-slate-500">
                                      Preview, ClickUp context, and AI payload for the focused asset.
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => setDetailsDrawerOpen(false)}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                                  >
                                    Close
                                  </button>
                                </div>

                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  {workbenchTabs.map((tab) => {
                                    const Icon = tab.icon;
                                    const active = workbenchTab === tab.id;
                                    return (
                                      <button
                                        key={tab.id}
                                        onClick={() => setWorkbenchTab(tab.id)}
                                        className={cn(
                                          'inline-flex items-center justify-center gap-2 rounded-[14px] border px-3 py-2 text-sm font-semibold transition-all',
                                          active
                                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                                        )}
                                      >
                                        <Icon className="h-4 w-4" />
                                        {tab.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                                {workbenchTab === 'inspect' ? (
                                  <AssetInspector
                                    creative={focusedCreative}
                                    onPreview={(creative) => setPreviewCreative(creative)}
                                  />
                                ) : workbenchTab === 'task' ? (
                                  <TaskDataPanel
                                    creative={focusedCreative}
                                    selectedCreatives={launchScopeCreatives}
                                  />
                                ) : workbenchTab === 'schedule' ? (
                                  <CreativeDetailsPanel creative={focusedCreative} />
                                ) : (
                                  <SelectionAiContextPanel
                                    creative={focusedCreative}
                                    selectedCreatives={launchScopeCreatives}
                                    aiAnalysis={aiAnalysis}
                                    winningAds={winningAds}
                                  />
                                )}
                              </div>
                            </motion.aside>
                          </>
                        ) : null}
                      </div>
                    </section>
                  </div>
                </>
              ) : (
              <div className="space-y-4 p-4 pb-10">
                <CreativeLaunchStudioPlanningWorkspace
                  storeId={resolvedStoreId || ''}
                  profile={profile}
                  selectedCreatives={launchScopeCreatives}
                  launchConfig={preparedLaunchConfig}
                  theme={studioTheme}
                  plannerVariant={plannerVariant}
                  diagnostics={diagnostics}
                  aiAnalysis={aiAnalysis}
                  winningAds={winningAds}
                  existingCampaignOptions={existingCampaignOptions}
                  batches={effectiveBatches}
                  batchSize={batchSize}
                  activeStrategy={effectiveStrategy}
                  healthState={healthState}
                  reviewDisabled={reviewDisabled}
                  reviewHint={reviewHint}
                  creativeLookup={creativeLookup}
                  setBatchSize={setBatchSize}
                  updateLaunchConfig={updateLaunchConfig}
                  onRefreshHealthCheck={() => {
                    void runLaunchHealthCheck();
                  }}
                  onRefreshAiDraft={() => {
                    if (resolvedStoreId && productId) {
                      void fetchAiAnalysis(resolvedStoreId, productId);
                    }
                  }}
                  onReviewLaunch={handleLaunch}
                  onApplyStrategy={handleApplyStrategy}
                  onApplyAiLaunchAction={handleApplyAiLaunchAction}
                  onApplyRecommendedStrategy={() =>
                    handleApplyStrategy(
                      diagnostics.recommendedStrategy,
                      diagnostics.recommendedSize,
                    )
                  }
                  onClearBatches={clearBatches}
                  onPlannerVariantChange={setPlannerVariant}
                  plannerMode={activeStep === 'batch' ? 'batch' : 'schedule'}
                />
              </div>
              )}
            </div>
          </div>

        </motion.div>

        <AnimatePresence>
          {previewCreative && (
            <PreviewModal
              creative={previewCreative}
              onClose={() => setPreviewCreative(null)}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  , document.body);
}
