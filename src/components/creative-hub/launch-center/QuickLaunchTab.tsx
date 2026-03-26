'use client';

import { useState, useMemo, useCallback } from 'react';
import { Zap, Rocket, Image, Film, Images, Shuffle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { BatchList } from './BatchList';
import { LaunchConfigPanel } from './LaunchConfigPanel';
import type { BatchStrategy } from '@/types/creativeHub';

interface QuickLaunchTabProps {
  storeId: string;
}

const BATCH_OPTIONS = [
  { value: 1, label: '1 per ad set', desc: 'Fair test - ABO', strategy: 'one_per_adset' as BatchStrategy },
  { value: 3, label: '3 per ad set', desc: 'Batch test', strategy: 'sequential' as BatchStrategy },
  { value: 5, label: '5 per ad set', desc: 'Larger batches', strategy: 'sequential' as BatchStrategy },
  { value: 0, label: 'Custom', desc: '', strategy: 'sequential' as BatchStrategy },
];

export function QuickLaunchTab({ storeId }: QuickLaunchTabProps) {
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const selectedCreativeIds = useCreativeHubStore((s) => s.selectedCreativeIds);
  const batches = useCreativeHubStore((s) => s.batches);
  const autoBatch = useCreativeHubStore((s) => s.autoBatch);
  const removeBatch = useCreativeHubStore((s) => s.removeBatch);
  const removeCreativeFromBatch = useCreativeHubStore((s) => s.removeCreativeFromBatch);
  const executeLaunch = useCreativeHubStore((s) => s.executeLaunch);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((s) => s.updateLaunchConfig);

  const [selectedOption, setSelectedOption] = useState(1); // index into BATCH_OPTIONS
  const [customSize, setCustomSize] = useState(4);
  const [launching, setLaunching] = useState(false);

  // Count selected creatives by format
  const formatCounts = useMemo(() => {
    const counts = { image: 0, video: 0, carousel: 0 };
    for (const creative of inboxCreatives) {
      if (selectedCreativeIds.has(creative.id)) {
        counts[creative.creativeFormat]++;
      }
    }
    return counts;
  }, [inboxCreatives, selectedCreativeIds]);

  const totalSelected = selectedCreativeIds.size;
  const totalAds = useMemo(() => batches.reduce((sum, b) => sum + b.creativeIds.length, 0), [batches]);

  // Selected creatives for BatchList
  const selectedCreatives = useMemo(
    () => inboxCreatives.filter((c) => selectedCreativeIds.has(c.id)),
    [inboxCreatives, selectedCreativeIds]
  );

  const handleAutoBatch = useCallback(() => {
    const opt = BATCH_OPTIONS[selectedOption];
    const size = opt.value === 0 ? customSize : opt.value;
    const strategy = opt.strategy;
    autoBatch(strategy, size);
  }, [selectedOption, customSize, autoBatch]);

  const handleLaunch = useCallback(async () => {
    if (batches.length === 0) return;
    setLaunching(true);
    try {
      // Set batches on the launch config before executing
      updateLaunchConfig({ batches, batchStrategy: BATCH_OPTIONS[selectedOption].strategy });
      await executeLaunch(storeId);
    } finally {
      setLaunching(false);
    }
  }, [batches, executeLaunch, storeId, updateLaunchConfig, selectedOption]);

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header stats */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-5">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {totalSelected} creative{totalSelected !== 1 ? 's' : ''} ready to launch
        </h3>
        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          {formatCounts.image > 0 && (
            <span className="flex items-center gap-1">
              <Image className="w-3.5 h-3.5 text-blue-400" />
              {formatCounts.image} images
            </span>
          )}
          {formatCounts.video > 0 && (
            <span className="flex items-center gap-1">
              <Film className="w-3.5 h-3.5 text-purple-400" />
              {formatCounts.video} videos
            </span>
          )}
          {formatCounts.carousel > 0 && (
            <span className="flex items-center gap-1">
              <Images className="w-3.5 h-3.5 text-green-400" />
              {formatCounts.carousel} carousels
            </span>
          )}
        </div>
      </div>

      {/* Testing structure */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-5">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Testing Structure</h4>
        <div className="flex flex-col gap-2">
          {BATCH_OPTIONS.map((opt, idx) => (
            <label
              key={idx}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all duration-200',
                selectedOption === idx
                  ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <input
                type="radio"
                name="batch-size"
                checked={selectedOption === idx}
                onChange={() => setSelectedOption(idx)}
                className="w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</span>
                {opt.desc && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({opt.desc})</span>
                )}
              </div>
              {opt.value === 0 && selectedOption === idx && (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={customSize}
                  onChange={(e) => setCustomSize(Math.max(1, Number(e.target.value) || 1))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-16 px-2 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              )}
            </label>
          ))}
        </div>

        <button
          onClick={handleAutoBatch}
          disabled={totalSelected === 0}
          className={cn(
            'mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200',
            totalSelected > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          )}
        >
          <Zap className="w-4 h-4" />
          Auto-Batch Now
        </button>
      </div>

      {/* Batches Preview */}
      {batches.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Batches Preview</h4>
            <button
              onClick={() => {
                const store = useCreativeHubStore.getState();
                store.shuffleBatches();
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Shuffle className="w-3 h-3" />
              Shuffle
            </button>
          </div>
          <BatchList
            batches={batches}
            creatives={selectedCreatives}
            onRemoveBatch={removeBatch}
            onRemoveCreative={removeCreativeFromBatch}
          />
        </div>
      )}

      {/* Launch Config */}
      {batches.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-5">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Launch Configuration</h4>
          <LaunchConfigPanel batches={batches} productProfileId={launchConfig.productProfileId} />
        </div>
      )}

      {/* Launch button */}
      {batches.length > 0 && (
        <button
          onClick={handleLaunch}
          disabled={launching || batches.length === 0}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg',
            launching
              ? 'bg-gray-400 dark:bg-gray-600 text-white cursor-wait'
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white hover:shadow-xl'
          )}
        >
          <Rocket className="w-5 h-5" />
          {launching
            ? 'Launching...'
            : `Launch ${totalAds} Creative${totalAds !== 1 ? 's' : ''} → ${batches.length} Ad Set${batches.length !== 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
}
