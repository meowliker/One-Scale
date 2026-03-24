'use client';

import { useState, useMemo } from 'react';
import {
  Sparkles,
  Plus,
  Package,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore, type UnmappedCampaign } from '@/stores/creativeHubStore';
import { ProductProfileCard } from '@/components/creative-hub/ProductProfileCard';
import { EditProductProfileModal } from '@/components/creative-hub/EditProductProfileModal';
import { UnmappedCampaignCard } from '@/components/creative-hub/UnmappedCampaignCard';
import type { ProductProfile, ProductCampaignLink } from '@/types/creativeHub';

interface ProductProfilesTabProps {
  storeId: string;
}

export function ProductProfilesTab({ storeId }: ProductProfilesTabProps) {
  const profiles = useCreativeHubStore((s) => s.profiles);
  const profilesLoading = useCreativeHubStore((s) => s.profilesLoading);
  const unmappedCampaigns = useCreativeHubStore((s) => s.unmappedCampaigns);
  const autoDiscoverProfiles = useCreativeHubStore((s) => s.autoDiscoverProfiles);
  const setActiveTab = useCreativeHubStore((s) => s.setActiveTab);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const activeTests = useCreativeHubStore((s) => s.activeTests);
  const completedTests = useCreativeHubStore((s) => s.completedTests);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProductProfile | null>(null);
  const [unmappedExpanded, setUnmappedExpanded] = useState(true);
  const [notTestingExpanded, setNotTestingExpanded] = useState(true);

  // Count creatives per product profile
  const creativeCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of inboxCreatives) {
      if (c.productProfileId) {
        map.set(c.productProfileId, (map.get(c.productProfileId) ?? 0) + 1);
      }
    }
    return map;
  }, [inboxCreatives]);

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

  // Split profiles into active (testing) and not testing
  const { activeProfiles, notTestingProfiles } = useMemo(() => {
    const active: ProductProfile[] = [];
    const notTesting: ProductProfile[] = [];
    for (const p of profiles) {
      const isActive = (p.activeCampaignCount ?? 0) > 0 || (p.campaignLinks ?? []).some((l) => l.isActive);
      if (isActive) {
        active.push(p);
      } else {
        notTesting.push(p);
      }
    }
    return { activeProfiles: active, notTestingProfiles: notTesting };
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

  const handleViewCopyLibrary = (profileId: string) => {
    setActiveTab('copy-library');
  };

  const handleMapToProfile = (campaignId: string, profileId: string) => {
    // Will be wired to store action in Task 16
  };

  const handleIgnoreCampaign = (campaignId: string) => {
    // Will be wired to store action in Task 16
  };

  const handleCreateNewProfileFromCampaign = (campaign: UnmappedCampaign) => {
    setEditingProfile(null);
    setEditModalOpen(true);
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
                    creativeCount={creativeCountMap.get(profile.id) ?? 0}
                    testingCount={testingCountMap.get(profile.id) ?? 0}
                    launchedCount={launchedCountMap.get(profile.id) ?? 0}
                    winnersCount={winnersCountMap.get(profile.id) ?? 0}
                    onEdit={handleEdit}
                    onViewCopyLibrary={handleViewCopyLibrary}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Not Testing section (collapsible) */}
          {notTestingProfiles.length > 0 && (
            <div className="space-y-4">
              <button
                onClick={() => setNotTestingExpanded(!notTestingExpanded)}
                className="flex items-center gap-3 w-full group"
              >
                <span className="text-sm font-semibold text-text-secondary">
                  Not Testing ({notTestingProfiles.length})
                </span>
                {notTestingExpanded ? (
                  <ChevronUp className="h-4 w-4 text-text-dimmed group-hover:text-text-secondary transition-colors" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-dimmed group-hover:text-text-secondary transition-colors" />
                )}
                <span className="flex-1 border-t border-border" />
              </button>
              {notTestingExpanded && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 opacity-75">
                  {notTestingProfiles.map((profile) => (
                    <ProductProfileCard
                      key={profile.id}
                      profile={profile}
                      linkedCampaigns={linkedCampaignsMap.get(profile.id) ?? []}
                      creativeCount={creativeCountMap.get(profile.id) ?? 0}
                      testingCount={testingCountMap.get(profile.id) ?? 0}
                      launchedCount={launchedCountMap.get(profile.id) ?? 0}
                      winnersCount={winnersCountMap.get(profile.id) ?? 0}
                      onEdit={handleEdit}
                      onViewCopyLibrary={handleViewCopyLibrary}
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
