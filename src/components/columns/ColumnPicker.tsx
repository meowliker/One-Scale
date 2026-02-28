'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, GripVertical, Save, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/SearchInput';
import { useColumnPresetStore } from '@/stores/columnPresetStore';
import { allMetrics, metricsByCategory, defaultColumnPresets } from '@/data/metricDefinitions';
import { SavePresetDialog } from '@/components/columns/SavePresetDialog';
import type { MetricKey, MetricCategory, MetricDefinition } from '@/types/metrics';

export interface ColumnPickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const categoryTabs: { key: MetricCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'performance', label: 'Performance' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'financial', label: 'Financial' },
  { key: 'video', label: 'Video' },
  { key: 'quality', label: 'Quality' },
];

/* ─── Sortable column item ─── */
function SortableColumnItem({
  metric,
  isChecked,
  onToggle,
}: {
  metric: MetricDefinition;
  isChecked: boolean;
  onToggle: (key: MetricKey) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.key, disabled: !isChecked });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 border-b border-[rgba(0,0,0,0.04)] transition-colors duration-150',
        isChecked ? 'bg-[#eff6ff]' : 'bg-transparent hover:bg-[#f5f5f7]',
        isDragging && 'opacity-50 shadow-lg z-50 bg-[#dbeafe]'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(metric.key)}
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-all duration-150',
          isChecked
            ? 'border-[#0071e3] bg-[#0071e3]'
            : 'border-[#c7c7cc] bg-white hover:border-[#8e8e93]'
        )}
      >
        {isChecked && (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2.5 6L5 8.5L9.5 4"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Name + Description */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#1d1d1f] leading-tight truncate">
          {metric.label}
        </div>
        <div className="text-[11px] text-[#8e8e93] leading-tight mt-0.5 truncate">
          {metric.description}
        </div>
      </div>

      {/* Drag Handle — only for checked items */}
      {isChecked && (
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab rounded p-1 text-[#c7c7cc] hover:text-[#8e8e93] hover:bg-[rgba(0,0,0,0.04)] active:cursor-grabbing transition-colors"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ─── Main Drawer ─── */
export function ColumnPicker({ isOpen, onClose }: ColumnPickerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<MetricCategory | 'all'>('all');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const {
    visibleColumns,
    columnOrder,
    activePresetId,
    addColumn,
    removeColumn,
    reorderColumns,
    setPreset,
  } = useColumnPresetStore();

  // Reset search when opening
  useEffect(() => {
    if (isOpen) setSearch('');
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Count selected per category
  const selectedCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const cat of categoryTabs) {
      if (cat.key === 'all') {
        counts.all = visibleColumns.length;
      } else {
        const catMetrics = metricsByCategory[cat.key] ?? [];
        counts[cat.key] = catMetrics.filter((m) => visibleColumns.includes(m.key)).length;
      }
    }
    return counts;
  }, [visibleColumns]);

  // Filter metrics by tab + search
  const displayedMetrics = useMemo(() => {
    const query = search.toLowerCase().trim();
    let metrics: MetricDefinition[];

    if (activeTab === 'all') {
      metrics = allMetrics;
    } else {
      metrics = metricsByCategory[activeTab] ?? [];
    }

    if (query) {
      metrics = metrics.filter(
        (m) =>
          m.label.toLowerCase().includes(query) ||
          m.shortLabel.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      );
    }

    // Sort: checked items first, preserving their column order
    const checked = metrics.filter((m) => visibleColumns.includes(m.key));
    const unchecked = metrics.filter((m) => !visibleColumns.includes(m.key));
    // Sort checked by their position in columnOrder
    checked.sort(
      (a, b) => columnOrder.indexOf(a.key) - columnOrder.indexOf(b.key)
    );

    return [...checked, ...unchecked];
  }, [search, activeTab, visibleColumns, columnOrder]);

  const handleToggle = useCallback(
    (key: MetricKey) => {
      if (visibleColumns.includes(key)) {
        removeColumn(key);
      } else {
        addColumn(key);
      }
    },
    [visibleColumns, addColumn, removeColumn]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = columnOrder.indexOf(active.id as MetricKey);
      const newIndex = columnOrder.indexOf(over.id as MetricKey);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(columnOrder, oldIndex, newIndex);
      reorderColumns(newOrder);
    },
    [columnOrder, reorderColumns]
  );

  const handleResetToDefault = useCallback(() => {
    setPreset('performance');
  }, [setPreset]);

  // Sortable IDs = only checked items (so unchecked items are not draggable)
  const sortableIds = useMemo(
    () => displayedMetrics.filter((m) => visibleColumns.includes(m.key)).map((m) => m.key),
    [displayedMetrics, visibleColumns]
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/20"
              onClick={onClose}
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: 380 }}
              animate={{ x: 0 }}
              exit={{ x: 380 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="fixed right-0 top-0 z-50 flex h-full w-[380px] flex-col border-l border-[rgba(0,0,0,0.08)] bg-white shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,0.06)]">
                <h2 className="text-[15px] font-semibold text-[#1d1d1f]">Customise Columns</h2>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[#8e8e93] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Search — sticky */}
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search columns..."
                />
              </div>

              {/* Category Tabs */}
              <div className="flex gap-1 overflow-x-auto px-4 py-2.5 border-b border-[rgba(0,0,0,0.06)] scrollbar-hide">
                {categoryTabs.map((tab) => {
                  const count = selectedCountByCategory[tab.key] ?? 0;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-all duration-150',
                        isActive
                          ? 'bg-[#1d1d1f] text-white shadow-sm'
                          : 'text-[#6e6e73] hover:bg-[#f5f5f7] hover:text-[#1d1d1f]'
                      )}
                    >
                      {tab.label}
                      {count > 0 && (
                        <span
                          className={cn(
                            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold',
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-[#0071e3]/10 text-[#0071e3]'
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Column List */}
              <div className="flex-1 overflow-y-auto">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={sortableIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {displayedMetrics.length > 0 ? (
                      displayedMetrics.map((metric) => (
                        <SortableColumnItem
                          key={metric.key}
                          metric={metric}
                          isChecked={visibleColumns.includes(metric.key)}
                          onToggle={handleToggle}
                        />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <p className="text-sm text-[#8e8e93]">No columns match your search.</p>
                      </div>
                    )}
                  </SortableContext>
                </DndContext>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-[rgba(0,0,0,0.06)] px-5 py-3.5">
                <button
                  onClick={handleResetToDefault}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#8e8e93] hover:text-[#1d1d1f] transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset to default
                </button>
                <button
                  onClick={() => setSaveDialogOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#0071e3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0077ED] transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save as Preset
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <SavePresetDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
      />
    </>
  );
}
