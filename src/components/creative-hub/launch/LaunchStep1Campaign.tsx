'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Package,
  FolderOpen,
  Plus,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Loader2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type {
  BidStrategy,
  ProductCampaignLink,
} from '@/types/creativeHub';

interface FetchedAdset {
  id: string;
  name: string;
  spend: number;
  status: string;
}

const BID_STRATEGIES: { value: BidStrategy; label: string; description: string; hasInput?: 'amount' | 'roas' }[] = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Highest volume or value', description: 'Maximize results for your budget' },
  { value: 'COST_CAP', label: 'Cost Cap', description: 'Keep cost per result around your target', hasInput: 'amount' },
  { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Bid Cap', description: 'Control your bid in each auction', hasInput: 'amount' },
  { value: 'LOWEST_COST_WITH_MIN_ROAS', label: 'Minimum ROAS', description: 'Optimize for minimum return on ad spend', hasInput: 'roas' },
];

const CONVERSION_EVENTS = [
  'Purchase',
  'AddToCart',
  'InitiateCheckout',
  'ViewContent',
  'Lead',
  'CompleteRegistration',
];

const CTA_OPTIONS = [
  'SHOP_NOW',
  'LEARN_MORE',
  'SIGN_UP',
  'BUY_NOW',
  'GET_OFFER',
  'ORDER_NOW',
];

const PLACEMENT_OPTIONS = [
  { id: 'facebook_feed', label: 'Facebook Feed' },
  { id: 'facebook_stories', label: 'Facebook Stories' },
  { id: 'facebook_reels', label: 'Facebook Reels' },
  { id: 'instagram_feed', label: 'Instagram Feed' },
  { id: 'instagram_stories', label: 'Instagram Stories' },
  { id: 'instagram_reels', label: 'Instagram Reels' },
  { id: 'instagram_explore', label: 'Instagram Explore' },
  { id: 'audience_network', label: 'Audience Network' },
];

