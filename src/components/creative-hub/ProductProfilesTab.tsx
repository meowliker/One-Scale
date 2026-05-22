'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  Plus,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
  Rocket,
  Search,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { ProductProfileCard } from '@/components/creative-hub/ProductProfileCard';
import { EditProductProfileModal } from '@/components/creative-hub/EditProductProfileModal';
import { UnmappedCampaignCard } from '@/components/creative-hub/UnmappedCampaignCard';
import { InboxCreativeRow } from '@/components/creative-hub/InboxCreativeRow';
import { CreativePreviewModal } from '@/components/creative-hub/CreativePreviewModal';
import type { ProductProfile, ProductCampaignLink, InboxCreative } from '@/types/creativeHub';

interface ProductProfilesTabProps {
  storeId: string;
}

function formatLastSyncedAt(value: string | null): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

type LaunchPickerStatusFilter = 'all' | 'ready' | 'pending' | 'uploading' | 'failed' | 'no_link';
type LaunchPickerFormatFilter = 'all' | 'video' | 'image' | 'carousel';

function getLaunchPickerStatus(creative: InboxCreative): Exclude<LaunchPickerStatusFilter, 'all'> {
  if (creative.uploadStatus === 'ready' || !!creative.driveUrl) {
    return 'ready';
  }
  if (creative.uploadStatus === 'uploading') {
    return 'uploading';
  }
  if (creative.uploadStatus === 'failed') {
    return 'failed';
  }
  if (creative.uploadStatus === 'no_link') {
    return 'no_link';
  }
  return 'pending';
}

