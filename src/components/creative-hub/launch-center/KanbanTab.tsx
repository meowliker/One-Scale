'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  GripVertical,
  X,
  Image as ImageIcon,
  Film,
  Images,
  Layers,
  Rocket,
  Loader2,
  Shuffle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import { LaunchConfigPanel } from './LaunchConfigPanel';
import type { InboxCreative, CreativeFormat, CreativeBatch } from '@/types/creativeHub';

// ── Format helpers ──

const FORMAT_ICON: Record<CreativeFormat, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  carousel: Images,
};

function formatCurrency(value?: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

// ── Kanban Card (draggable) ──

function KanbanCard({ creative }: { creative: InboxCreative }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: creative.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const FormatIcon = FORMAT_ICON[creative.creativeFormat] ?? ImageIcon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm cursor-grab active:cursor-grabbing"
    >
      <div {...listeners} className="flex-shrink-0 touch-none">
        <GripVertical size={14} className="text-gray-400" />
      </div>
      {creative.thumbnailUrl ? (
        <img
          src={creative.thumbnailUrl}
          alt={creative.creativeName}
          className="w-8 h-8 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <FormatIcon size={14} className="text-gray-400" />
        </div>
      )}
      <span className="text-xs truncate flex-1 text-gray-900 dark:text-white">
        {creative.creativeName}
      </span>
    </div>
  );
}

// ── Static Card (for DragOverlay) ──

function StaticCard({ creative }: { creative: InboxCreative }) {
  const FormatIcon = FORMAT_ICON[creative.creativeFormat] ?? ImageIcon;

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-gray-900 border-2 border-blue-500 shadow-lg cursor-grabbing w-[200px]">
      <GripVertical size={14} className="text-gray-400 flex-shrink-0" />
      {creative.thumbnailUrl ? (
        <img
          src={creative.thumbnailUrl}
          alt={creative.creativeName}
          className="w-8 h-8 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <FormatIcon size={14} className="text-gray-400" />
        </div>
      )}
      <span className="text-xs truncate flex-1 text-gray-900 dark:text-white">
        {creative.creativeName}
      </span>
    </div>
  );
}

// ── Kanban Lane (droppable) ──

function KanbanLane({
  id,
  title,
  creatives,
  onRemove,
}: {
  id: string;
  title: string;
  creatives: InboxCreative[];
  onRemove?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[200px] max-w-[240px] flex-shrink-0 rounded-xl border p-3 transition-colors',
        isOver
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50',
      )}
    >
      {/* Lane header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
          {title}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
            {creatives.length}
          </span>
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Sortable cards */}
      <SortableContext
        items={creatives.map((c) => c.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2 min-h-[100px]">
          {creatives.map((c) => (
            <KanbanCard key={c.id} creative={c} />
          ))}
        </div>
      </SortableContext>

      {creatives.length === 0 && (
        <div className="flex items-center justify-center h-[80px] text-xs text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          Drop here
        </div>
      )}
    </div>
  );
}

// ── Main KanbanTab ──

