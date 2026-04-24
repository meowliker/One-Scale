'use client';

import { useState, useMemo, useCallback } from 'react';
import { Package, Shuffle, Layers, ChevronDown, ChevronUp, Rocket, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import { CreativeGrid } from './CreativeGrid';
import { BatchList } from './BatchList';
import { LaunchConfigPanel } from './LaunchConfigPanel';
import type { BatchStrategy } from '@/types/creativeHub';

function formatCurrency(value?: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  return `$${Number(value).toFixed(2)}`;
}

export function GridBuilderTab() {
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const profiles = useCreativeHubStore((s) => s.profiles);
  const selectedCreativeIds = useCreativeHubStore((s) => s.selectedCreativeIds);
  const batches = useCreativeHubStore((s) => s.batches);
  const creativesPerBatch = useCreativeHubStore((s) => s.creativesPerBatch);
  const toggleCreativeSelection = useCreativeHubStore((s) => s.toggleCreativeSelection);
  const setSelectedCreativeIds = useCreativeHubStore((s) => s.setSelectedCreativeIds);
  const deselectAllCreatives = useCreativeHubStore((s) => s.deselectAllCreatives);
  const createBatch = useCreativeHubStore((s) => s.createBatch);
  const removeBatch = useCreativeHubStore((s) => s.removeBatch);
  const removeCreativeFromBatch = useCreativeHubStore((s) => s.removeCreativeFromBatch);
  const autoBatch = useCreativeHubStore((s) => s.autoBatch);
  const clearBatches = useCreativeHubStore((s) => s.clearBatches);
  const executeLaunch = useCreativeHubStore((s) => s.executeLaunch);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((s) => s.updateLaunchConfig);
  const { activeStoreId } = useStoreStore();

  const [autoBatchOpen, setAutoBatchOpen] = useState(false);
  const [showCreativePool, setShowCreativePool] = useState(true);
  const [showBatches, setShowBatches] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [launchFlowWindow, setLaunchFlowWindow] = useState<'closed' | 'config' | 'overview'>(
    'closed',
  );

  // Filter to ready creatives only
  const readyCreatives = useMemo(
    () => inboxCreatives.filter((c) => c.uploadStatus === 'ready' || c.driveUrl),
    [inboxCreatives],
  );

  // Track which creatives are already in batches
  const batchedIds = useMemo(() => new Set(batches.flatMap((b) => b.creativeIds)), [batches]);

  // Count of selected creatives that are NOT yet batched
  const selectedUnbatchedCount = useMemo(
    () => [...selectedCreativeIds].filter((id) => !batchedIds.has(id)).length,
    [selectedCreativeIds, batchedIds],
  );

  const unbatchedCount = useMemo(
    () => readyCreatives.filter((c) => !batchedIds.has(c.id)).length,
    [readyCreatives, batchedIds],
  );

  const totalAds = useMemo(() => batches.reduce((sum, b) => sum + b.creativeIds.length, 0), [batches]);
  const selectedReadyCount = useMemo(
    () => readyCreatives.filter((creative) => selectedCreativeIds.has(creative.id)).length,
    [readyCreatives, selectedCreativeIds],
  );

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === launchConfig.productProfileId),
    [launchConfig.productProfileId, profiles],
  );
  const selectedCampaignSummary = useMemo(
    () =>
      selectedProfile?.campaignLinks?.find(
        (campaign) => campaign.campaignId === launchConfig.existingCampaignId,
      ),
    [launchConfig.existingCampaignId, selectedProfile],
  );
  const selectedAdsetCount = useMemo(
    () =>
      Object.values(launchConfig.existingAdsetAssignments || {}).filter(
        (assignedIds) => Array.isArray(assignedIds) && assignedIds.length > 0,
      ).length,
    [launchConfig.existingAdsetAssignments],
  );
  const effectiveStructure = launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';
  const effectiveDailyBudget = launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 0;
  const effectiveDuration = launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 0;
  const launchStatus = launchConfig.launchStatus ?? selectedProfile?.defaultLaunchStatus ?? 'PAUSED';
  const launchTimingLabel =
    launchConfig.launchTime === 'scheduled'
      ? `${launchConfig.scheduledDate || 'Select date'} ${launchConfig.scheduledTime || '09:00'}`
      : 'Immediately';
  const isScheduledLaunch = launchConfig.launchTime === 'scheduled';
  const campaignSummaryLabel =
    launchConfig.campaignMode === 'new'
      ? launchConfig.newCampaignName || 'New campaign (name pending)'
      : selectedCampaignSummary?.campaignName ||
        launchConfig.existingCampaignId ||
        'Existing campaign not selected';

  const handleSelectAllReady = useCallback(() => {
    setSelectedCreativeIds(readyCreatives.map((creative) => creative.id));
  }, [readyCreatives, setSelectedCreativeIds]);

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

  const handleLaunch = useCallback(async () => {
    if (batches.length === 0 || !activeStoreId) return;
    setLaunching(true);
    try {
      updateLaunchConfig({ batches });
      await executeLaunch(activeStoreId);
      setLaunchFlowWindow('closed');
    } finally {
      setLaunching(false);
    }
  }, [activeStoreId, batches, executeLaunch, updateLaunchConfig]);

  return (
    <div className="flex flex-col gap-6">
      {/* Creative Grid */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Creative Pool</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {selectedReadyCount} of {readyCreatives.length} ready creatives selected
            </p>
          </div>
          <button
            onClick={() => setShowCreativePool((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {showCreativePool ? (
              <>
                <ChevronUp size={14} />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Expand
              </>
            )}
          </button>
        </div>
        {showCreativePool ? (
          <CreativeGrid
            creatives={readyCreatives}
            selectedIds={selectedCreativeIds}
            onToggle={toggleCreativeSelection}
            onSelectAll={handleSelectAllReady}
            onClearAll={deselectAllCreatives}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Creative pool is collapsed. Expand it to pick or review creatives.
          </div>
        )}

        {/* Unbatched indicator */}
        {batchedIds.size > 0 && showCreativePool && (
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
            'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            selectedUnbatchedCount > 0
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500',
          )}
        >
          <Package size={16} />
          Create Batch{selectedUnbatchedCount > 0 && ` (${selectedUnbatchedCount})`}
        </button>

        {/* Auto-Batch Dropdown */}
        <div className="relative">
          <button
            onClick={() => setAutoBatchOpen(!autoBatchOpen)}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <Layers size={16} />
            Auto-Batch All
            <ChevronDown size={14} className={cn('transition-transform', autoBatchOpen && 'rotate-180')} />
          </button>

          {autoBatchOpen && (
            <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={() => handleAutoBatch('sequential')}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50 first:rounded-t-lg"
              >
                <span className="font-medium">Sequential</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{creativesPerBatch} per ad set, in order</span>
              </button>
              <button
                onClick={() => handleAutoBatch('by_format')}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50"
              >
                <span className="font-medium">By Format</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">Group videos, images, carousels</span>
              </button>
              <button
                onClick={() => handleAutoBatch('shuffle')}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50 last:rounded-b-lg"
              >
                <span className="flex items-center gap-1 font-medium">
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
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
          >
            <Trash2 size={14} />
            Clear All
          </button>
        )}
      </div>

      {/* Batch List */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <Layers size={16} className="text-gray-500 dark:text-gray-400" />
            Batches ({batches.length} ad sets)
          </h3>
          <button
            type="button"
            onClick={() => setShowBatches((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {showBatches ? (
              <>
                <ChevronUp size={14} />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                Expand
              </>
            )}
          </button>
        </div>
        {showBatches ? (
          <BatchList
            batches={batches}
            creatives={readyCreatives}
            onRemoveBatch={removeBatch}
            onRemoveCreative={removeCreativeFromBatch}
          />
        ) : null}
      </div>

      {batches.length > 0 && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.45)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Launch Config</p>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <p>
              {batches.length} ad set{batches.length !== 1 ? 's' : ''} • {totalAds} ad
              {totalAds !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLaunchFlowWindow('config')}
            className="mt-4 inline-flex w-full items-center justify-center rounded-[18px] bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Configure launch
          </button>
        </section>
      )}

      {launchFlowWindow === 'config' && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Launch Config</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">
                  Configure campaign, ad sets, and launch details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('closed')}
                className="rounded-full border border-slate-600 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              >
                Close
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#111a2f] p-5">
              <div className="dark">
                <LaunchConfigPanel
                  batches={batches}
                  productProfileId={launchConfig.productProfileId}
                  showOverviewButton
                  onOverviewLaunch={() => setLaunchFlowWindow('overview')}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {launchFlowWindow === 'overview' && (
        <div
          className="fixed inset-0 z-[91] flex items-center justify-center bg-slate-950/70 p-4"
          onClick={() => setLaunchFlowWindow('closed')}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-slate-700 bg-[#111a2f] text-slate-100 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-slate-700 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Overview Launch</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">
                Review all launch settings before publishing
              </h3>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#111a2f] p-5">
              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Campaign Plan</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Product Profile" value={selectedProfile?.productName || 'Not selected'} />
                  <OverviewMeta
                    label="Campaign Mode"
                    value={launchConfig.campaignMode === 'new' ? 'Create New Campaign' : 'Use Existing Campaign'}
                  />
                  <OverviewMeta label="Campaign" value={campaignSummaryLabel} />
                  <OverviewMeta
                    label="Ad Set Mode"
                    value={
                      launchConfig.adsetMode === 'existing_adsets'
                        ? `Use Existing Ad Sets (${selectedAdsetCount} selected)`
                        : 'Create New Ad Sets'
                    }
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Budget + Timing</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Structure" value={effectiveStructure} />
                  <OverviewMeta label="Launch As" value={launchStatus} />
                  <OverviewMeta label="Launch Timing" value={launchTimingLabel} />
                  <OverviewMeta
                    label={effectiveStructure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}
                    value={`${formatCurrency(effectiveDailyBudget)} / day`}
                  />
                  <OverviewMeta
                    label="Duration"
                    value={`${effectiveDuration} day${effectiveDuration !== 1 ? 's' : ''}`}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Assets</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <OverviewMeta label="Ad Sets" value={`${batches.length}`} />
                  <OverviewMeta label="Ads" value={`${totalAds}`} />
                </div>
              </section>

              {!activeStoreId && (
                <p className="text-xs text-amber-700">
                  Select an active store before launching from this tab.
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-700 px-5 py-4">
              <button
                type="button"
                onClick={() => setLaunchFlowWindow('config')}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Back to config
              </button>
              <button
                type="button"
                onClick={handleLaunch}
                disabled={launching || batches.length === 0 || !activeStoreId}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition',
                  launching || batches.length === 0 || !activeStoreId
                    ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                    : 'bg-blue-600 text-white hover:bg-blue-700',
                )}
              >
                {launching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {launching
                  ? isScheduledLaunch
                    ? 'Scheduling...'
                    : 'Launching...'
                  : `${isScheduledLaunch ? 'Schedule' : 'Launch'} ${batches.length} ad set${batches.length !== 1 ? 's' : ''} -> ${totalAds} ad${totalAds !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
