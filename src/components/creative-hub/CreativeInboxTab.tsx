'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Upload,
  ChevronDown,
  ChevronRight,
  Rocket,
  Filter,
  AlertTriangle,
  Link2Off,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { InboxCreativeRow } from './InboxCreativeRow';
import { CreativePreviewModal } from './CreativePreviewModal';
import { UploadProgressBar } from './UploadProgressBar';
import type { InboxCreative } from '@/types/creativeHub';

interface CreativeInboxTabProps {
  storeId: string;
}

export function CreativeInboxTab({ storeId }: CreativeInboxTabProps) {
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const inboxLoading = useCreativeHubStore((s) => s.inboxLoading);
  const inboxNotConnected = useCreativeHubStore((s) => s.inboxNotConnected);
  const inboxNotConfigured = useCreativeHubStore((s) => s.inboxNotConfigured);
  const inboxError = useCreativeHubStore((s) => s.inboxError);
  const selectedCreativeIds = useCreativeHubStore((s) => s.selectedCreativeIds);
  const syncInbox = useCreativeHubStore((s) => s.syncInbox);
  const toggleCreativeSelection = useCreativeHubStore((s) => s.toggleCreativeSelection);
  const selectAllCreatives = useCreativeHubStore((s) => s.selectAllCreatives);
  const deselectAllCreatives = useCreativeHubStore((s) => s.deselectAllCreatives);
  const startUpload = useCreativeHubStore((s) => s.startUpload);
  const openLaunchWizard = useCreativeHubStore((s) => s.openLaunchWizard);

  // Local UI state
  const [syncing, setSyncing] = useState(false);
  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Filters
  const [productFilter, setProductFilter] = useState<string>('all');
  const [formatFilter, setFormatFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Sync handler
  const handleSync = useCallback(async () => {
    setSyncing(true);
    await syncInbox(storeId);
    setSyncing(false);
  }, [syncInbox, storeId]);

  // Filtered creatives
  const filteredCreatives = useMemo(() => {
    return inboxCreatives.filter((c) => {
      if (productFilter !== 'all' && c.productProfileId !== productFilter) return false;
      if (formatFilter !== 'all' && c.creativeFormat !== formatFilter) return false;
      if (statusFilter !== 'all' && c.uploadStatus !== statusFilter) return false;
      return true;
    });
  }, [inboxCreatives, productFilter, formatFilter, statusFilter]);

  // Group by product
  const groupedCreatives = useMemo(() => {
    const groups: Record<string, { productName: string; creatives: InboxCreative[] }> = {};
    for (const creative of filteredCreatives) {
      const key = creative.productProfileId || 'unassigned';
      if (!groups[key]) {
        groups[key] = {
          productName: creative.productName || 'Unassigned',
          creatives: [],
        };
      }
      groups[key].creatives.push(creative);
    }
    return groups;
  }, [filteredCreatives]);

  // Stats
  const selectedCount = selectedCreativeIds.size;
  const uploadingCount = inboxCreatives.filter((c) => c.uploadStatus === 'uploading').length;
  const readyCount = inboxCreatives.filter((c) => c.uploadStatus === 'ready').length;
  const readySelectedCount = inboxCreatives.filter(
    (c) => selectedCreativeIds.has(c.id) && c.uploadStatus === 'ready'
  ).length;

  // Overall upload progress
  const overallProgress = useMemo(() => {
    const uploading = inboxCreatives.filter(
      (c) => c.uploadStatus === 'uploading' || c.uploadStatus === 'ready'
    );
    if (uploading.length === 0) return 0;
    const total = uploading.reduce((sum, c) => sum + c.uploadProgress, 0);
    return total / uploading.length;
  }, [inboxCreatives]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Unique product names for filter
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of inboxCreatives) {
      if (c.productProfileId && c.productName) {
        seen.set(c.productProfileId, c.productName);
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [inboxCreatives]);

  // Handle retry upload
  const handleRetry = useCallback(
    (creativeId: string) => {
      startUpload(creativeId, storeId);
    },
    [startUpload, storeId]
  );

  // ClickUp not connected state
  if (!inboxLoading && inboxNotConnected) {
    return (
      <div className="space-y-4">
        <InboxHeader syncing={syncing} onSync={handleSync} />
        <div className="rounded-xl border border-border bg-surface-elevated p-16 text-center">
          <Link2Off className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-text-secondary">
            ClickUp Not Connected
          </p>
          <p className="mt-1 text-xs text-text-dimmed max-w-md mx-auto">
            Connect your ClickUp account in Settings &gt; Integrations to import creatives.
          </p>
        </div>
      </div>
    );
  }

  // No ClickUp lists configured on product profiles
  if (!inboxLoading && inboxNotConfigured) {
    return (
      <div className="space-y-4">
        <InboxHeader syncing={syncing} onSync={handleSync} />
        <div className="rounded-xl border border-border bg-surface-elevated p-16 text-center">
          <Settings className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-text-secondary">
            ClickUp Lists Not Configured
          </p>
          <p className="mt-1 text-xs text-text-dimmed max-w-md mx-auto">
            Add a ClickUp List ID to your product profiles so the inbox knows where to pull creatives from.
          </p>
        </div>
      </div>
    );
  }

  // API error state
  if (!inboxLoading && inboxError && inboxCreatives.length === 0) {
    return (
      <div className="space-y-4">
        <InboxHeader syncing={syncing} onSync={handleSync} />
        <div className="rounded-xl border border-red-200 bg-red-50 p-16 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-4 text-sm font-medium text-red-700">
            Failed to load creatives
          </p>
          <p className="mt-1 text-xs text-red-500 max-w-md mx-auto">
            {inboxError}
          </p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state (connected + configured, but no "Ready to Launch" tasks found)
  if (!inboxLoading && inboxCreatives.length === 0) {
    return (
      <div className="space-y-4">
        <InboxHeader syncing={syncing} onSync={handleSync} />
        <div className="rounded-xl border border-border bg-surface-elevated p-16 text-center">
          <Upload className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-4 text-sm font-medium text-text-secondary">
            No creatives found
          </p>
          <p className="mt-1 text-xs text-text-dimmed max-w-md mx-auto">
            No tasks with &quot;Ready to Launch&quot; status were found in your ClickUp lists.
            Move creatives to that status in ClickUp, then sync again.
          </p>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            Sync Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <InboxHeader syncing={syncing} onSync={handleSync} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-text-dimmed" />

        {/* Product filter */}
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Products</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* Format filter */}
        <select
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Formats</option>
          <option value="video">Video</option>
          <option value="image">Image</option>
          <option value="carousel">Carousel</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-sm text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="uploading">Uploading</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>

        {/* Bulk select */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={selectAllCreatives}
            className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllCreatives}
            className="rounded-md px-2 py-1 text-xs font-medium text-text-dimmed hover:bg-surface-hover transition-colors"
          >
            Deselect All
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {inboxLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border bg-surface-elevated"
            />
          ))}
        </div>
      )}

      {/* Grouped creative list */}
      {!inboxLoading && (
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {Object.entries(groupedCreatives).map(([groupKey, group]) => {
              const isCollapsed = collapsedGroups.has(groupKey);
              return (
                <motion.div
                  key={groupKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="mb-2 flex w-full items-center gap-2 text-left"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-text-dimmed" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-dimmed" />
                    )}
                    <h3 className="text-sm font-semibold text-text-primary">
                      {group.productName}
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {group.creatives.length}
                    </span>
                  </button>

                  {/* Creative rows */}
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-2 overflow-hidden"
                      >
                        {group.creatives.map((creative) => (
                          <InboxCreativeRow
                            key={creative.id}
                            creative={creative}
                            isSelected={selectedCreativeIds.has(creative.id)}
                            onToggleSelect={() => toggleCreativeSelection(creative.id)}
                            onPreview={() => setPreviewCreative(creative)}
                            onRetry={() => handleRetry(creative.id)}
                            onSkip={() => toggleCreativeSelection(creative.id)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* No results after filtering */}
          {filteredCreatives.length === 0 && !inboxLoading && inboxCreatives.length > 0 && (
            <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
              <Filter className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm text-text-secondary">
                No creatives match the current filters.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface-elevated px-6 py-3 shadow-lg">
        <div className="mx-auto flex max-w-screen-2xl items-center gap-6">
          {/* Left: stats */}
          <div className="flex items-center gap-4 text-xs text-text-secondary">
            <span>
              Selected:{' '}
              <span className="font-semibold text-text-primary">
                {selectedCount}
              </span>{' '}
              of {filteredCreatives.length}
            </span>
            <span className="h-3 w-px bg-border" />
            <span>
              Uploading:{' '}
              <span className="font-semibold text-blue-600">{uploadingCount}</span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span>
              Ready:{' '}
              <span className="font-semibold text-emerald-600">{readyCount}</span>
            </span>
          </div>

          {/* Center: overall progress */}
          <div className="flex-1 max-w-xs mx-auto">
            {uploadingCount > 0 && (
              <UploadProgressBar
                progress={overallProgress}
                status="uploading"
                showLabel
              />
            )}
          </div>

          {/* Right: launch button */}
          <button
            onClick={openLaunchWizard}
            disabled={readySelectedCount === 0}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all',
              readySelectedCount > 0
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            <Rocket className="h-4 w-4" />
            Launch Selected ({readySelectedCount})
          </button>
        </div>
      </div>

      {/* Preview modal */}
      <CreativePreviewModal
        creative={previewCreative}
        isOpen={previewCreative !== null}
        onClose={() => setPreviewCreative(null)}
      />
    </div>
  );
}

/* ── Extracted sub-component ── */

function InboxHeader({
  syncing,
  onSync,
}: {
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Creative Inbox</h2>
        <p className="text-sm text-text-secondary mt-0.5">
          Import and prepare creatives for testing
        </p>
      </div>
      <button
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
      >
        <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
        Sync Now
      </button>
    </div>
  );
}