export function KanbanTab() {
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const profiles = useCreativeHubStore((s) => s.profiles);
  const batches = useCreativeHubStore((s) => s.batches);
  const creativesPerBatch = useCreativeHubStore((s) => s.creativesPerBatch);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((s) => s.updateLaunchConfig);
  const executeLaunch = useCreativeHubStore((s) => s.executeLaunch);
  const createBatch = useCreativeHubStore((s) => s.createBatch);
  const removeBatch = useCreativeHubStore((s) => s.removeBatch);
  const addCreativeToBatch = useCreativeHubStore((s) => s.addCreativeToBatch);
  const removeCreativeFromBatch = useCreativeHubStore((s) => s.removeCreativeFromBatch);
  const moveCreativeBetweenBatches = useCreativeHubStore((s) => s.moveCreativeBetweenBatches);
  const autoBatch = useCreativeHubStore((s) => s.autoBatch);
  const clearBatches = useCreativeHubStore((s) => s.clearBatches);
  const { activeStoreId } = useStoreStore();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchFlowWindow, setLaunchFlowWindow] = useState<'closed' | 'config' | 'overview'>(
    'closed',
  );

  // Ready creatives
  const readyCreatives = useMemo(
    () => inboxCreatives.filter((c) => c.uploadStatus === 'ready' || c.driveUrl || c.clickupAttachmentUrl),
    [inboxCreatives],
  );

  // Map for quick lookups
  const creativesMap = useMemo(() => {
    const map = new Map<string, InboxCreative>();
    readyCreatives.forEach((c) => map.set(c.id, c));
    return map;
  }, [readyCreatives]);

  // IDs already in batches
  const batchedIds = useMemo(
    () => new Set(batches.flatMap((b) => b.creativeIds)),
    [batches],
  );

  // "Ready" pool = creatives not in any batch
  const readyPoolCreatives = useMemo(
    () => readyCreatives.filter((c) => !batchedIds.has(c.id)),
    [readyCreatives, batchedIds],
  );

  // Total ads across all batches
  const totalAds = useMemo(
    () => batches.reduce((sum, b) => sum + b.creativeIds.length, 0),
    [batches],
  );
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === launchConfig.productProfileId),
    [launchConfig.productProfileId, profiles],
  );
  const selectedCampaignSummary = useMemo(
    () =>
      selectedProfile?.campaignLinks?.find(
        (campaign) => campaign.campaignId === launchConfig.existingCampaignId,
      ),
    [launchConfig.existingCampaignId, selectedProfile],
  );
  const selectedAdsetCount = useMemo(
    () =>
      Object.values(launchConfig.existingAdsetAssignments || {}).filter(
        (assignedIds) => Array.isArray(assignedIds) && assignedIds.length > 0,
      ).length,
    [launchConfig.existingAdsetAssignments],
  );
  const effectiveStructure = launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';
  const effectiveDailyBudget = launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 0;
  const effectiveDuration = launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 0;
  const effectiveDurationLabel =
    launchConfig.useTestDuration === false
      ? 'No fixed duration'
      : `${effectiveDuration} day${effectiveDuration !== 1 ? 's' : ''}`;
  const launchStatus = launchConfig.launchStatus ?? 'ACTIVE';
  const launchTimingLabel =
    launchConfig.launchTime === 'scheduled'
      ? `${launchConfig.scheduledDate || 'Select date'} ${launchConfig.scheduledTime || '09:00'}`
      : 'Immediately';
  const isScheduledLaunch = launchConfig.launchTime === 'scheduled';
  const campaignSummaryLabel =
    launchConfig.campaignMode === 'new'
      ? launchConfig.newCampaignName || 'New campaign (name pending)'
      : selectedCampaignSummary?.campaignName ||
        launchConfig.existingCampaignId ||
        'Existing campaign not selected';

  // Active dragging creative
  const activeCreative = activeId ? creativesMap.get(activeId) : null;

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // Find which container (lane) a creative belongs to
  const findContainer = useCallback(
    (id: string): string | null => {
      // Check ready pool
      if (readyPoolCreatives.some((c) => c.id === id)) return 'ready';
      // Check batches
      for (const batch of batches) {
        if (batch.creativeIds.includes(id)) return batch.id;
      }
      // Could be the container id itself
      if (id === 'ready') return 'ready';
      if (batches.some((b) => b.id === id)) return id;
      return null;
    },
    [readyPoolCreatives, batches],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // Visual feedback is handled by useDroppable isOver state
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const activeItemId = active.id as string;
      const overId = over.id as string;

      // Determine source and destination containers
      const sourceContainer = findContainer(activeItemId);

      // Determine destination: if overId is a creative, find its container
      let destContainer = findContainer(overId);
      // If overId is itself a container
      if (overId === 'ready' || batches.some((b) => b.id === overId)) {
        destContainer = overId;
      }

      if (!sourceContainer || !destContainer) return;
      if (sourceContainer === destContainer) return; // same lane, no-op for now

      // Move from ready pool to a batch
      if (sourceContainer === 'ready' && destContainer !== 'ready') {
        addCreativeToBatch(destContainer, activeItemId);
        return;
      }

      // Move from batch to ready pool (remove from batch)
      if (sourceContainer !== 'ready' && destContainer === 'ready') {
        removeCreativeFromBatch(sourceContainer, activeItemId);
        return;
      }

      // Move between batches
      if (sourceContainer !== 'ready' && destContainer !== 'ready') {
        moveCreativeBetweenBatches(sourceContainer, destContainer, activeItemId);
        return;
      }
    },
    [findContainer, batches, addCreativeToBatch, removeCreativeFromBatch, moveCreativeBetweenBatches],
  );

  // Add a new empty lane
  const handleAddLane = useCallback(() => {
    createBatch(`Ad Set ${batches.length + 1}`, []);
  }, [batches.length, createBatch]);

  // Remove lane => creatives go back to ready pool
  const handleRemoveLane = useCallback(
    (batchId: string) => {
      removeBatch(batchId);
    },
    [removeBatch],
  );

  // Auto-fill: distribute ready pool evenly across existing lanes
  const handleAutoFill = useCallback(() => {
    if (batches.length === 0 || readyPoolCreatives.length === 0) return;
    // Distribute round-robin
    readyPoolCreatives.forEach((c, i) => {
      const targetBatch = batches[i % batches.length];
      addCreativeToBatch(targetBatch.id, c.id);
    });
  }, [batches, readyPoolCreatives, addCreativeToBatch]);

  // Quick auto-batch: create lanes and distribute
  const handleQuickAutoBatch = useCallback(() => {
    clearBatches();
    const allIds = readyCreatives.map((c) => c.id);
    useCreativeHubStore.setState({ selectedCreativeIds: new Set(allIds) });
    autoBatch('sequential', creativesPerBatch);
    useCreativeHubStore.setState({ selectedCreativeIds: new Set() });
  }, [readyCreatives, clearBatches, autoBatch, creativesPerBatch]);

  const handleLaunch = useCallback(async () => {
    if (batches.length === 0 || !activeStoreId) return;
    setLaunching(true);
    try {
      updateLaunchConfig({ batches });
      await executeLaunch(activeStoreId);
      setLaunchFlowWindow('closed');
    } finally {
      setLaunching(false);
    }
  }, [activeStoreId, batches, executeLaunch, updateLaunchConfig]);

  return (
    <div className="flex flex-col gap-6">
      {/* Kanban Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-min">
            {/* Ready Pool Lane */}
            <KanbanLane
              id="ready"
              title={`Ready (${readyPoolCreatives.length})`}
              creatives={readyPoolCreatives}
            />

            {/* Batch Lanes */}
            {batches.map((batch) => {
              const batchCreatives = batch.creativeIds
                .map((id) => creativesMap.get(id))
                .filter(Boolean) as InboxCreative[];

              return (
                <KanbanLane
                  key={batch.id}
                  id={batch.id}
                  title={`${batch.name} (${batchCreatives.length})`}
                  creatives={batchCreatives}
                  onRemove={() => handleRemoveLane(batch.id)}
                />
              );
            })}

            {/* Add Lane Button */}
            <button
              onClick={handleAddLane}
              className="min-w-[200px] max-w-[240px] flex-shrink-0 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 p-3 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors min-h-[200px]"
            >
              <Plus size={24} />
              <span className="text-sm font-medium">Add Ad Set</span>
            </button>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeCreative ? <StaticCard creative={activeCreative} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Bottom Controls */}
      <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          onClick={handleAutoFill}
          disabled={readyPoolCreatives.length === 0 || batches.length === 0}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            readyPoolCreatives.length > 0 && batches.length > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed',
          )}
        >
          <Layers size={16} />
          Auto-Fill {creativesPerBatch}/lane
        </button>

        <button
          onClick={handleQuickAutoBatch}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <Shuffle size={16} />
          Auto-Batch All ({creativesPerBatch}/set)
        </button>

        {batches.length > 0 && (
          <button
            onClick={clearBatches}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
          >
            <X size={14} />
            Clear All
          </button>
        )}
      </div>

      {batches.length > 0 && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            Launch Config
          </p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p>
              {batches.length} ad set{batches.length !== 1 ? 's' : ''} • {totalAds} ad
              {totalAds !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLaunchFlowWindow('config')}
            className="mt-4 inline-flex w-full items-center justify-center rounded-[18px] bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Configure launch
          </button>
        </section>
      )}

      {launchFlowWindow === 'config' && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Launch Config
                </p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">
                  Configure campaign, ad sets, and launch details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('closed')}
                className="rounded-full border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#111a2f] p-5">
              <div className="dark">
                <LaunchConfigPanel
                  batches={batches}
                  productProfileId={launchConfig.productProfileId}
                  showOverviewButton
                  onOverviewLaunch={() => setLaunchFlowWindow('overview')}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {launchFlowWindow === 'overview' && (
        <div
          className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-700 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                Overview Launch
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">
                Review all launch settings before publishing
              </h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#111a2f] p-5">
              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Campaign Plan</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Product Profile" value={selectedProfile?.productName || 'Not selected'} />
                  <OverviewMeta
                    label="Campaign Mode"
                    value={launchConfig.campaignMode === 'new' ? 'Create New Campaign' : 'Use Existing Campaign'}
                  />
                  <OverviewMeta label="Campaign" value={campaignSummaryLabel} />
                  <OverviewMeta
                    label="Ad Set Mode"
                    value={
                      launchConfig.adsetMode === 'existing_adsets'
                        ? `Use Existing Ad Sets (${selectedAdsetCount} selected)`
                        : 'Create New Ad Sets'
                    }
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Budget + Timing</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Structure" value={effectiveStructure} />
                  <OverviewMeta label="Launch As" value={launchStatus} />
                  <OverviewMeta label="Launch Timing" value={launchTimingLabel} />
                  <OverviewMeta
                    label={effectiveStructure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}
                    value={`${formatCurrency(effectiveDailyBudget)} / day`}
                  />
                  <OverviewMeta label="Duration" value={effectiveDurationLabel} />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assets</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Ad Sets" value={`${batches.length}`} />
                  <OverviewMeta label="Ads" value={`${totalAds}`} />
                </div>
              </section>

              {!activeStoreId && (
                <p className="text-xs text-amber-700">
                  Select an active store before launching from this tab.
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('config')}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Back to config
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={launching || batches.length === 0 || !activeStoreId}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                  launching || batches.length === 0 || !activeStoreId
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {launching
                  ? isScheduledLaunch
                    ? 'Scheduling...'
                    : 'Launching...'
                  : `${isScheduledLaunch ? 'Schedule' : 'Launch'} ${batches.length} ad set${batches.length !== 1 ? 's' : ''} -> ${totalAds} ad${totalAds !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
