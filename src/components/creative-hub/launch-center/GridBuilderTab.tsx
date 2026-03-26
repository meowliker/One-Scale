'use client';

import { useState, useMemo, useCallback } from 'react';
import { Package, Shuffle, Layers, ChevronDown, Rocket, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { CreativeGrid } from './CreativeGrid';
import { BatchList } from './BatchList';
import { LaunchConfigPanel } from './LaunchConfigPanel';
import type { BatchStrategy } from '@/types/creativeHub';

export function GridBuilderTab() {
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const selectedCreativeIds = useCreativeHubStore((s) => s.selectedCreativeIds);
  const batches = useCreativeHubStore((s) => s.batches);
  const creativesPerBatch = useCreativeHubStore((s) => s.creativesPerBatch);
  const toggleCreativeSelection = useCreativeHubStore((s) => s.toggleCreativeSelection);
  const selectAllCreatives = useCreativeHubStore((s) => s.selectAllCreatives);
  const deselectAllCreatives = useCreativeHubStore((s) => s.deselectAllCreatives);
  const createBatch = useCreativeHubStore((s) => s.createBatch);
  const removeBatch = useCreativeHubStore((s) => s.removeBatch);
  const removeCreativeFromBatch = useCreativeHubStore((s) => s.removeCreativeFromBatch);
  const autoBatch = useCreativeHubStore((s) => s.autoBatch);
  const clearBatches = useCreativeHubStore((s) => s.clearBatches);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);

  const [autoBatchOpen, setAutoBatchOpen] = useState(false);

  // Filter to ready creatives only
  const readyCreatives = useMemo(
    () => inboxCreatives.filter((c) => c.uploadStatus === 'ready' || c.driveUrl),
    [inboxCreatives],
  );

  // Track which creatives are already in batches
  const batchedIds = useMemo(
    () => new Set(batches.flatMap((b) => b.creativeIds)),
    [batches],
  );

  // Count of selected creatives that are NOT yet batched
  const selectedUnbatchedCount = useMemo(
    () => [...selectedCreativeIds].filter((id) => !batchedIds.has(id)).length,
    [selectedCreativeIds, batchedIds],
  );

  const unbatchedCount = useMemo(
    () => readyCreatives.filter((c) => !batchedIds.has(c.id)).length,
    [readyCreatives, batchedIds],
  );

  const totalAds = useMemo(
    () => batches.reduce((sum, b) => sum + b.creativeIds.length, 0),
    [batches],
  );

  // Create batch from current selection
  const handleCreateBatch = useCallback(() => {
    const ids = [...selectedCreativeIds].filter((id) => !batchedIds.has(id));
    if (ids.length === 0) return;
    createBatch(`Ad Set ${batches.length + 1}`, ids);
    deselectAllCreatives();
  }, [selectedCreativeIds, batchedIds, batches.length, createBatch, deselectAllCreatives]);

  // Auto-batch strategies
  const handleAutoBatch = useCallback(
    (strategy: BatchStrategy) => {
      // First select all unbatched creatives, then auto-batch
      // autoBatch reads from selectedCreativeIds, so we need all ready IDs selected
      const allReadyIds = readyCreatives.map((c) => c.id);
      // Temporarily set all ready as selected for autoBatch
      const store = useCreativeHubStore.getState();
      // Clear existing batches and select all ready creatives
      clearBatches();
      // Set selectedCreativeIds to all ready
      useCreativeHubStore.setState({ selectedCreativeIds: new Set(allReadyIds) });
      autoBatch(strategy, creativesPerBatch);
      deselectAllCreatives();
      setAutoBatchOpen(false);
    },
    [readyCreatives, clearBatches, autoBatch, creativesPerBatch, deselectAllCreatives],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Creative Grid */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4">
        <CreativeGrid
          creatives={readyCreatives}
          selectedIds={selectedCreativeIds}
          onToggle={toggleCreativeSelection}
          onSelectAll={selectAllCreatives}
          onClearAll={deselectAllCreatives}
        />

        {/* Unbatched indicator */}
        {batchedIds.size > 0 && (
          <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-amber-600 dark:text-amber-400">{unbatchedCount}</span> unassigned
            {' | '}
            <span className="font-medium text-blue-600 dark:text-blue-400">{batchedIds.size}</span> in batches
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Create Batch */}
        <button
          onClick={handleCreateBatch}
          disabled={selectedUnbatchedCount === 0}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
            selectedUnbatchedCount > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed',
          )}
        >
          <Package size={16} />
          Create Batch{selectedUnbatchedCount > 0 && ` (${selectedUnbatchedCount})`}
        </button>

        {/* Auto-Batch Dropdown */}
        <div className="relative">
          <button
            onClick={() => setAutoBatchOpen(!autoBatchOpen)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <Layers size={16} />
            Auto-Batch All
            <ChevronDown size={14} className={cn('transition-transform', autoBatchOpen && 'rotate-180')} />
          </button>

          {autoBatchOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-20">
              <button
                onClick={() => handleAutoBatch('sequential')}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 first:rounded-t-lg"
              >
                <span className="font-medium">Sequential</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{creativesPerBatch} per ad set, in order</span>
              </button>
              <button
                onClick={() => handleAutoBatch('by_format')}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span className="font-medium">By Format</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Group videos, images, carousels</span>
              </button>
              <button
                onClick={() => handleAutoBatch('shuffle')}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 last:rounded-b-lg"
              >
                <span className="font-medium flex items-center gap-1">
                  <Shuffle size={12} /> Shuffle
                </span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Random mix, {creativesPerBatch} per ad set</span>
              </button>
            </div>
          )}
        </div>

        {/* Clear batches */}
        {batches.length > 0 && (
          <button
            onClick={clearBatches}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            Clear All
          </button>
        )}
      </div>

      {/* Batch List */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <Layers size={16} className="text-gray-500 dark:text-gray-400" />
          Batches ({batches.length} ad sets)
        </h3>
        <BatchList
          batches={batches}
          creatives={readyCreatives}
          onRemoveBatch={removeBatch}
          onRemoveCreative={removeCreativeFromBatch}
        />
      </div>

      {/* Launch Config */}
      {batches.length > 0 && (
        <LaunchConfigPanel
          batches={batches}
          productProfileId={launchConfig.productProfileId}
        />
      )}

      {/* Launch Button */}
      {batches.length > 0 && (
        <button
          className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-500/20 transition-all"
        >
          <Rocket size={18} />
          Launch {batches.length} Ad Set{batches.length !== 1 ? 's' : ''} &rarr; {totalAds} Ad{totalAds !== 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
}
