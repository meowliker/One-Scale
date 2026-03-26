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
  Shuffle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { LaunchConfigPanel } from './LaunchConfigPanel';
import type { InboxCreative, CreativeFormat, CreativeBatch } from '@/types/creativeHub';

// ── Format helpers ──

const FORMAT_ICON: Record<CreativeFormat, typeof ImageIcon> = {
  image: ImageIcon,
  video: Film,
  carousel: Images,
};

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
  const batches = useCreativeHubStore((s) => s.batches);
  const creativesPerBatch = useCreativeHubStore((s) => s.creativesPerBatch);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const createBatch = useCreativeHubStore((s) => s.createBatch);
  const removeBatch = useCreativeHubStore((s) => s.removeBatch);
  const addCreativeToBatch = useCreativeHubStore((s) => s.addCreativeToBatch);
  const removeCreativeFromBatch = useCreativeHubStore((s) => s.removeCreativeFromBatch);
  const moveCreativeBetweenBatches = useCreativeHubStore((s) => s.moveCreativeBetweenBatches);
  const autoBatch = useCreativeHubStore((s) => s.autoBatch);
  const clearBatches = useCreativeHubStore((s) => s.clearBatches);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Ready creatives
  const readyCreatives = useMemo(
    () => inboxCreatives.filter((c) => c.uploadStatus === 'ready' || c.driveUrl),
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
      let overId = over.id as string;

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

      {/* Launch Config */}
      {batches.length > 0 && (
        <LaunchConfigPanel
          batches={batches}
          productProfileId={launchConfig.productProfileId}
        />
      )}

      {/* Launch Button */}
      {batches.length > 0 && totalAds > 0 && (
        <button className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 transition-all">
          <Rocket size={18} />
          Launch {batches.length} Ad Set{batches.length !== 1 ? 's' : ''} &rarr; {totalAds} Ad{totalAds !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
