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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl px-5 py-2.5 shadow-lg border border-[rgba(0,0,0,0.08)] animate-slide-up">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-[#1d1d1f]">
          <span className="inline-flex items-center justify-center h-5 w-5 rounded-md bg-[#e8f0fe] text-[#0071e3] text-xs font-semibold mr-1.5">{selectedCount}</span>
          selected
        </span>
        <div className="h-4 w-px bg-[rgba(0,0,0,0.08)]" />
        <div className="flex items-center gap-1.5">
          <button
            onClick={onPause}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#fff4e5] px-3 py-1.5 text-sm font-medium text-[#cc7700] hover:bg-[#ffedcc] transition-colors duration-150"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause
          </button>
          <button
            onClick={onEnable}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#e8f7ed] px-3 py-1.5 text-sm font-medium text-[#1b7d36] hover:bg-[#d1f0db] transition-colors duration-150"
          >
            <Play className="h-3.5 w-3.5" />
            Enable
          </button>
          <button
            onClick={onClearSelection}
            className="inline-flex items-center rounded-lg px-2 py-1.5 text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7] transition-colors duration-150"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