export function ProductProfilesTab({ storeId }: ProductProfilesTabProps) {
  const router = useRouter();
  const profiles = useCreativeHubStore((s) => s.profiles);
  const profilesLoading = useCreativeHubStore((s) => s.profilesLoading);
  const unmappedCampaigns = useCreativeHubStore((s) => s.unmappedCampaigns);
  const autoDiscoverStats = useCreativeHubStore((s) => s.autoDiscoverStats);
  const autoDiscoverError = useCreativeHubStore((s) => s.autoDiscoverError);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const profileCreativeCounts = useCreativeHubStore((s) => s.profileCreativeCounts);
  const profileClickUpStatusCounts = useCreativeHubStore((s) => s.profileClickUpStatusCounts);
  const profileCreativeCountsLoading = useCreativeHubStore((s) => s.profileCreativeCountsLoading);
  const inboxLoading = useCreativeHubStore((s) => s.inboxLoading);
  const inboxError = useCreativeHubStore((s) => s.inboxError);
  const inboxNotConnected = useCreativeHubStore((s) => s.inboxNotConnected);
  const inboxLastSyncedAt = useCreativeHubStore((s) => s.inboxLastSyncedAt);
  const autoDiscoverProfiles = useCreativeHubStore((s) => s.autoDiscoverProfiles);
  const setActiveTab = useCreativeHubStore((s) => s.setActiveTab);
  const openLaunchCenter = useCreativeHubStore((s) => s.openLaunchCenter);
  const syncInbox = useCreativeHubStore((s) => s.syncInbox);
  const activeTests = useCreativeHubStore((s) => s.activeTests);
  const completedTests = useCreativeHubStore((s) => s.completedTests);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProductProfile | null>(null);
  const [unmappedExpanded, setUnmappedExpanded] = useState(true);
  const [notTestingExpanded, setNotTestingExpanded] = useState(false);
  const [launchingProfileId, setLaunchingProfileId] = useState<string | null>(null);
  const [launchPickerProfile, setLaunchPickerProfile] = useState<ProductProfile | null>(null);
  const [launchPickerCreatives, setLaunchPickerCreatives] = useState<InboxCreative[]>([]);
  const [launchPickerSelectedIds, setLaunchPickerSelectedIds] = useState<Set<string>>(new Set());
  const [launchPickerSearch, setLaunchPickerSearch] = useState('');
  const [launchPickerStatusFilter, setLaunchPickerStatusFilter] =
    useState<LaunchPickerStatusFilter>('all');
  const [launchPickerFormatFilter, setLaunchPickerFormatFilter] =
    useState<LaunchPickerFormatFilter>('all');
  const [previewCreative, setPreviewCreative] = useState<InboxCreative | null>(null);

  // Build linked campaigns map from profile data returned by the API
  const linkedCampaignsMap = useMemo(() => {
    const map = new Map<string, ProductCampaignLink[]>();
    profiles.forEach((p) => {
      // campaignLinks comes from the profiles API response
      const links = p.campaignLinks ?? [];
      map.set(p.id, links);
    });
    return map;
  }, [profiles]);

  // Count active tests (testing) per product profile
  const testingCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const test of activeTests) {
      map.set(test.productProfileId, (map.get(test.productProfileId) ?? 0) + 1);
    }
    return map;
  }, [activeTests]);

  // Count launched (completed) tests per product profile
  const launchedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const test of completedTests) {
      map.set(test.productProfileId, (map.get(test.productProfileId) ?? 0) + 1);
    }
    return map;
  }, [completedTests]);

  // Count winners per product profile (completed tests with a winner)
  const winnersCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const test of completedTests) {
      if (test.winnerCreativeId) {
        map.set(test.productProfileId, (map.get(test.productProfileId) ?? 0) + 1);
      }
    }
    return map;
  }, [completedTests]);

  const inboxCreativeCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const creative of inboxCreatives) {
      if (!creative.productProfileId) continue;
      if (creative.uploadStatus !== 'ready' && !creative.driveUrl) continue;
      map.set(creative.productProfileId, (map.get(creative.productProfileId) ?? 0) + 1);
    }
    return map;
  }, [inboxCreatives]);

  // Split profiles into active and inactive
  // Only show products that have campaigns. Products with 0 campaigns don't appear at all.
  // Active = at least one campaign is ACTIVE. Inactive = has campaigns but all are paused/inactive.
  const { activeProfiles, notTestingProfiles } = useMemo(() => {
    const active: ProductProfile[] = [];
    const inactive: ProductProfile[] = [];
    for (const p of profiles) {
      const campaignCount = (p.campaignLinks ?? []).length + (p.activeCampaignCount ?? 0);
      // Skip products with zero campaigns entirely
      if (campaignCount === 0 && !(p.campaignLinks ?? []).length) continue;

      const hasActiveCampaigns = (p.activeCampaignCount ?? 0) > 0 ||
        (p.campaignLinks ?? []).some((l) =>
          l.effectiveStatus === 'ACTIVE' || (!l.effectiveStatus && l.isActive)
        );
      if (hasActiveCampaigns) {
        active.push(p);
      } else if ((p.campaignLinks ?? []).length > 0) {
        // Only show in inactive if it has campaigns (all inactive)
        inactive.push(p);
      }
    }
    return { activeProfiles: active, notTestingProfiles: inactive };
  }, [profiles]);

  const mappedCount = profiles.length;
  const unmappedCount = unmappedCampaigns.length;
  const autoDiscoverDiagnostics = autoDiscoverStats?.diagnostics ?? [];
  const shouldShowAutoDiscoverNotice =
    !!autoDiscoverError ||
    (
      autoDiscoverDiagnostics.length > 0 &&
      (mappedCount === 0 || unmappedCount > 0)
    );

  const handleEdit = (profile: ProductProfile) => {
    setEditingProfile(profile);
    setEditModalOpen(true);
  };

  const handleAddManual = () => {
    setEditingProfile(null);
    setEditModalOpen(true);
  };

  const handleAutoDiscover = () => {
    autoDiscoverProfiles(storeId);
  };

  const handleRefreshClickUp = async () => {
    await syncInbox(storeId);
  };

  const handleViewCopyLibrary = () => {
    setActiveTab('copy-library');
  };

  const closeLaunchPicker = () => {
    setLaunchPickerProfile(null);
    setLaunchPickerCreatives([]);
    setLaunchPickerSelectedIds(new Set());
    setLaunchPickerSearch('');
    setLaunchPickerStatusFilter('all');
    setLaunchPickerFormatFilter('all');
  };

  const launchPickerVisibleCreatives = useMemo(() => {
    const query = launchPickerSearch.trim().toLowerCase();
    return launchPickerCreatives.filter((creative) => {
      if (
        launchPickerStatusFilter !== 'all' &&
        getLaunchPickerStatus(creative) !== launchPickerStatusFilter
      ) {
        return false;
      }
      if (launchPickerFormatFilter !== 'all' && creative.creativeFormat !== launchPickerFormatFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const text = [
        creative.creativeName,
        creative.clickupTaskName,
        creative.hook,
        creative.angle,
        creative.driveParentFolderName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(query);
    });
  }, [
    launchPickerCreatives,
    launchPickerSearch,
    launchPickerStatusFilter,
    launchPickerFormatFilter,
  ]);

  const handleLaunch = (profile: ProductProfile) => {
    setLaunchingProfileId(profile.id);
    const params = new URLSearchParams({
      productProfileId: profile.id,
      storeId,
    });
    router.push(`/creative-hub/launch-creative?${params.toString()}`);
    setLaunchingProfileId(null);
  };

  const toggleLaunchPickerCreative = (creativeId: string) => {
    setLaunchPickerSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(creativeId)) {
        next.delete(creativeId);
      } else {
        next.add(creativeId);
      }
      return next;
    });
  };

  const selectAllLaunchPickerCreatives = () => {
    setLaunchPickerSelectedIds(new Set(launchPickerCreatives.map((creative) => creative.id)));
  };

  const clearAllLaunchPickerCreatives = () => {
    setLaunchPickerSelectedIds(new Set());
  };

  const continueLaunchWithSelectedCreatives = () => {
    if (!launchPickerProfile || launchPickerSelectedIds.size === 0) return;
    openLaunchCenter(launchPickerProfile.id, [...launchPickerSelectedIds]);
    closeLaunchPicker();
  };

  const handleMapToProfile = async (campaignId: string, profileId: string) => {
    // Find the unmapped campaign details
    const campaign = unmappedCampaigns.find((c) => c.campaignId === campaignId);
    if (!campaign) return;

    try {
      const res = await fetch('/api/creative-hub/product-profiles/campaign-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productProfileId: profileId,
          campaignId: campaign.campaignId,
          campaignName: campaign.campaignName,
          adAccountId: campaign.adAccountId,
        }),
      });

      if (res.ok) {
        // Remove from unmapped list locally and refresh profiles (don't re-run auto-discover)
        const store = useCreativeHubStore.getState();
        const updatedUnmapped = (store.unmappedCampaigns ?? []).filter((c) => c.campaignId !== campaignId);
        useCreativeHubStore.setState({ unmappedCampaigns: updatedUnmapped });

        // Refresh profiles to show the new link
        const storeId = profiles[0]?.storeId;
        if (storeId) {
          await store.fetchProfiles(storeId);
        }
      } else {
        const data = await res.json();
        console.error('[Map] Failed to link campaign:', data.error);
      }
    } catch (err) {
      console.error('[Map] Error linking campaign:', err);
    }
  };

  const handleIgnoreCampaign = (campaignId: string) => {
    // Remove from unmapped list locally (doesn't persist — will reappear on next auto-discover)
    const store = useCreativeHubStore.getState();
    const updated = (store.unmappedCampaigns ?? []).filter((c) => c.campaignId !== campaignId);
    useCreativeHubStore.setState({ unmappedCampaigns: updated });
  };

  const handleCreateNewProfileFromCampaign = () => {
    setEditingProfile(null);
    setEditModalOpen(true);
  };

  const getProfileReadyCount = (profileId: string) => {
    if (profileCreativeCounts[profileId] != null) {
      return profileCreativeCounts[profileId];
    }
    return inboxCreativeCountsMap.get(profileId) ?? 0;
  };

  const getProfileStatusCount = (
    profileId: string,
    key: 'testing' | 'launched' | 'winners',
    fallback: number,
  ) => {
    const clickupCounts = profileClickUpStatusCounts[profileId];
    if (clickupCounts && clickupCounts[key] != null) {
      return clickupCounts[key];
    }
    return fallback;
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Product Profiles</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            {mappedCount} product{mappedCount !== 1 ? 's' : ''} mapped
            {unmappedCount > 0 && (
              <span className="text-amber-600 font-medium">
                {' '}&middot; {unmappedCount} campaign{unmappedCount !== 1 ? 's' : ''} unmapped
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefreshClickUp}
            disabled={inboxLoading}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              inboxLoading
                ? 'bg-gray-100 text-text-dimmed cursor-not-allowed'
                : 'border border-border bg-surface-elevated text-text-primary hover:bg-surface-hover'
            )}
          >
            {inboxLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 text-sky-600" />
            )}
            Refresh ClickUp
          </button>
          <button
            onClick={handleAutoDiscover}
            disabled={profilesLoading}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              profilesLoading
                ? 'bg-gray-100 text-text-dimmed cursor-not-allowed'
                : 'border border-border bg-surface-elevated text-text-primary hover:bg-surface-hover'
            )}
          >
            {profilesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-500" />
            )}
            Auto-Discover Products
          </button>
          <button
            onClick={handleAddManual}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Manual
          </button>
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        Last ClickUp refresh: <span className="font-medium text-text-primary">{formatLastSyncedAt(inboxLastSyncedAt)}</span>
      </p>

      {inboxError && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
          <div>
            <p className="font-medium">
              {inboxNotConnected ? 'ClickUp needs to be reconnected' : 'ClickUp sync needs attention'}
            </p>
            <p className="mt-0.5 text-amber-800">{inboxError}</p>
          </div>
        </div>
      )}

      {shouldShowAutoDiscoverNotice && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
          <div>
            <p className="font-medium">
              {autoDiscoverError ? 'Auto-discover could not complete' : 'Auto-discover needs better source data'}
            </p>
            {autoDiscoverError ? (
              <p className="mt-0.5 text-amber-800">{autoDiscoverError}</p>
            ) : (
              <div className="mt-1 space-y-1 text-amber-800">
                {autoDiscoverDiagnostics.map((message) => (
                  <p key={message}>{message}</p>
                ))}
                {autoDiscoverStats && (
                  <div className="space-y-2 text-xs text-amber-700">
                    <p>
                      Checked {autoDiscoverStats.totalCampaigns} active campaign
                      {autoDiscoverStats.totalCampaigns === 1 ? '' : 's'}, {autoDiscoverStats.campaignsWithDestinationUrls ?? 0} with product URLs,
                      and {autoDiscoverStats.shopifyProducts ?? 0} Shopify product
                      {(autoDiscoverStats.shopifyProducts ?? 0) === 1 ? '' : 's'}.
                    </p>
                    {autoDiscoverStats.campaignUrlProducts && autoDiscoverStats.campaignUrlProducts.length > 0 && (
                      <div>
                        <p className="font-medium text-amber-800">Campaign product handles found:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {autoDiscoverStats.campaignUrlProducts.map((item) => (
                            <span
                              key={`${item.campaignId}-${item.destinationUrl}`}
                              className="rounded-md border border-amber-200 bg-white/70 px-2 py-1"
                              title={item.destinationUrl}
                            >
                              {item.handle || 'No product handle'} · {item.campaignName}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {autoDiscoverStats.shopifyProductSamples && autoDiscoverStats.shopifyProductSamples.length > 0 && (
                      <div>
                        <p className="font-medium text-amber-800">Shopify products sampled from store:</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {autoDiscoverStats.shopifyProductSamples.slice(0, 12).map((product) => (
                            <span
                              key={`${product.handle}-${product.title}`}
                              className="rounded-md border border-amber-200 bg-white/70 px-2 py-1"
                              title={product.title}
                            >
                              {product.handle || product.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile cards — split into Active Products and Not Testing sections */}
      {profiles.length > 0 ? (
        <div className="space-y-6">
          {/* Active Products section */}
          {activeProfiles.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-text-primary">
                  Active Products ({activeProfiles.length})
                </span>
                <span className="flex-1 border-t border-border" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activeProfiles.map((profile) => (
                  <ProductProfileCard
                    key={profile.id}
                    profile={profile}
                    linkedCampaigns={linkedCampaignsMap.get(profile.id) ?? []}
                    creativeCount={profileCreativeCountsLoading ? '…' : getProfileReadyCount(profile.id)}
                    testingCount={getProfileStatusCount(profile.id, 'testing', testingCountMap.get(profile.id) ?? 0)}
                    launchedCount={getProfileStatusCount(profile.id, 'launched', launchedCountMap.get(profile.id) ?? 0)}
                    winnersCount={getProfileStatusCount(profile.id, 'winners', winnersCountMap.get(profile.id) ?? 0)}
                    onEdit={handleEdit}
                    onLaunch={handleLaunch}
                    onViewCopyLibrary={handleViewCopyLibrary}
                    launching={launchingProfileId === profile.id}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Products section (collapsed by default) */}
          {notTestingProfiles.length > 0 && (
            <div className="mt-6 space-y-4">
              <button
                onClick={() => setNotTestingExpanded(!notTestingExpanded)}
                className="flex items-center gap-3 w-full group px-4 py-2.5 rounded-lg bg-surface-secondary/50 hover:bg-surface-secondary transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-text-dimmed/40" />
                  <span className="text-sm font-medium text-text-secondary">
                    Inactive Products ({notTestingProfiles.length})
                  </span>
                </div>
                <span className="text-xs text-text-dimmed">
                  {notTestingExpanded ? 'Hide' : 'Show'}
                </span>
                {notTestingExpanded ? (
                  <ChevronUp className="h-4 w-4 text-text-dimmed group-hover:text-text-secondary transition-colors" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-dimmed group-hover:text-text-secondary transition-colors" />
                )}
                <span className="flex-1 border-t border-border/50" />
              </button>
              {notTestingExpanded && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-60">
                  {notTestingProfiles.map((profile) => (
                  <ProductProfileCard
                    key={profile.id}
                    profile={profile}
                    linkedCampaigns={linkedCampaignsMap.get(profile.id) ?? []}
                    creativeCount={profileCreativeCountsLoading ? '…' : getProfileReadyCount(profile.id)}
                    testingCount={getProfileStatusCount(profile.id, 'testing', testingCountMap.get(profile.id) ?? 0)}
                    launchedCount={getProfileStatusCount(profile.id, 'launched', launchedCountMap.get(profile.id) ?? 0)}
                    winnersCount={getProfileStatusCount(profile.id, 'winners', winnersCountMap.get(profile.id) ?? 0)}
                    onEdit={handleEdit}
                      onLaunch={handleLaunch}
                      onViewCopyLibrary={handleViewCopyLibrary}
                      launching={launchingProfileId === profile.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : !profilesLoading ? (
        /* Empty state */
        <div className="rounded-xl border border-dashed border-border bg-surface-elevated p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
            <Package className="h-7 w-7 text-blue-500" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-text-primary">No product profiles yet</h3>
          <p className="mt-1.5 text-sm text-text-secondary max-w-md mx-auto">
            Product profiles store your Meta ad account settings, test defaults, and targeting presets
            for each product you test creatives on.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={handleAutoDiscover}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary bg-surface-elevated hover:bg-surface-hover transition-colors"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              Auto-Discover from Campaigns
            </button>
            <button
              onClick={handleAddManual}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Manually
            </button>
          </div>
        </div>
      ) : null}

      {/* Loading state */}
      {profilesLoading && profiles.length === 0 && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500 mr-3" />
          <span className="text-sm text-text-secondary">Discovering products...</span>
        </div>
      )}

      {/* Unmapped campaigns section */}
      {unmappedCampaigns.length > 0 && (
        <div className="space-y-3">
          <button
            onClick={() => setUnmappedExpanded(!unmappedExpanded)}
            className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-text-primary/80 transition-colors w-full"
          >
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span>
              {unmappedCampaigns.length} Unmapped Campaign{unmappedCampaigns.length !== 1 ? 's' : ''}
            </span>
            {unmappedExpanded ? (
              <ChevronUp className="h-4 w-4 text-text-dimmed" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-dimmed" />
            )}
            <span className="flex-1 border-t border-border ml-2" />
          </button>

          {unmappedExpanded && (
            <div className="space-y-3">
              {unmappedCampaigns.map((campaign) => (
                <UnmappedCampaignCard
                  key={campaign.campaignId}
                  campaign={campaign}
                  profiles={profiles}
                  onMapToProfile={handleMapToProfile}
                  onIgnore={handleIgnoreCampaign}
                  onCreateNewProfile={handleCreateNewProfileFromCampaign}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit modal */}
      <EditProductProfileModal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setEditingProfile(null); }}
        profile={editingProfile}
        linkedCampaigns={editingProfile ? (linkedCampaignsMap.get(editingProfile.id) ?? []) : []}
        storeId={storeId}
      />

      {launchPickerProfile && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-6">
          <div className="w-full max-w-4xl rounded-2xl border border-border bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dimmed">
                  Select Creatives
                </p>
                <h3 className="mt-1 text-lg font-semibold text-text-primary">
                  {launchPickerProfile.productName}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Pick creatives to send to Launch Center.
                </p>
              </div>
              <button
                onClick={closeLaunchPicker}
                className="rounded-lg p-2 text-text-dimmed transition-colors hover:bg-surface-hover hover:text-text-secondary"
                aria-label="Close creative picker"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex w-full flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dimmed" />
                    <input
                      value={launchPickerSearch}
                      onChange={(event) => setLaunchPickerSearch(event.target.value)}
                      placeholder="Search creatives..."
                      className="w-full rounded-lg border border-border bg-surface-elevated py-2 pl-9 pr-3 text-sm text-text-primary outline-none transition-colors focus:border-blue-400"
                    />
                  </div>
                  <select
                    value={launchPickerStatusFilter}
                    onChange={(event) =>
                      setLaunchPickerStatusFilter(event.target.value as LaunchPickerStatusFilter)
                    }
                    className="h-10 rounded-lg border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="all">All status</option>
                    <option value="ready">Ready</option>
                    <option value="pending">Pending</option>
                    <option value="uploading">Uploading</option>
                    <option value="failed">Failed</option>
                    <option value="no_link">No Link</option>
                  </select>
                  <select
                    value={launchPickerFormatFilter}
                    onChange={(event) =>
                      setLaunchPickerFormatFilter(event.target.value as LaunchPickerFormatFilter)
                    }
                    className="h-10 rounded-lg border border-border bg-surface-elevated px-3 text-sm text-text-primary outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="all">All formats</option>
                    <option value="video">Video</option>
                    <option value="image">Image</option>
                    <option value="carousel">Carousel</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllLaunchPickerCreatives}
                    className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-hover"
                  >
                    Select all
                  </button>
                  <button
                    onClick={clearAllLaunchPickerCreatives}
                    className="rounded-lg border border-border bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-hover"
                  >
                    Clear
                  </button>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                    {launchPickerSelectedIds.size} selected
                  </span>
                </div>
              </div>

              <div className="max-h-[60vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-surface-elevated p-3">
                {launchPickerVisibleCreatives.length > 0 ? (
                  launchPickerVisibleCreatives.map((creative) => (
                    <InboxCreativeRow
                      key={creative.id}
                      creative={creative}
                      isSelected={launchPickerSelectedIds.has(creative.id)}
                      onToggleSelect={() => toggleLaunchPickerCreative(creative.id)}
                      onPreview={() => setPreviewCreative(creative)}
                    />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-text-secondary">
                    No creatives match the current filter.
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <button
                onClick={closeLaunchPicker}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={continueLaunchWithSelectedCreatives}
                disabled={launchPickerSelectedIds.size === 0}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25',
                  launchPickerSelectedIds.size === 0
                    ? 'cursor-not-allowed border-border bg-surface-hover text-text-dimmed'
                    : 'border-primary/20 bg-primary text-white shadow-sm shadow-primary/20 hover:bg-primary-dark',
                )}
              >
                <Rocket className="h-4 w-4" />
                Continue to Launch Center
              </button>
            </div>
          </div>
        </div>
      )}

      <CreativePreviewModal
        creative={previewCreative}
        isOpen={previewCreative !== null}
        onClose={() => setPreviewCreative(null)}
      />
    </div>
  );
}
