'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { X, GripVertical, RotateCcw, Trash2, Check, Plus, Pencil } from 'lucide-react';
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
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const {
    visibleColumns,
    columnOrder,
    activePresetId,
    customPresets,
    addColumn,
    removeColumn,
    reorderColumns,
    setPreset,
    setColumnsWithoutPreset,
    deletePreset,
  } = useColumnPresetStore();

  // Pending state - changes are only applied when user clicks OK
  const [pendingColumns, setPendingColumns] = useState<MetricKey[]>(visibleColumns);
  const [pendingOrder, setPendingOrder] = useState<MetricKey[]>(columnOrder);
  const [pendingPresetId, setPendingPresetId] = useState<string | null>(activePresetId);
  
  // Store columns before preset selection so we can restore them on deselect
  const [columnsBeforePreset, setColumnsBeforePreset] = useState<MetricKey[] | null>(null);
  const [orderBeforePreset, setOrderBeforePreset] = useState<MetricKey[] | null>(null);

  // All presets (default + custom)
  const allPresets = useMemo(() => [...defaultColumnPresets, ...customPresets], [customPresets]);

  // Reset pending state when opening
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setPendingColumns(visibleColumns);
      setPendingOrder(columnOrder);
      setPendingPresetId(activePresetId);
      setColumnsBeforePreset(null);
      setOrderBeforePreset(null);
    }
  }, [isOpen, visibleColumns, columnOrder, activePresetId]);

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

  // Filter metrics by search only (no category tabs)
  const displayedMetrics = useMemo(() => {
    const query = search.toLowerCase().trim();
    let metrics: MetricDefinition[] = allMetrics;

    if (query) {
      metrics = metrics.filter(
        (m) =>
          m.label.toLowerCase().includes(query) ||
          m.shortLabel.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      );
    }

    // Sort: checked items first, preserving their column order
    const checked = metrics.filter((m) => pendingColumns.includes(m.key));
    const unchecked = metrics.filter((m) => !pendingColumns.includes(m.key));
    // Sort checked by their position in pendingOrder
    checked.sort(
      (a, b) => pendingOrder.indexOf(a.key) - pendingOrder.indexOf(b.key)
    );

    return [...checked, ...unchecked];
  }, [search, pendingColumns, pendingOrder]);

  // Toggle column in pending state
  const handleToggle = useCallback(
    (key: MetricKey) => {
      if (pendingColumns.includes(key)) {
        setPendingColumns(pendingColumns.filter((c) => c !== key));
        setPendingOrder(pendingOrder.filter((c) => c !== key));
      } else {
        setPendingColumns([...pendingColumns, key]);
        setPendingOrder([...pendingOrder, key]);
      }
      setPendingPresetId(null); // Clear preset when manually changing columns
    },
    [pendingColumns, pendingOrder]
  );

  // Drag end in pending state
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = pendingOrder.indexOf(active.id as MetricKey);
      const newIndex = pendingOrder.indexOf(over.id as MetricKey);

      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(pendingOrder, oldIndex, newIndex);
      setPendingOrder(newOrder);
      setPendingColumns(newOrder);
      setPendingPresetId(null); // Clear preset when reordering
    },
    [pendingOrder]
  );

  // Select/toggle a preset (updates pending state)
  const handlePresetSelect = useCallback((presetId: string) => {
    // Toggle behavior: clicking active preset deactivates it
    if (pendingPresetId === presetId) {
      // Deactivate preset - restore previously selected columns
      if (columnsBeforePreset && orderBeforePreset) {
        setPendingColumns(columnsBeforePreset);
        setPendingOrder(orderBeforePreset);
      }
      setPendingPresetId(null);
      setColumnsBeforePreset(null);
      setOrderBeforePreset(null);
    } else {
      // Save current columns before activating preset (only if not already in a preset)
      if (!pendingPresetId) {
        setColumnsBeforePreset(pendingColumns);
        setOrderBeforePreset(pendingOrder);
      }
      // Activate preset
      const preset = allPresets.find((p) => p.id === presetId);
      if (preset) {
        setPendingColumns(preset.columns);
        setPendingOrder(preset.columns);
        setPendingPresetId(presetId);
      }
    }
  }, [allPresets, pendingPresetId, pendingColumns, pendingOrder, columnsBeforePreset, orderBeforePreset]);

  // Reset to default preset
  const handleResetToDefault = useCallback(() => {
    handlePresetSelect('performance');
  }, [handlePresetSelect]);

  // Apply changes (OK button)
  const handleApply = useCallback(() => {
    if (pendingPresetId) {
      // Apply a preset
      setPreset(pendingPresetId);
    } else {
      // No preset selected - apply all columns or custom selection
      setColumnsWithoutPreset(pendingOrder);
    }
    onClose();
  }, [pendingOrder, pendingPresetId, setPreset, setColumnsWithoutPreset, onClose]);

  // Cancel changes
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  // Sortable IDs = only checked items (use pending state)
  const sortableIds = useMemo(
    () => displayedMetrics.filter((m) => pendingColumns.includes(m.key)).map((m) => m.key),
    [displayedMetrics, pendingColumns]
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
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSaveDialogOpen(true)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#0071e3] hover:text-[#0077ED] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Save Preset
                  </button>
                  <button
                    onClick={onClose}
                    className="rounded-lg p-1.5 text-[#8e8e93] hover:bg-[#f5f5f7] hover:text-[#1d1d1f] transition-colors"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>

              {/* Presets */}
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <div className="flex flex-wrap gap-1.5">
                  {allPresets.map((preset) => {
                    const isActive = pendingPresetId === preset.id;
                    const isCustom = preset.isCustom;
                    return (
                      <div key={preset.id} className="group/preset relative">
                        <button
                          onClick={() => handlePresetSelect(preset.id)}
                          className={cn(
                            'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-150',
                            isActive
                              ? 'bg-[#0071e3] text-white shadow-sm'
                              : 'bg-[#f5f5f7] text-[#6e6e73] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
                          )}
                        >
                          {preset.name}
                        </button>
                        {isCustom && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePreset(preset.id);
                            }}
                            className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 group-hover/preset:opacity-100 hover:bg-red-600 transition-all"
                            title="Delete preset"
                          >
                            <X className="h-2 w-2" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Search */}
              <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.06)]">
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search columns..."
                />
              </div>

              {/* Select All / Deselect All */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(0,0,0,0.06)]">
                <span className="text-[12px] text-[#8e8e93]">
                  {pendingColumns.length} of {allMetrics.length} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const allKeys = allMetrics.map((m) => m.key);
                      setPendingColumns(allKeys);
                      setPendingOrder(allKeys);
                      setPendingPresetId(null);
                    }}
                    className="text-[12px] font-medium text-[#0071e3] hover:text-[#0077ED] transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-[#e5e7eb]">|</span>
                  <button
                    onClick={() => {
                      setPendingColumns([]);
                      setPendingOrder([]);
                      setPendingPresetId(null);
                    }}
                    className="text-[12px] font-medium text-[#0071e3] hover:text-[#0077ED] transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
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
                          isChecked={pendingColumns.includes(metric.key)}
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
                  Reset
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCancel}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-4 py-2 text-[13px] font-medium text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={handleApply}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#0071e3] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#0077ED] transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                    OK
                  </button>
                </div>
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
