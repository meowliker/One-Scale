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
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-700 bg-gray-900 px-6 py-3 shadow-lg">
      <div className="mx-auto flex max-w-screen-2xl items-center justify-between">
        <span className="text-sm font-medium text-white">
          {selectedCount} selected
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={onPause}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <Pause className="h-4 w-4" />
            Pause Selected
          </button>
          <button
            onClick={onEnable}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <Play className="h-4 w-4" />
            Enable Selected
          </button>
          <button
            onClick={onClearSelection}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
