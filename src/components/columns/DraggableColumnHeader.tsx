'use client';

import { useState, useCallback, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { MetricKey } from '@/types/metrics';
import { getMetricDefinition } from '@/data/metricDefinitions';
import { cn } from '@/lib/utils';

export interface DraggableColumnHeaderProps {
  metricKey: MetricKey;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (key: string) => void;
}

function SortIndicator({ active, direction }: { active: boolean; direction: 'asc' | 'desc' | null }) {
  if (!active) return <ArrowUpDown className="h-2.5 w-2.5 text-text-dimmed/30 opacity-0 group-hover/sort:opacity-100 transition-all duration-200" />;
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

  const [columnWidth, setColumnWidth] = useState<number | undefined>(undefined);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const thRef = useRef<HTMLTableCellElement | null>(null);

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

  return (
    <th
      ref={(node) => { setNodeRef(node); thRef.current = node; }}
      style={{ ...style, ...(columnWidth ? { width: columnWidth, minWidth: columnWidth } : {}) }}
      className={cn(
        'relative whitespace-nowrap px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.04em] text-[#86868b] select-none transition-colors duration-150 hover:text-[#1d1d1f]',
        isDragging && 'z-50 bg-[#e8f0fe] opacity-90 shadow-md rounded-lg'
      )}
    >
      <div className="flex items-center justify-end gap-1.5">
        <button
          onClick={() => onSort?.(metricKey)}
          className="group/sort flex items-center gap-1 cursor-pointer hover:text-[#0071e3] transition-colors duration-150"
          title={`Sort by ${label}`}
        >
          <span className="text-[10px]">{label}</span>
          <SortIndicator active={sortKey === metricKey} direction={sortKey === metricKey ? (sortDirection ?? null) : null} />
        </button>
        <button
          {...attributes}
          {...listeners}
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
  );
}
