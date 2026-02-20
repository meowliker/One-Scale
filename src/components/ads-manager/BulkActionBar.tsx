'use client';

import { Pause, Play, X } from 'lucide-react';

export interface BulkActionBarProps {
  selectedCount: number;
  onPause: () => void;
  onEnable: () => void;
  onClearSelection: () => void;
}

export function BulkActionBar({
  selectedCount,
  onPause,
  onEnable,
  onClearSelection,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 glass-futuristic rounded-2xl px-6 py-3 shadow-[0_8px_40px_rgba(124,92,252,0.12)] border border-primary/10 animate-slide-up">
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold text-text-primary">
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold mr-2">{selectedCount}</span>
          selected
        </span>
        <div className="h-5 w-px bg-border/50" />
        <div className="flex items-center gap-2">
          <button
            onClick={onPause}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200/50 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-2 text-sm font-medium text-amber-700 hover:shadow-md hover:shadow-amber-100/50 transition-all duration-200"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
          <button
            onClick={onEnable}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200/50 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:shadow-md hover:shadow-emerald-100/50 transition-all duration-200"
          >
            <Play className="h-3.5 w-3.5" />
            Enable
          </button>
          <button
            onClick={onClearSelection}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
