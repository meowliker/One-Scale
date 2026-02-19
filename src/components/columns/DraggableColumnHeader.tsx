'use client';

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
  if (!active) return <ArrowUpDown className="h-3 w-3 text-text-dimmed opacity-0 group-hover/sort:opacity-50 transition-opacity" />;
  return direction === 'asc'
    ? <ArrowUp className="h-3 w-3 text-primary" />
    : <ArrowDown className="h-3 w-3 text-primary" />;
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

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={cn(
        'whitespace-nowrap px-3 py-3 text-right text-xs font-medium uppercase tracking-wider text-text-muted select-none',
        isDragging && 'z-50 bg-primary/10 opacity-80 shadow-lg rounded'
      )}
    >
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={() => onSort?.(metricKey)}
          className="group/sort flex items-center gap-1 cursor-pointer hover:text-text transition-colors"
          title={`Sort by ${label}`}
        >
          <span>{label}</span>
          <SortIndicator active={sortKey === metricKey} direction={sortKey === metricKey ? (sortDirection ?? null) : null} />
        </button>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-text-dimmed hover:text-text-muted transition-colors"
          title={`Drag to reorder ${label}`}
        >
          <GripVertical className="h-3 w-3" />
        </button>
      </div>
    </th>
  );
}
