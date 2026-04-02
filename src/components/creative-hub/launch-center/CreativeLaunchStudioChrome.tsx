import { useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Eye,
  FolderTree,
  LayoutGrid,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxCreative } from '@/types/creativeHub';

export type LaunchWorkspaceStep = 'select' | 'batch' | 'schedule';
export type BrowserMode = 'all_assets' | 'by_task' | 'by_folder';
export type SelectionViewMode = 'table' | 'grid' | 'list' | 'focus' | 'compact' | 'board';

function normalizeSelectionViewMode(viewMode?: SelectionViewMode): SelectionViewMode {
  if (viewMode === 'grid' || viewMode === 'list' || viewMode === 'focus' || viewMode === 'table') {
    return viewMode;
  }
  if (viewMode === 'board') {
    return 'list';
  }
  return 'table';
}

export function StepNavigator({
  activeStep,
  setActiveStep,
  selectedCount,
  laneCount,
  reviewReady,
}: {
  activeStep: LaunchWorkspaceStep;
  setActiveStep: (value: LaunchWorkspaceStep) => void;
  selectedCount: number;
  laneCount: number;
  reviewReady: boolean;
}) {
  const steps: Array<{
    id: LaunchWorkspaceStep;
    label: string;
    helper: string;
    badge: string;
  }> = [
    { id: 'select', label: '1. Select', helper: 'Pick creatives', badge: `${selectedCount} chosen` },
    { id: 'batch', label: '2. Batch', helper: 'Build lanes', badge: `${laneCount} lane${laneCount === 1 ? '' : 's'}` },
    { id: 'schedule', label: '3. Schedule + Launch', helper: 'Campaign path, checks, and launch', badge: reviewReady ? 'Ready' : 'Needs review' },
  ];

  return (
    <div className="mt-4 grid gap-2 xl:grid-cols-3">
      {steps.map((step) => (
        <button
          key={step.id}
          onClick={() => setActiveStep(step.id)}
          className={cn(
            'rounded-[22px] border px-4 py-3 text-left transition-all',
            activeStep === step.id
              ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_32px_rgba(15,23,42,0.16)]'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{step.label}</p>
              <p className={cn('mt-1 text-xs', activeStep === step.id ? 'text-slate-300' : 'text-slate-500')}>
                {step.helper}
              </p>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                activeStep === step.id ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-600',
              )}
            >
              {step.badge}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

export function CompactSelectionRail({
  browserMode,
  currentGroup,
  selectedCreatives,
  totalAssets,
  onReturnToSelect,
}: {
  browserMode: BrowserMode;
  currentGroup: { label: string } | null;
  selectedCreatives: InboxCreative[];
  totalAssets: number;
  onReturnToSelect: () => void;
}) {
  const folderCount = new Set(
    selectedCreatives
      .map((creative) => creative.driveFolderId || creative.driveParentFolderName)
      .filter(Boolean),
  ).size;

  return (
    <div className="border-r border-slate-800/80 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_32%),linear-gradient(180deg,#08111f_0%,#0b1424_44%,#0c1628_100%)] lg:sticky lg:top-[112px] lg:max-h-[calc(100vh-112px)] lg:overflow-y-auto">
      <div className="space-y-4 px-4 py-4 pb-8">
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(12,20,36,0.98)_100%)] p-4 shadow-[0_22px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-100/70">Selection snapshot</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,16,31,0.98)_0%,rgba(13,21,39,0.98)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Selected</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">{selectedCreatives.length}</p>
              <p className="mt-1 text-[11px] text-slate-500">Creatives in launch set</p>
            </div>
            <div className="rounded-[20px] border border-white/8 bg-[linear-gradient(180deg,rgba(8,16,31,0.98)_0%,rgba(13,21,39,0.98)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Folders</p>
              <p className="mt-2 text-xl font-semibold tracking-[-0.02em] text-white">{folderCount}</p>
              <p className="mt-1 text-[11px] text-slate-500">Distinct source groups</p>
            </div>
          </div>
          <div className="mt-3 rounded-[20px] border border-sky-400/12 bg-[linear-gradient(180deg,rgba(8,16,31,0.95)_0%,rgba(10,22,40,0.98)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Current view</p>
            <p className="mt-2 text-sm font-semibold tracking-[0.01em] text-white">
              {browserMode === 'all_assets' ? 'All assets' : browserMode === 'by_task' ? 'By task' : 'By folder'}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {currentGroup?.label || `${totalAssets} total assets`}
            </p>
          </div>
          <button
            onClick={onReturnToSelect}
            className="mt-3 w-full rounded-[18px] bg-[linear-gradient(180deg,rgba(56,189,248,1)_0%,rgba(2,132,199,1)_100%)] px-3 py-3 text-sm font-semibold text-white shadow-[0_16px_30px_rgba(14,165,233,0.24),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:brightness-[1.03]"
          >
            Edit creative selection
          </button>
        </div>

        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94)_0%,rgba(12,20,36,0.98)_100%)] p-4 shadow-[0_22px_44px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-100/70">Chosen creatives</p>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200">
              {selectedCreatives.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {selectedCreatives.length === 0 ? (
              <p className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-3 text-xs leading-5 text-slate-400">
                Pick creatives first, then batching and scheduling take the screen while this rail stays compact.
              </p>
            ) : (
              selectedCreatives.slice(0, 8).map((creative) => (
                <div
                  key={creative.id}
                  className="rounded-[18px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_100%)] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                >
                  <p className="truncate text-sm font-semibold tracking-[0.01em] text-white">{creative.creativeName}</p>
                  <p className="mt-1 truncate text-xs leading-5 text-slate-400">
                    {creative.driveParentFolderName || creative.clickupTaskName}
                  </p>
                </div>
              ))
            )}
            {selectedCreatives.length > 8 && (
              <p className="text-xs font-medium text-slate-400">+{selectedCreatives.length - 8} more selected</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SelectionViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: SelectionViewMode;
  setViewMode: (value: SelectionViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const views: Array<{ id: SelectionViewMode; label: string; icon: typeof LayoutGrid; helper: string }> = [
    { id: 'table', label: 'List view', icon: BarChart3, helper: 'Rows with columns' },
    { id: 'list', label: 'Column Browser', icon: FolderTree, helper: 'Task -> folder -> assets' },
    { id: 'grid', label: 'Gallery', icon: LayoutGrid, helper: 'Compact thumbnails' },
    { id: 'focus', label: 'Focus', icon: Eye, helper: 'Single asset deep review' },
  ];
  const activeView = views.find((view) => view.id === normalizeSelectionViewMode(viewMode)) || views[0];
  const ActiveIcon = activeView.icon;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full min-w-[185px] items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-white"
      >
        <span className="flex items-center gap-2">
          <ActiveIcon className="h-4 w-4 text-sky-600" />
          <span>{activeView.label}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
          {views.map((view) => {
            const Icon = view.icon;
            const active = activeView.id === view.id;
            return (
              <button
                key={`selection-view-${view.id}`}
                type="button"
                onClick={() => {
                  setViewMode(view.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0',
                  active ? 'bg-sky-50' : 'hover:bg-slate-50',
                )}
              >
                <span className={cn('mt-0.5 rounded-xl p-2', active ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500')}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{view.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{view.helper}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
