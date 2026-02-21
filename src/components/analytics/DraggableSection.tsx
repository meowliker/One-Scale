'use client';

import { type ReactNode, type DragEvent, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DraggableSectionProps {
  id: string;
  children: ReactNode;
  isEditMode: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
}

export function DraggableSection({
  id,
  children,
  isEditMode,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: DraggableSectionProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  if (!isEditMode) {
    return <div>{children}</div>;
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
    onDragOver(e, id);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    onDrop(e, id);
  };

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    onDragStart(e, id);
  };

  const handleDragEnd = () => {
    setIsDragOver(false);
    onDragEnd();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDragEnd={handleDragEnd}
      className={cn(
        'group relative rounded-lg border-2 border-dashed transition-all duration-200',
        isDragOver
          ? 'border-blue-500 bg-blue-500/5'
          : 'border-transparent hover:border-gray-300',
        'cursor-grab active:cursor-grabbing'
      )}
    >
      {/* Drop indicator line */}
      {isDragOver && (
        <div className="absolute -top-[2px] left-0 right-0 z-10 h-[3px] rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
      )}

      {/* Drag handle */}
      <div className="absolute -left-1 top-1/2 z-10 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center justify-center rounded-md bg-surface-elevated border border-border p-1.5 text-text-muted shadow-md">
          <GripVertical className="h-4 w-4" />
        </div>
      </div>

      <div className="pl-2">{children}</div>
    </div>
  );
}
