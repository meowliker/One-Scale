'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ArrowUp, ArrowDown, BarChart2 } from 'lucide-react';
import type { MetricKey } from '@/types/metrics';
import { getMetricDefinition } from '@/data/metricDefinitions';
import { cn } from '@/lib/utils';
import { ColumnPresetSelector } from './ColumnPresetSelector';

export interface DraggableColumnHeaderProps {
  metricKey: MetricKey;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (key: string) => void;
}

function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' | null }) {
  if (!active) return null;
  return direction === 'asc'
    ? <ArrowUp className="h-2.5 w-2.5 text-primary animate-fade-in" />
    : <ArrowDown className="h-2.5 w-2.5 text-primary animate-fade-in" />;
}

export function DraggableColumnHeader({ metricKey, sortKey, sortDirection, onSort }: DraggableColumnHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metricKey });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const def = getMetricDefinition(metricKey);
  const label = def?.shortLabel ?? metricKey;
  const fullLabel = def?.label ?? label;
  const description = def?.description ?? '';

  const [columnWidth, setColumnWidth] = useState<number | undefined>(undefined);
  const [isResizing, setIsResizing] = useState(false);
  const [showPreset, setShowPreset] = useState(false);
  const [presetPos, setPresetPos] = useState<{ top: number; right: number } | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const thRef = useRef<HTMLTableCellElement | null>(null);
  const presetRef = useRef<HTMLDivElement | null>(null);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = thRef.current?.offsetWidth || 120;

    const handleMouseMove = (moveE: MouseEvent) => {
      const diff = moveE.clientX - startXRef.current;
      const newWidth = Math.max(60, startWidthRef.current + diff);
      setColumnWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleHeaderClick = useCallback((e: React.MouseEvent) => {
    // Don't open preset if clicking drag handle or resize handle
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
    if (!thRef.current) return;
    const rect = thRef.current.getBoundingClientRect();
    setPresetPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
    setShowPreset((prev) => !prev);
  }, []);

  // Close preset dropdown on outside click
  useEffect(() => {
    if (!showPreset) return;
    const handleClick = (e: MouseEvent) => {
      if (
        presetRef.current &&
        !presetRef.current.contains(e.target as Node) &&
        thRef.current &&
        !thRef.current.contains(e.target as Node)
      ) {
        setShowPreset(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showPreset]);

  // Close on Escape key
  useEffect(() => {
    if (!showPreset) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPreset(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [showPreset]);

  const tooltipText = description ? `${fullLabel} — ${description}` : fullLabel;

  return (
    <>
      <th
        ref={(node) => { setNodeRef(node); thRef.current = node; }}
        style={{ ...style, ...(columnWidth ? { width: columnWidth, minWidth: columnWidth } : {}) }}
        className={cn(
          'relative whitespace-nowrap px-3 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-text-secondary select-none transition-colors duration-150 hover:text-text-primary cursor-pointer',
          isDragging && 'z-50 bg-[#e8f0fe] opacity-90 shadow-md rounded-lg',
          showPreset && 'text-[#0071e3]'
        )}
        title={tooltipText}
        onClick={handleHeaderClick}
      >
        <div className="flex items-center justify-end gap-1.5">
          <SortIndicator active={sortKey === metricKey} direction={sortKey === metricKey ? (sortDirection ?? null) : null} />
          <BarChart2 className="h-3.5 w-3.5" />
          <button
            data-drag-handle
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="cursor-grab active:cursor-grabbing text-[#aeaeb2] hover:text-[#86868b] transition-colors duration-150"
            title={`Drag to reorder ${label}`}
          >
            <GripVertical className="h-2.5 w-2.5" />
          </button>
        </div>
        {/* Column resize handle */}
        <div
          className={cn('col-resize-handle', isResizing && 'active')}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
        />
      </th>

      {/* Preset dropdown portal */}
      {showPreset && presetPos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={presetRef}
            style={{
              position: 'fixed',
              top: presetPos.top,
              right: presetPos.right,
              zIndex: 9999,
            }}
            className="bg-white dark:bg-[var(--color-surface)] border border-[#e5e7eb] dark:border-[var(--color-border)] rounded-xl shadow-xl p-3 min-w-[220px] max-h-[60vh] overflow-y-auto"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#86868b] px-1">
              Column Presets
            </p>
            <ColumnPresetSelector />
          </div>,
          document.body
        )
      }
    </>
  );
}
