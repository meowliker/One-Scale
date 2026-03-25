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
  Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { InboxCreativeRow } from './InboxCreativeRow';
import { CreativePreviewModal } from './CreativePreviewModal';
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
  const openLaunchWizard = useCreativeHubStore((s) => s.openLaunchWizard);
  const openLaunchWizardForProduct = useCreativeHubStore((s) => s.openLaunchWizardForProduct);

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
      if (statusFilter !== 'all') {
        const hasLink = !!c.driveUrl;
        if (statusFilter === 'ready' && !hasLink) return false;
        if (statusFilter === 'no_link' && hasLink) return false;
      }
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
  const totalCount = inboxCreatives.length;
  const readyCount = inboxCreatives.filter((c) => !!c.driveUrl).length;
  const noLinkCount = inboxCreatives.filter((c) => !c.driveUrl).length;
  const selectedCount = selectedCreativeIds.size;
  const readySelectedCount = inboxCreatives.filter(
    (c) => selectedCreativeIds.has(c.id) && !!c.driveUrl
  ).length;

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

  // Select all creatives for a specific product group
  const selectProductCreatives = useCallback(
    (creatives: InboxCreative[]) => {
      const readyIds = creatives.filter((c) => !!c.driveUrl).map((c) => c.id);
      for (const id of readyIds) {
        if (!selectedCreativeIds.has(id)) {
          toggleCreativeSelection(id);
        }
      }
    },
    [selectedCreativeIds, toggleCreativeSelection]
  );

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
    <div className="space-y-3 pb-24">
      {/* Header */}
      <InboxHeader syncing={syncing} onSync={handleSync} />

      {/* Filter bar + summary */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2">
        <Filter className="h-3.5 w-3.5 text-text-dimmed" />

        {/* Product filter */}
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-primary focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="ready">Ready</option>
          <option value="no_link">No Link</option>
        </select>

        {/* Divider */}
        <span className="h-4 w-px bg-border" />

        {/* Summary stats */}
        <span className="text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">{totalCount}</span> creatives total
          <span className="mx-1.5 text-text-dimmed">&middot;</span>
          <span className="font-semibold text-emerald-600">{readyCount}</span> ready
          {noLinkCount > 0 && (
            <>
              <span className="mx-1.5 text-text-dimmed">&middot;</span>
              <span className="font-semibold text-gray-500">{noLinkCount}</span> no link
            </>
          )}
        </span>

        {/* Bulk select */}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={selectAllCreatives}
            className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={deselectAllCreatives}
            className="rounded px-2 py-1 text-xs font-medium text-text-dimmed hover:bg-surface-hover transition-colors"
          >
            Clear
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
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {Object.entries(groupedCreatives).map(([groupKey, group]) => {
              const isCollapsed = collapsedGroups.has(groupKey);
              const groupReadyCount = group.creatives.filter((c) => !!c.driveUrl).length;
              const groupNoLinkCount = group.creatives.length - groupReadyCount;
              const productInitial = group.productName.charAt(0).toUpperCase();

              return (
                <motion.div
                  key={groupKey}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="rounded-xl border border-border bg-surface-elevated overflow-hidden"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface">
                    <button
                      onClick={() => toggleGroup(groupKey)}
                      className="flex flex-1 items-center gap-3 text-left"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4 text-text-dimmed flex-shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-dimmed flex-shrink-0" />
                      )}

                      {/* Product avatar */}
                      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Package className="h-4 w-4 text-blue-600" />
                      </div>

                      {/* Product name */}
                      <h3 className="text-sm font-semibold text-text-primary truncate">
                        {group.productName}
                      </h3>

                      {/* Badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          {groupReadyCount} ready
                        </span>
                        {groupNoLinkCount > 0 && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                            {groupNoLinkCount} no link
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Launch Ready button for this product */}
                    {groupReadyCount > 0 && (
                      <button
                        onClick={() => selectProductCreatives(group.creatives)}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors shadow-sm"
                      >
                        <Rocket className="h-3 w-3" />
                        Launch Ready
                      </button>
                    )}
                  </div>

                  {/* Creative rows */}
                  <AnimatePresence>
                    {!isCollapsed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="space-y-1 px-3 pb-3 pt-1">
                          {group.creatives.map((creative) => (
                            <InboxCreativeRow
                              key={creative.id}
                              creative={creative}
                              isSelected={selectedCreativeIds.has(creative.id)}
                              onToggleSelect={() => toggleCreativeSelection(creative.id)}
                              onPreview={() => setPreviewCreative(creative)}
                            />
                          ))}
                        </div>
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
              Ready:{' '}
              <span className="font-semibold text-emerald-600">{readyCount}</span>
            </span>
            {noLinkCount > 0 && (
              <>
                <span className="h-3 w-px bg-border" />
                <span>
                  No Link:{' '}
                  <span className="font-semibold text-gray-500">{noLinkCount}</span>
                </span>
              </>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right: launch button */}
          <button
            onClick={() => {
              // Detect product from selected creatives — skip product selection if all belong to one product
              const selectedCreativesList = inboxCreatives.filter((c) => selectedCreativeIds.has(c.id) && c.driveUrl);
              const productIds = new Set(selectedCreativesList.map((c) => c.productProfileId).filter(Boolean));
              if (productIds.size === 1) {
                const productProfileId = [...productIds][0]!;
                openLaunchWizardForProduct(productProfileId, selectedCreativesList.map((c) => c.id));
              } else {
                openLaunchWizard();
              }
            }}
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

/* -- Extracted sub-component -- */

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