export function LaunchStep1Campaign() {
  const { profiles, launchConfig, updateLaunchConfig, inboxCreatives, selectedCreativeIds } = useCreativeHubStore();
  const { activeStoreId } = useStoreStore();
  const [expandedNewCampaign, setExpandedNewCampaign] = useState(false);
  const [selectedPlacements, setSelectedPlacements] = useState<string[]>([
    'facebook_feed', 'instagram_feed', 'instagram_stories', 'instagram_reels',
  ]);

  // Real adset data fetched from the API when an existing campaign is selected
  const [campaignAdsets, setCampaignAdsets] = useState<FetchedAdset[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const adsetModeRef = useRef<HTMLDivElement>(null);

  const selectedProfile = profiles.find((p) => p.id === launchConfig.productProfileId);
  const campaignMode = launchConfig.campaignMode || 'existing';
  const adsetMode = launchConfig.adsetMode || 'new_adsets';
  const structure = launchConfig.structure || 'CBO';
  const bidStrategy = launchConfig.bidStrategy || 'LOWEST_COST_WITHOUT_CAP';
  const selectedCampaignId = launchConfig.existingCampaignId;
  const adsetAssignments = launchConfig.existingAdsetAssignments || {};

  const selectedCreatives = inboxCreatives.filter((c) => selectedCreativeIds.has(c.id));

  // Get the campaign links from the selected product profile — only show campaigns with ACTIVE effective status
  const linkedCampaigns: ProductCampaignLink[] = (selectedProfile?.campaignLinks ?? []).filter(
    (link) => link.effectiveStatus === 'ACTIVE' || (!link.effectiveStatus && link.isActive)
  );

  // Detect CBO vs ABO for selected existing campaign
  const selectedCampaignLink = linkedCampaigns.find((c) => c.campaignId === selectedCampaignId);
  const isCBO = useMemo(() => {
    if (!selectedCampaignLink) return false;
    return (selectedCampaignLink.campaignDailyBudget ?? 0) > 0 ||
           (selectedCampaignLink.campaignLifetimeBudget ?? 0) > 0;
  }, [selectedCampaignLink]);

  // Fetch adsets when an existing campaign is selected
  const fetchAdsets = useCallback(async (campaignId: string) => {
    setAdsetsLoading(true);
    setCampaignAdsets([]);
    try {
      const params = new URLSearchParams({
        storeId: activeStoreId || '',
        campaignId,
      });
      const res = await fetch(`/api/meta/adsets?${params.toString()}`);
      const data = await res.json();
      const adsetRows = data.data ?? data.adsets ?? [];
      if (adsetRows.length > 0) {
        setCampaignAdsets(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          adsetRows.map((a: any) => ({
            id: String(a.id ?? ''),
            name: String(a.name || 'Untitled'),
            spend: typeof a.metrics?.spend === 'number' ? a.metrics.spend : parseFloat(String(a.metrics?.spend || '0')),
            status: String(a.status || 'UNKNOWN'),
          }))
        );
      }
    } catch {
      // Silently fail - the user will see an empty list
    } finally {
      setAdsetsLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    if (campaignMode === 'existing' && selectedCampaignId) {
      fetchAdsets(selectedCampaignId);
    }
  }, [campaignMode, selectedCampaignId, fetchAdsets]);

  // Was the product pre-selected (e.g. launched from Creative Inbox or Product Profile card)?
  const isProductPreSelected = Boolean(launchConfig.productProfileId && selectedProfile);

  // ── Product Selector ──

  return (
    <div className="space-y-8">
      {/* Section 1: Product Selector — collapsed if pre-selected */}
      {isProductPreSelected ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Product</h2>
            <button
              onClick={() => updateLaunchConfig({ productProfileId: undefined, existingCampaignId: undefined })}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-blue-500 bg-blue-50/30 p-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
              {selectedProfile!.productImage ? (
                <img src={selectedProfile!.productImage} alt={selectedProfile!.productName} className="h-full w-full object-cover" />
              ) : (
                <Package className="h-5 w-5 text-slate-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-blue-900">{selectedProfile!.productName}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {selectedProfile!.adAccountId} &middot; {selectedProfile!.adAccountCurrency}
              </p>
            </div>
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0" />
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Select Product</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose the product profile for this creative test launch.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => {
              const isSelected = launchConfig.productProfileId === profile.id;
              const profileLinks = profile.campaignLinks ?? [];

              return (
                <button
                  key={profile.id}
                  onClick={() => {
                    updateLaunchConfig({
                      productProfileId: profile.id,
                      adAccountId: profile.adAccountId,
                      pageId: profile.pageId,
                      instagramActorId: profile.instagramActorId,
                      pixelId: profile.pixelId,
                      conversionEvent: profile.conversionEvent,
                      destinationUrl: profile.destinationUrl,
                      dailyBudget: profile.defaultBudget,
                      testDuration: profile.defaultDuration,
                      bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
                      structure: profile.defaultStructure,
                      launchStatus: profile.defaultLaunchStatus,
                      utmTemplate: profile.utmTemplate,
                      aiMinSpend: profile.aiMinSpend,
                      aiMinImpressions: profile.aiMinImpressions,
                      aiMinHours: profile.aiMinHours,
                      aiEvalFrequency: profile.aiEvalFrequency,
                      existingCampaignId: undefined,
                      existingAdsetAssignments: undefined,
                    });
                    setCampaignAdsets([]);
                  }}
                  className={cn(
                    'group relative flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all',
                    isSelected
                      ? 'border-blue-500 bg-blue-50/30 shadow-lg shadow-blue-100/60'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                  )}
                >
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
                    {profile.productImage ? (
                      <img src={profile.productImage} alt={profile.productName} className="h-full w-full object-cover" />
                    ) : (
                      <Package className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={cn('truncate text-sm font-semibold', isSelected ? 'text-blue-900' : 'text-slate-900')}>
                      {profile.productName}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {profile.adAccountId} &middot; {profile.adAccountCurrency}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {profileLinks.length} linked campaign{profileLinks.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>

          {profiles.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
              <Package className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">No product profiles found.</p>
              <p className="text-xs text-slate-400">Create a product profile first in the Profiles tab.</p>
            </div>
          )}
        </section>
      )}

      {/* Section 2: Campaign Mode */}
      {selectedProfile && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Campaign Mode</h2>
            <p className="mt-1 text-sm text-slate-600">
              Add creatives to an existing campaign or create a new one.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampaignModeCard
              icon={FolderOpen}
              title="Use Existing Campaign"
              description="Add new ad sets or ads to a campaign that's already running"
              selected={campaignMode === 'existing'}
              onClick={() => updateLaunchConfig({ campaignMode: 'existing' })}
            />
            <CampaignModeCard
              icon={Plus}
              title="Create New Campaign"
              description="Set up a brand new campaign with full control over all settings"
              selected={campaignMode === 'new'}
              onClick={() => updateLaunchConfig({ campaignMode: 'new' })}
            />
          </div>
        </section>
      )}

      {/* Section 3A: Existing Campaign Selection — Dropdown */}
      {selectedProfile && campaignMode === 'existing' && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Select Campaign</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose which campaign to add your new creatives to.
            </p>
          </div>

          {linkedCampaigns.length > 0 ? (
            <div className="relative">
              {/* Dropdown trigger */}
              <button
                onClick={() => setCampaignDropdownOpen(!campaignDropdownOpen)}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border-2 p-4 text-left transition-all',
                  selectedCampaignId
                    ? 'border-blue-500 bg-blue-50/30'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                )}
              >
                {selectedCampaignLink ? (
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{selectedCampaignLink.campaignName}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {selectedCampaignLink.campaignType.charAt(0).toUpperCase() + selectedCampaignLink.campaignType.slice(1)} &middot;{' '}
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        Active
                      </span>
                      {isCBO && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">CBO</span>
                      )}
                      {!isCBO && selectedCampaignLink && (
                        <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">ABO</span>
                      )}
                    </p>
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">Select a campaign...</span>
                )}
                <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', campaignDropdownOpen && 'rotate-180')} />
              </button>

              {/* Dropdown list */}
              {campaignDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg max-h-[220px] overflow-y-auto">
                  {linkedCampaigns.map((campaign) => {
                    const isSelected = selectedCampaignId === campaign.campaignId;
                    const campIsCBO = (campaign.campaignDailyBudget ?? 0) > 0 || (campaign.campaignLifetimeBudget ?? 0) > 0;
                    return (
                      <button
                        key={campaign.id}
                        onClick={() => {
                          updateLaunchConfig({ existingCampaignId: campaign.campaignId });
                          setCampaignDropdownOpen(false);
                          // Auto-scroll to ad set mode section
                          setTimeout(() => adsetModeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                          isSelected ? 'bg-blue-50' : 'hover:bg-slate-50',
                          'border-b border-slate-100 last:border-b-0'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-slate-900')}>
                            {campaign.campaignName}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                            {campaign.campaignType.charAt(0).toUpperCase() + campaign.campaignType.slice(1)} &middot;{' '}
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                              Active
                            </span>
                            {campIsCBO ? (
                              <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">CBO</span>
                            ) : (
                              <span className="ml-1 inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">ABO</span>
                            )}
                          </p>
                        </div>
                        {isSelected && <div className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center">
              <FolderOpen className="mx-auto h-6 w-6 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">No active campaigns found for this product.</p>
              <p className="text-xs text-slate-400">
                Link campaigns in the product profile, or choose &ldquo;Create New Campaign&rdquo; instead.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Section 3B: Adset Mode (for existing campaign) */}
      {selectedProfile && campaignMode === 'existing' && selectedCampaignId && (
        <section ref={adsetModeRef} className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ad Set Mode</h2>
            <p className="mt-1 text-sm text-slate-600">
              Create new ad sets or add creatives to existing ones.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampaignModeCard
              icon={Plus}
              title="Create New Ad Sets"
              description="Create fresh ad sets with your selected creatives"
              selected={adsetMode === 'new_adsets'}
              onClick={() => updateLaunchConfig({ adsetMode: 'new_adsets' })}
            />
            <CampaignModeCard
              icon={FolderOpen}
              title="Use Existing Ad Sets"
              description="Add creatives as new ads inside current ad sets and keep their live targeting/budget setup"
              selected={adsetMode === 'existing_adsets'}
              onClick={() => updateLaunchConfig({ adsetMode: 'existing_adsets' })}
            />
          </div>
        </section>
      )}

      {/* Section 4A: New Adsets Budget/Duration/Bid — CBO vs ABO aware */}
      {selectedProfile && campaignMode === 'existing' && adsetMode === 'new_adsets' && selectedCampaignId && (
        isCBO ? (
          /* CBO campaign: budget at campaign level, but bid amount/cost cap may be at ad set level */
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Ad Set Settings</h3>
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-800">
                <p className="font-medium">CBO Campaign — Advantage+ Campaign Budget</p>
                <p className="mt-0.5">
                  Budget: <span className="font-semibold">${selectedCampaignLink?.campaignDailyBudget ?? '—'}/day</span> at campaign level.
                  {' '}Bid Strategy: <span className="font-semibold">{
                    (selectedCampaignLink?.campaignBidStrategy === 'BID_CAP' || selectedCampaignLink?.campaignBidStrategy === 'LOWEST_COST_WITH_BID_CAP') ? 'Bid Cap' :
                    selectedCampaignLink?.campaignBidStrategy === 'COST_CAP' ? 'Cost Cap' :
                    (selectedCampaignLink?.campaignBidStrategy === 'MINIMUM_ROAS' || selectedCampaignLink?.campaignBidStrategy === 'LOWEST_COST_WITH_MIN_ROAS') ? 'ROAS Goal' :
                    'Highest volume or value'
                  }</span>
                </p>
              </div>
            </div>

            <FormField label="Test Duration" helper="Days to run before evaluation">
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={launchConfig.testDuration ?? selectedProfile.defaultDuration}
                  onChange={(e) => updateLaunchConfig({ testDuration: parseInt(e.target.value) || 3 })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  days
                </span>
              </div>
            </FormField>

            {/* CBO + Bid Cap: bid amount is set at ad set level */}
            {(selectedCampaignLink?.campaignBidStrategy === 'BID_CAP' || selectedCampaignLink?.campaignBidStrategy === 'LOWEST_COST_WITH_BID_CAP') && (
              <FormField label="Bid Cap Amount" helper="Maximum bid per auction (set per ad set)">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={launchConfig.bidAmount ?? ''}
                    onChange={(e) => updateLaunchConfig({ bidAmount: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g. 5.00"
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                    {selectedProfile.adAccountCurrency || 'USD'}
                  </span>
                </div>
              </FormField>
            )}

            {/* CBO + Cost Cap: cost goal is set at ad set level */}
            {(selectedCampaignLink?.campaignBidStrategy === 'COST_CAP') && (
              <FormField label="Cost Per Result Goal" helper="Target cost per conversion (set per ad set)">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={launchConfig.bidAmount ?? ''}
                    onChange={(e) => updateLaunchConfig({ bidAmount: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g. 15.00"
                    className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                    {selectedProfile.adAccountCurrency || 'USD'}
                  </span>
                </div>
              </FormField>
            )}

            {/* CBO + ROAS Goal: ROAS floor set at ad set level */}
            {(selectedCampaignLink?.campaignBidStrategy === 'MINIMUM_ROAS' || selectedCampaignLink?.campaignBidStrategy === 'LOWEST_COST_WITH_MIN_ROAS') && (
              <FormField label="ROAS Goal" helper="Minimum return on ad spend target">
                <div className="relative">
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={launchConfig.roasFloor ?? ''}
                    onChange={(e) => updateLaunchConfig({ roasFloor: parseFloat(e.target.value) || undefined })}
                    placeholder="e.g. 2.5"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                    x
                  </span>
                </div>
              </FormField>
            )}
          </section>
        ) : (
          /* ABO campaign: full budget + bid strategy controls at ad set level */
          <NewAdsetBudgetSection
            currency={selectedProfile.adAccountCurrency}
            dailyBudget={launchConfig.dailyBudget ?? selectedProfile.defaultBudget}
            testDuration={launchConfig.testDuration ?? selectedProfile.defaultDuration}
            bidStrategy={bidStrategy}
            bidAmount={launchConfig.bidAmount}
            roasFloor={launchConfig.roasFloor}
            onUpdate={updateLaunchConfig}
          />
        )
      )}

      {/* Section 4B: Existing Adsets Selection + Creative Assignment */}
      {selectedProfile && campaignMode === 'existing' && adsetMode === 'existing_adsets' && selectedCampaignId && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Select Ad Sets & Assign Creatives</h2>
            <p className="mt-1 text-sm text-slate-600">
              Choose which ad sets to add creatives to, and assign specific creatives to each.
            </p>
          </div>

          <div className="space-y-3">
            {adsetsLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-6 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-500">Loading ad sets...</span>
              </div>
            ) : campaignAdsets.length > 0 ? (
              campaignAdsets.map((adset) => {
                const assignedIds = adsetAssignments[adset.id] || [];
                const isChecked = assignedIds.length > 0;

                return (
                  <div
                    key={adset.id}
                    className={cn(
                      'rounded-xl border-2 p-4 transition-all',
                      isChecked ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 bg-white'
                    )}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = { ...adsetAssignments };
                          if (isChecked) {
                            delete next[adset.id];
                          } else {
                            next[adset.id] = selectedCreatives.map((c) => c.id);
                          }
                          updateLaunchConfig({ existingAdsetAssignments: next });
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{adset.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          ${adset.spend.toFixed(2)} spent &middot; {adset.status}
                        </p>
                      </div>
                    </label>

                    {isChecked && selectedCreatives.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                        {selectedCreatives.map((creative) => {
                          const isAssigned = assignedIds.includes(creative.id);
                          return (
                            <button
                              key={creative.id}
                              onClick={() => {
                                const current = adsetAssignments[adset.id] || [];
                                const next = isAssigned
                                  ? current.filter((id) => id !== creative.id)
                                  : [...current, creative.id];
                                updateLaunchConfig({
                                  existingAdsetAssignments: {
                                    ...adsetAssignments,
                                    [adset.id]: next,
                                  },
                                });
                              }}
                              className={cn(
                                'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                                isAssigned
                                  ? 'border-blue-400 bg-blue-100 text-blue-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              )}
                            >
                              <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded bg-slate-100">
                                {creative.thumbnailUrl ? (
                                  <img src={creative.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <ImageIcon className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {creative.creativeName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center">
                <FolderOpen className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600">No ad sets found in this campaign.</p>
                <p className="text-xs text-slate-400">
                  Choose &ldquo;Create New Ad Sets&rdquo; instead.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 5: New Campaign Full Form */}
      {selectedProfile && campaignMode === 'new' && (
        <section className="space-y-6">
          <div>
            <button
              onClick={() => setExpandedNewCampaign(!expandedNewCampaign)}
              className="flex w-full items-center justify-between"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900">New Campaign Settings</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Configure all settings for your new campaign.
                </p>
              </div>
              {expandedNewCampaign ? (
                <ChevronUp className="h-5 w-5 text-slate-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-slate-400" />
              )}
            </button>
          </div>

          {/* Always show essential fields, expand for advanced */}
          <div className="space-y-6">
            {/* Campaign Name */}
            <FormField label="Campaign Name" helper="Name template for the new campaign">
              <input
                type="text"
                value={launchConfig.newCampaignName || ''}
                onChange={(e) => updateLaunchConfig({ newCampaignName: e.target.value })}
                placeholder="e.g., Testing - Protein Powder - Mar 2026"
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </FormField>

            {/* ABO / CBO Toggle */}
            <FormField label="Campaign Structure">
              <div className="flex gap-0">
                <button
                  type="button"
                  onClick={() => updateLaunchConfig({ structure: 'ABO' })}
                  className={cn(
                    'rounded-l-lg border px-5 py-2.5 text-sm font-medium transition-colors',
                    structure === 'ABO'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  ABO
                </button>
                <button
                  type="button"
                  onClick={() => updateLaunchConfig({ structure: 'CBO' })}
                  className={cn(
                    'rounded-r-lg border border-l-0 px-5 py-2.5 text-sm font-medium transition-colors',
                    structure === 'CBO'
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  )}
                >
                  CBO
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {structure === 'ABO'
                  ? 'Ad Set Budget Optimization - set budget per ad set'
                  : 'Campaign Budget Optimization - Meta distributes budget across ad sets'}
              </p>
            </FormField>

            {/* Budget & Bid — different layout for CBO vs ABO */}
            {structure === 'CBO' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Campaign Daily Budget" helper="Total daily budget for all ad sets">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <input
                        type="number"
                        min={1}
                        value={launchConfig.dailyBudget ?? selectedProfile.defaultBudget}
                        onChange={(e) => updateLaunchConfig({ dailyBudget: parseInt(e.target.value) || 20 })}
                        className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        {selectedProfile.adAccountCurrency || 'USD'}
                      </span>
                    </div>
                  </FormField>
                  <FormField label="Test Duration" helper="Days to run before evaluation">
                    <div className="relative">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        value={launchConfig.testDuration ?? selectedProfile.defaultDuration}
                        onChange={(e) => updateLaunchConfig({ testDuration: parseInt(e.target.value) || 3 })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">days</span>
                    </div>
                  </FormField>
                </div>

                <FormField label="Campaign Bid Strategy">
                  <div className="space-y-2">
                    {[
                      { value: 'LOWEST_COST_WITHOUT_CAP' as const, label: 'Highest volume or value', desc: 'Maximize results for your budget' },
                      { value: 'COST_CAP' as const, label: 'Cost Cap', desc: 'Keep cost per result around your target' },
                      { value: 'LOWEST_COST_WITH_BID_CAP' as const, label: 'Bid Cap', desc: 'Control your bid in each auction' },
                      { value: 'LOWEST_COST_WITH_MIN_ROAS' as const, label: 'ROAS Goal', desc: 'Hit a minimum return on ad spend' },
                    ].map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 transition-colors',
                          bidStrategy === opt.value ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <input
                          type="radio"
                          name="cbo-bid-strategy"
                          value={opt.value}
                          checked={bidStrategy === opt.value}
                          onChange={() => updateLaunchConfig({ bidStrategy: opt.value })}
                          className="h-4 w-4 border-slate-300 text-blue-600"
                        />
                        <div>
                          <p className="text-sm font-medium text-slate-900">{opt.label}</p>
                          <p className="text-xs text-slate-500">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </FormField>

                {/* Bid Cap amount — at ad set level even for CBO */}
                {(bidStrategy === 'LOWEST_COST_WITH_BID_CAP' || bidStrategy === 'BID_CAP') && (
                  <FormField label="Bid Cap Amount" helper="Maximum bid per auction (applied per ad set)">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={launchConfig.bidAmount ?? ''}
                        onChange={(e) => updateLaunchConfig({ bidAmount: parseFloat(e.target.value) || undefined })}
                        placeholder="e.g. 5.00"
                        className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        {selectedProfile.adAccountCurrency || 'USD'}
                      </span>
                    </div>
                  </FormField>
                )}

                {/* Cost Cap target — at ad set level */}
                {(bidStrategy === 'COST_CAP') && (
                  <FormField label="Cost Per Result Goal" helper="Target cost per conversion (applied per ad set)">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500">$</span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={launchConfig.bidAmount ?? ''}
                        onChange={(e) => updateLaunchConfig({ bidAmount: parseFloat(e.target.value) || undefined })}
                        placeholder="e.g. 15.00"
                        className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        {selectedProfile.adAccountCurrency || 'USD'}
                      </span>
                    </div>
                  </FormField>
                )}

                {/* ROAS floor — at ad set level */}
                {(bidStrategy === 'LOWEST_COST_WITH_MIN_ROAS' || bidStrategy === 'MINIMUM_ROAS') && (
                  <FormField label="ROAS Goal" helper="Minimum return on ad spend target">
                    <div className="relative">
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={launchConfig.roasFloor ?? ''}
                        onChange={(e) => updateLaunchConfig({ roasFloor: parseFloat(e.target.value) || undefined })}
                        placeholder="e.g. 2.5"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">x</span>
                    </div>
                  </FormField>
                )}
              </div>
            ) : (
              /* ABO: full budget + bid at ad set level */
              <NewAdsetBudgetSection
                currency={selectedProfile.adAccountCurrency}
                dailyBudget={launchConfig.dailyBudget ?? selectedProfile.defaultBudget}
                testDuration={launchConfig.testDuration ?? selectedProfile.defaultDuration}
                bidStrategy={bidStrategy}
                bidAmount={launchConfig.bidAmount}
                roasFloor={launchConfig.roasFloor}
                onUpdate={updateLaunchConfig}
              />
            )}

            {/* Account & Page Settings */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Ad Account">
                <input
                  type="text"
                  value={launchConfig.adAccountId || selectedProfile.adAccountId || ''}
                  onChange={(e) => updateLaunchConfig({ adAccountId: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FormField>

              <FormField label="Facebook Page">
                <input
                  type="text"
                  value={launchConfig.pageId || selectedProfile.pageId || ''}
                  onChange={(e) => updateLaunchConfig({ pageId: e.target.value })}
                  placeholder="Page ID"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FormField>

              <FormField label="Instagram Account">
                <input
                  type="text"
                  value={launchConfig.instagramActorId || selectedProfile.instagramActorId || ''}
                  onChange={(e) => updateLaunchConfig({ instagramActorId: e.target.value })}
                  placeholder="Instagram Actor ID"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FormField>

              <FormField label="Pixel">
                <input
                  type="text"
                  value={launchConfig.pixelId || selectedProfile.pixelId || ''}
                  onChange={(e) => updateLaunchConfig({ pixelId: e.target.value })}
                  placeholder="Pixel ID"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FormField>
            </div>

            {/* Conversion Event & URL */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Conversion Event">
                <select
                  value={launchConfig.conversionEvent || selectedProfile.conversionEvent || 'Purchase'}
                  onChange={(e) => updateLaunchConfig({ conversionEvent: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {CONVERSION_EVENTS.map((event) => (
                    <option key={event} value={event}>
                      {event}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Destination URL">
                <input
                  type="url"
                  value={launchConfig.destinationUrl || selectedProfile.destinationUrl || ''}
                  onChange={(e) => updateLaunchConfig({ destinationUrl: e.target.value })}
                  placeholder="https://yourstore.com/product"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </FormField>
            </div>

            {/* Advanced Settings (collapsible) */}
            {expandedNewCampaign && (
              <div className="space-y-6 rounded-xl border border-slate-200 bg-slate-50/50 p-5">
                <h3 className="text-sm font-semibold text-slate-700">Advanced Targeting & Placement</h3>

                {/* Targeting Preset */}
                {selectedProfile.targetingPresets && selectedProfile.targetingPresets.length > 0 && (
                  <FormField label="Targeting Preset">
                    <select
                      value={launchConfig.targetingPresetId || ''}
                      onChange={(e) => updateLaunchConfig({ targetingPresetId: e.target.value || undefined })}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Custom / Broad</option>
                      {selectedProfile.targetingPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                )}

                {/* Placements */}
                <FormField label="Placements">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {PLACEMENT_OPTIONS.map((placement) => {
                      const isChecked = selectedPlacements.includes(placement.id);
                      return (
                        <label
                          key={placement.id}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs transition-colors',
                            isChecked
                              ? 'border-blue-400 bg-blue-50 text-blue-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setSelectedPlacements((prev) =>
                                isChecked ? prev.filter((p) => p !== placement.id) : [...prev, placement.id]
                              );
                            }}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          {placement.label}
                        </label>
                      );
                    })}
                  </div>
                </FormField>

                {/* Age & Gender */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="Age Min">
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={launchConfig.customTargeting?.ageMin ?? 18}
                      onChange={(e) =>
                        updateLaunchConfig({
                          customTargeting: {
                            ...launchConfig.customTargeting,
                            ageMin: parseInt(e.target.value) || 18,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </FormField>

                  <FormField label="Age Max">
                    <input
                      type="number"
                      min={18}
                      max={65}
                      value={launchConfig.customTargeting?.ageMax ?? 65}
                      onChange={(e) =>
                        updateLaunchConfig({
                          customTargeting: {
                            ...launchConfig.customTargeting,
                            ageMax: parseInt(e.target.value) || 65,
                          },
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </FormField>

                  <FormField label="Gender">
                    <select
                      value={
                        launchConfig.customTargeting?.genders?.length === 1
                          ? launchConfig.customTargeting.genders[0]
                          : 0
                      }
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateLaunchConfig({
                          customTargeting: {
                            ...launchConfig.customTargeting,
                            genders: val === 0 ? [] : [val],
                          },
                        });
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={0}>All Genders</option>
                      <option value={1}>Male</option>
                      <option value={2}>Female</option>
                    </select>
                  </FormField>
                </div>

                {/* Geo Locations */}
                <FormField label="Countries" helper="Comma-separated country codes">
                  <input
                    type="text"
                    value={
                      launchConfig.customTargeting?.geoLocations?.countries?.join(', ') || 'US'
                    }
                    onChange={(e) =>
                      updateLaunchConfig({
                        customTargeting: {
                          ...launchConfig.customTargeting,
                          geoLocations: {
                            ...launchConfig.customTargeting?.geoLocations,
                            countries: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                          },
                        },
                      })
                    }
                    placeholder="US, CA, GB"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </FormField>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Sub-components ──

function CampaignModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-start gap-4 rounded-2xl border-2 p-6 text-left transition-all',
        selected
          ? 'border-blue-500 bg-blue-50/30 shadow-lg shadow-blue-100/60'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
      )}
    >
      <div
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition-colors',
          selected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3
          className={cn(
            'text-sm font-semibold',
            selected ? 'text-blue-900' : 'text-slate-900'
          )}
        >
          {title}
        </h3>
        <p
          className={cn(
            'mt-0.5 text-xs',
            selected ? 'text-blue-700' : 'text-slate-500'
          )}
        >
          {description}
        </p>
      </div>
    </button>
  );
}

function FormField({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
    </div>
  );
}

function NewAdsetBudgetSection({
  currency,
  dailyBudget,
  testDuration,
  bidStrategy,
  bidAmount,
  roasFloor,
  onUpdate,
}: {
  currency: string;
  dailyBudget: number;
  testDuration: number;
  bidStrategy: BidStrategy;
  bidAmount?: number;
  roasFloor?: number;
  onUpdate: (partial: Partial<import('@/types/creativeHub').LaunchConfig>) => void;
}) {
  const selectedBid = BID_STRATEGIES.find((b) => b.value === bidStrategy);

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700">Budget & Bid</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Daily Budget */}
        <FormField label="Daily Budget" helper={`Per ad set in ${currency}`}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
              $
            </span>
            <input
              type="number"
              min={1}
              value={dailyBudget}
              onChange={(e) => onUpdate({ dailyBudget: parseInt(e.target.value) || 0 })}
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-7 pr-16 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              {currency}
            </span>
          </div>
        </FormField>

        {/* Test Duration */}
        <FormField label="Test Duration" helper="Days to run before evaluation">
          <div className="relative">
            <input
              type="number"
              min={1}
              max={90}
              value={testDuration}
              onChange={(e) => onUpdate({ testDuration: parseInt(e.target.value) || 3 })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
              days
            </span>
          </div>
        </FormField>
      </div>

      {/* Bid Strategy */}
      <FormField label="Bid Strategy">
        <div className="space-y-2">
          {BID_STRATEGIES.map((strategy) => {
            const isSelected = bidStrategy === strategy.value;
            return (
              <div key={strategy.value}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 transition-all',
                    isSelected
                      ? 'border-blue-500 bg-blue-50/30'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <input
                    type="radio"
                    name="bidStrategy"
                    checked={isSelected}
                    onChange={() => onUpdate({ bidStrategy: strategy.value })}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900">{strategy.label}</p>
                    <p className="text-xs text-slate-500">{strategy.description}</p>
                  </div>
                </label>

                {/* Conditional input for cost cap / bid cap */}
                {isSelected && strategy.hasInput === 'amount' && (
                  <div className="ml-7 mt-2">
                    <div className="relative w-48">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        $
                      </span>
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={bidAmount ?? ''}
                        onChange={(e) => onUpdate({ bidAmount: parseFloat(e.target.value) || undefined })}
                        placeholder={strategy.value === 'COST_CAP' ? 'Target CPA' : 'Max bid'}
                        className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        {currency}
                      </span>
                    </div>
                  </div>
                )}

                {/* Conditional input for ROAS floor */}
                {isSelected && strategy.hasInput === 'roas' && (
                  <div className="ml-7 mt-2">
                    <div className="relative w-48">
                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={roasFloor ?? ''}
                        onChange={(e) => onUpdate({ roasFloor: parseFloat(e.target.value) || undefined })}
                        placeholder="Min ROAS (e.g. 2.0)"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-14 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                        ROAS
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </FormField>
    </section>
  );
}
