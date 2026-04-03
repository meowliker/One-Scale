'use client';

import { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Package,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { ProductProfileCard } from '@/components/creative-hub/ProductProfileCard';
import { EditProductProfileModal } from '@/components/creative-hub/EditProductProfileModal';
import { UnmappedCampaignCard } from '@/components/creative-hub/UnmappedCampaignCard';
import type { ProductProfile, ProductCampaignLink } from '@/types/creativeHub';

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

export function ProductProfilesTab({ storeId }: ProductProfilesTabProps) {
  const profiles = useCreativeHubStore((s) => s.profiles);
  const profilesLoading = useCreativeHubStore((s) => s.profilesLoading);
  const unmappedCampaigns = useCreativeHubStore((s) => s.unmappedCampaigns);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const profileCreativeCounts = useCreativeHubStore((s) => s.profileCreativeCounts);
  const profileCreativeCountsLoading = useCreativeHubStore((s) => s.profileCreativeCountsLoading);
  const inboxLoading = useCreativeHubStore((s) => s.inboxLoading);
  const inboxLastSyncedAt = useCreativeHubStore((s) => s.inboxLastSyncedAt);
  const autoDiscoverProfiles = useCreativeHubStore((s) => s.autoDiscoverProfiles);
  const setActiveTab = useCreativeHubStore((s) => s.setActiveTab);
  const openLaunchCenter = useCreativeHubStore((s) => s.openLaunchCenter);
  const fetchInbox = useCreativeHubStore((s) => s.fetchInbox);
  const syncInbox = useCreativeHubStore((s) => s.syncInbox);
  const activeTests = useCreativeHubStore((s) => s.activeTests);
  const completedTests = useCreativeHubStore((s) => s.completedTests);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProductProfile | null>(null);
  const [unmappedExpanded, setUnmappedExpanded] = useState(true);
  const [notTestingExpanded, setNotTestingExpanded] = useState(false);
  const [launchingProfileId, setLaunchingProfileId] = useState<string | null>(null);

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

  const handleLaunch = async (profile: ProductProfile) => {
    setLaunchingProfileId(profile.id);
    try {
      const hasTargetCreativesLoaded = inboxCreatives.some(
        (creative) => creative.productProfileId === profile.id,
      );
      let scopedCreatives = inboxCreatives;

      if (!hasTargetCreativesLoaded) {
        await fetchInbox(storeId, profile.id);
        scopedCreatives = useCreativeHubStore.getState().inboxCreatives;
      }

      const readyCreativeIds = scopedCreatives
        .filter(
          (creative) =>
            creative.productProfileId === profile.id &&
            (creative.uploadStatus === 'ready' || !!creative.driveUrl),
        )
        .map((creative) => creative.id);

      if (readyCreativeIds.length > 0) {
        openLaunchCenter(profile.id, readyCreativeIds);
      } else {
        openLaunchCenter(profile.id);
      }
    } finally {
      setLaunchingProfileId(null);
    }
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
                    testingCount={testingCountMap.get(profile.id) ?? 0}
                    launchedCount={launchedCountMap.get(profile.id) ?? 0}
                    winnersCount={winnersCountMap.get(profile.id) ?? 0}
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
                    testingCount={testingCountMap.get(profile.id) ?? 0}
                    launchedCount={launchedCountMap.get(profile.id) ?? 0}
                    winnersCount={winnersCountMap.get(profile.id) ?? 0}
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
    </div>
  );
}
