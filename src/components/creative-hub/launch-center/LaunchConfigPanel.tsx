'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Loader2,
  Plus,
  Settings,
  Target,
} from 'lucide-react';

import {
  COUNTRY_OPTIONS,
  WORLDWIDE_COUNTRY_VALUE,
  dedupeCountryCodes,
  getCountryLabel,
  normalizeCountryCode,
  parseCountryInput,
} from '@/lib/countryOptions';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type {
  BidStrategy,
  CreativeBatch,
  LaunchConfig,
  ProductCampaignLink,
  TargetingSpec,
} from '@/types/creativeHub';

interface LaunchConfigPanelProps {
  batches: CreativeBatch[];
  productProfileId?: string;
  showOverviewButton?: boolean;
  onOverviewLaunch?: () => void;
}

interface FetchedAdset {
  id: string;
  name: string;
  spend: number;
  status: string;
}

interface FetchedCampaign {
  campaignId: string;
  campaignName: string;
  campaignType: ProductCampaignLink['campaignType'];
  adAccountId: string;
  isActive: boolean;
  effectiveStatus?: string;
  campaignDailyBudget?: number;
  campaignLifetimeBudget?: number | null;
  campaignBidStrategy?: string;
}

interface StoreLocationSuggestions {
  includedCountries: string[];
  excludedCountries: string[];
  sourceAdsetCount: number;
  latestSyncedAt?: string | null;
}

function inferCampaignType(campaignName?: string): ProductCampaignLink['campaignType'] {
  const name = String(campaignName || '').toLowerCase();
  if (name.includes('retarget')) return 'retargeting';
  if (name.includes('scale')) return 'scaling';
  return 'testing';
}

function isCboCampaign(campaign?: ProductCampaignLink): boolean {
  return Boolean(
    campaign &&
      ((campaign.campaignDailyBudget ?? 0) > 0 || (campaign.campaignLifetimeBudget ?? 0) > 0),
  );
}

function formatMoney(value?: number): string {
  if (!Number.isFinite(value)) return '$0';
  return `$${Number(value).toFixed(0)}`;
}

function getBidStrategyLabel(value?: string): string {
  if (!value) return 'Highest volume or value';
  if (value === 'LOWEST_COST' || value === 'LOWEST_COST_WITHOUT_CAP') return 'Highest volume or value';
  if (value === 'BID_CAP' || value === 'LOWEST_COST_WITH_BID_CAP') return 'Bid Cap';
  if (value === 'COST_CAP') return 'Cost Cap';
  if (value === 'MINIMUM_ROAS' || value === 'LOWEST_COST_WITH_MIN_ROAS') return 'ROAS Goal';
  return 'Highest volume or value';
}

function shouldShowBidAmount(strategy?: string): boolean {
  return (
    strategy === 'BID_CAP' ||
    strategy === 'LOWEST_COST_WITH_BID_CAP' ||
    strategy === 'COST_CAP'
  );
}

function shouldShowRoas(strategy?: string): boolean {
  return strategy === 'MINIMUM_ROAS' || strategy === 'LOWEST_COST_WITH_MIN_ROAS';
}

function buildSuggestedCampaignName(productName?: string): string {
  if (!productName) return 'New Creative Test Campaign';
  const today = new Date().toISOString().slice(0, 10);
  return `${productName} | Creative Test ${today}`;
}

const DEFAULT_ATTRIBUTION_WINDOW = '7d_click_1d_engagement';
const DEFAULT_BID_STRATEGY: BidStrategy = 'LOWEST_COST_WITHOUT_CAP';

const ATTRIBUTION_WINDOW_OPTIONS = [
  { value: '7d_click_1d_engagement', label: '7-day click, 1-day engagement' },
  { value: '7d_click', label: '7-day click' },
  { value: '1d_click', label: '1-day click' },
  { value: '7d_click_1d_view', label: '7-day click, 1-day view' },
  { value: '1d_click_1d_view', label: '1-day click, 1-day view' },
];

type CountryListKind = 'included' | 'excluded';

function inferCountryFromUrl(value?: string): string | undefined {
  try {
    const hostname = new URL(value || '').hostname.toLowerCase();
    if (hostname.endsWith('.in')) return 'IN';
    if (hostname.endsWith('.ca')) return 'CA';
    if (hostname.endsWith('.co.uk') || hostname.endsWith('.uk')) return 'GB';
    if (hostname.endsWith('.com.au') || hostname.endsWith('.au')) return 'AU';
    if (hostname.endsWith('.ae')) return 'AE';
    if (hostname.endsWith('.sg')) return 'SG';
    if (hostname.endsWith('.de')) return 'DE';
    if (hostname.endsWith('.fr')) return 'FR';
    if (hostname.endsWith('.it')) return 'IT';
    if (hostname.endsWith('.es')) return 'ES';
  } catch {
    return undefined;
  }
  return undefined;
}

function inferCountryFromCurrency(value?: string): string | undefined {
  const map: Record<string, string> = {
    INR: 'IN',
    USD: 'US',
    CAD: 'CA',
    GBP: 'GB',
    AUD: 'AU',
    AED: 'AE',
    SGD: 'SG',
    EUR: 'DE',
  };
  return map[String(value || '').trim().toUpperCase()];
}

function formatCountryCount(count: number, kind: CountryListKind): string {
  const noun = kind === 'included' ? 'included' : 'excluded';
  return `${count} ${noun}`;
}

function mergeTargeting(
  current: TargetingSpec | undefined,
  patch: Partial<TargetingSpec>,
): TargetingSpec {
  return {
    ...(current || {}),
    ...patch,
  };
}

export function LaunchConfigPanel({
  batches,
  productProfileId,
  showOverviewButton = false,
  onOverviewLaunch,
}: LaunchConfigPanelProps) {
  const profiles = useCreativeHubStore((state) => state.profiles);
  const launchConfig = useCreativeHubStore((state) => state.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((state) => state.updateLaunchConfig);
  const inboxCreatives = useCreativeHubStore((state) => state.inboxCreatives);
  const selectedCreativeIds = useCreativeHubStore((state) => state.selectedCreativeIds);

  const { activeStoreId, stores } = useStoreStore();

  const [fetchedCampaigns, setFetchedCampaigns] = useState<FetchedCampaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignAdsets, setCampaignAdsets] = useState<FetchedAdset[]>([]);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [adsetDropdownOpen, setAdsetDropdownOpen] = useState(false);
  const [includeCountryPaste, setIncludeCountryPaste] = useState('');
  const [excludeCountryPaste, setExcludeCountryPaste] = useState('');
  const [countryListModal, setCountryListModal] = useState<CountryListKind | null>(null);
  const [storeLocationSuggestions, setStoreLocationSuggestions] =
    useState<StoreLocationSuggestions | null>(null);
  const [locationSuggestionsLoading, setLocationSuggestionsLoading] = useState(false);
  const [locationSuggestionsResolved, setLocationSuggestionsResolved] = useState(false);
  const adsetDropdownRef = useRef<HTMLDivElement | null>(null);

  const selectedProfile = useMemo(() => {
    const pid = productProfileId ?? launchConfig.productProfileId;
    return profiles.find((profile) => profile.id === pid);
  }, [launchConfig.productProfileId, productProfileId, profiles]);

  const selectedCreatives = useMemo(
    () => inboxCreatives.filter((creative) => selectedCreativeIds.has(creative.id)),
    [inboxCreatives, selectedCreativeIds],
  );

  const campaignMode = launchConfig.campaignMode ?? 'existing';
  const adsetMode = launchConfig.adsetMode ?? 'new_adsets';
  const adsetAssignments = useMemo(
    () => launchConfig.existingAdsetAssignments || {},
    [launchConfig.existingAdsetAssignments],
  );
  const selectedAdsetIds = useMemo(
    () =>
      Object.entries(adsetAssignments)
        .filter(([, assignedIds]) => Array.isArray(assignedIds) && assignedIds.length > 0)
        .map(([adsetId]) => adsetId),
    [adsetAssignments],
  );
  const resolvedStoreId = activeStoreId || selectedProfile?.storeId || '';
  const activeStore = useMemo(
    () => stores.find((store) => store.id === resolvedStoreId),
    [resolvedStoreId, stores],
  );

  useEffect(() => {
    if (!resolvedStoreId || !selectedProfile?.adAccountId) {
      setStoreLocationSuggestions(null);
      setLocationSuggestionsLoading(false);
      setLocationSuggestionsResolved(true);
      return;
    }

    let active = true;

    const fetchLocationSuggestions = async () => {
      setLocationSuggestionsLoading(true);
      setLocationSuggestionsResolved(false);
      try {
        const params = new URLSearchParams({
          storeId: resolvedStoreId,
          adAccountId: selectedProfile.adAccountId,
        });
        const response = await fetch(`/api/creative-hub/launch/location-suggestions?${params.toString()}`);
        const data = await response.json();
        if (!active) return;
        setStoreLocationSuggestions({
          includedCountries: dedupeCountryCodes(data.includedCountries || []),
          excludedCountries: dedupeCountryCodes(data.excludedCountries || []).filter(
            (countryCode) => countryCode !== WORLDWIDE_COUNTRY_VALUE,
          ),
          sourceAdsetCount: Number(data.sourceAdsetCount || 0),
          latestSyncedAt: data.latestSyncedAt || null,
        });
      } catch {
        if (active) setStoreLocationSuggestions(null);
      } finally {
        if (active) {
          setLocationSuggestionsLoading(false);
          setLocationSuggestionsResolved(true);
        }
      }
    };

    void fetchLocationSuggestions();

    return () => {
      active = false;
    };
  }, [resolvedStoreId, selectedProfile?.adAccountId]);

  useEffect(() => {
    if (!adsetDropdownOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (!adsetDropdownRef.current?.contains(event.target as Node)) {
        setAdsetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [adsetDropdownOpen]);

  useEffect(() => {
    if (adsetMode !== 'existing_adsets') {
      setAdsetDropdownOpen(false);
    }
  }, [adsetMode]);

  useEffect(() => {
    if (!selectedProfile?.adAccountId || !resolvedStoreId) {
      setFetchedCampaigns([]);
      setCampaignsLoading(false);
      return;
    }

    let active = true;

    const fetchCampaigns = async () => {
      setCampaignsLoading(true);
      setFetchedCampaigns([]);
      try {
        const cachedParams = new URLSearchParams({
          storeId: resolvedStoreId,
          accountId: selectedProfile.adAccountId,
          preferCache: '1',
        });
        const cachedResponse = await fetch(`/api/meta/campaigns?${cachedParams.toString()}`);
        const cachedData = await cachedResponse.json();
        const cachedRows = Array.isArray(cachedData.data) ? cachedData.data : [];
        let liveRows: unknown[] = [];

        // The launch dropdown should reflect Ads Manager now, not only the latest cron cache.
        try {
          const liveParams = new URLSearchParams({
            storeId: resolvedStoreId,
            accountId: selectedProfile.adAccountId,
            forceLive: '1',
          });
          const liveResponse = await fetch(`/api/meta/campaigns?${liveParams.toString()}`);
          const liveData = await liveResponse.json();
          liveRows = Array.isArray(liveData.data) ? liveData.data : [];
        } catch {
          liveRows = [];
        }

        if (!active) return;

        const campaignRowsById = new Map<string, Record<string, unknown>>();
        for (const campaign of cachedRows) {
          if (campaign && typeof campaign === 'object') {
            campaignRowsById.set(String((campaign as Record<string, unknown>).id || ''), campaign as Record<string, unknown>);
          }
        }
        for (const campaign of liveRows) {
          if (campaign && typeof campaign === 'object') {
            campaignRowsById.set(String((campaign as Record<string, unknown>).id || ''), campaign as Record<string, unknown>);
          }
        }
        const campaignRows = Array.from(campaignRowsById.values()).filter((campaign) => campaign.id);

        setFetchedCampaigns(
          campaignRows.map((campaign: Record<string, unknown>) => {
            const name = String(campaign.name || 'Untitled campaign');
            const status =
              (campaign.policyInfo as { effectiveStatus?: unknown } | undefined)?.effectiveStatus ??
              campaign.status;

            const dailyBudgetRaw =
              typeof campaign.dailyBudget === 'number'
                ? campaign.dailyBudget
                : Number.parseFloat(String(campaign.dailyBudget || '0'));
            const lifetimeBudgetRaw =
              typeof campaign.lifetimeBudget === 'number'
                ? campaign.lifetimeBudget
                : Number.parseFloat(String(campaign.lifetimeBudget || '0'));

            return {
              campaignId: String(campaign.id || ''),
              campaignName: name,
              campaignType: inferCampaignType(name),
              adAccountId: String(campaign.ad_account_id || selectedProfile.adAccountId),
              isActive: String(status || '').toUpperCase() === 'ACTIVE',
              effectiveStatus: status ? String(status) : undefined,
              campaignDailyBudget: Number.isFinite(dailyBudgetRaw) ? dailyBudgetRaw : undefined,
              campaignLifetimeBudget: Number.isFinite(lifetimeBudgetRaw)
                ? lifetimeBudgetRaw
                : undefined,
              campaignBidStrategy:
                typeof campaign.bidStrategy === 'string'
                  ? campaign.bidStrategy
                  : typeof campaign.bid_strategy === 'string'
                    ? campaign.bid_strategy
                    : undefined,
            };
          }),
        );
      } catch {
        if (!active) return;
        setFetchedCampaigns([]);
      } finally {
        if (active) setCampaignsLoading(false);
      }
    };

    void fetchCampaigns();

    return () => {
      active = false;
    };
  }, [resolvedStoreId, selectedProfile?.adAccountId]);

  // Merge linked campaigns with current Meta campaigns for the selected ad account.
  const linkedCampaigns = useMemo(() => {
    const byCampaignId = new Map<string, ProductCampaignLink>();

    for (const campaign of selectedProfile?.campaignLinks ?? []) {
      if (!campaign.campaignId) continue;
      byCampaignId.set(campaign.campaignId, campaign);
    }

    for (const fetched of fetchedCampaigns) {
      if (!fetched.campaignId) continue;
      const existing = byCampaignId.get(fetched.campaignId);
      if (existing) {
        byCampaignId.set(fetched.campaignId, {
          ...existing,
          campaignName: existing.campaignName || fetched.campaignName,
          campaignType: existing.campaignType || fetched.campaignType,
          isActive: fetched.isActive,
          effectiveStatus: fetched.effectiveStatus || existing.effectiveStatus,
          campaignDailyBudget: fetched.campaignDailyBudget ?? existing.campaignDailyBudget,
          campaignLifetimeBudget: fetched.campaignLifetimeBudget ?? existing.campaignLifetimeBudget,
          campaignBidStrategy: fetched.campaignBidStrategy ?? existing.campaignBidStrategy,
        });
        continue;
      }

      byCampaignId.set(fetched.campaignId, {
        id: `meta-${fetched.campaignId}`,
        productProfileId: selectedProfile?.id || '',
        campaignId: fetched.campaignId,
        campaignName: fetched.campaignName,
        campaignType: fetched.campaignType,
        adAccountId: fetched.adAccountId,
        pageId: selectedProfile?.pageId,
        pageName: selectedProfile?.pageName,
        pixelId: selectedProfile?.pixelId,
        pixelName: selectedProfile?.pixelName,
        instagramActorId: selectedProfile?.instagramActorId,
        instagramUsername: selectedProfile?.instagramUsername,
        isActive: fetched.isActive,
        linkedAt: new Date().toISOString(),
        effectiveStatus: fetched.effectiveStatus,
        campaignDailyBudget: fetched.campaignDailyBudget,
        campaignLifetimeBudget: fetched.campaignLifetimeBudget,
        campaignBidStrategy: fetched.campaignBidStrategy,
      });
    }

    return Array.from(byCampaignId.values())
      .sort((a, b) => {
        const aActive = a.effectiveStatus === 'ACTIVE' || (!a.effectiveStatus && a.isActive);
        const bActive = b.effectiveStatus === 'ACTIVE' || (!b.effectiveStatus && b.isActive);
        if (aActive !== bActive) return aActive ? -1 : 1;
        return a.campaignName.localeCompare(b.campaignName);
      });
  }, [fetchedCampaigns, selectedProfile]);

  const selectedCampaign = useMemo(
    () =>
      linkedCampaigns.find((campaign) => campaign.campaignId === launchConfig.existingCampaignId) ||
      (!launchConfig.existingCampaignId ? linkedCampaigns[0] : undefined),
    [launchConfig.existingCampaignId, linkedCampaigns],
  );

  const selectedCampaignId = selectedCampaign?.campaignId || launchConfig.existingCampaignId;

  // Old flow: fetch ad sets live whenever existing campaign is selected.
  const fetchAdsets = useCallback(
    async (campaignId: string) => {
      if (!resolvedStoreId) return;
      setAdsetsLoading(true);
      setCampaignAdsets([]);
      try {
        const params = new URLSearchParams({
          storeId: resolvedStoreId,
          campaignId,
        });
        const response = await fetch(`/api/meta/adsets?${params.toString()}`);
        const data = await response.json();
        const adsetRows = data.data ?? data.adsets ?? [];

        if (Array.isArray(adsetRows) && adsetRows.length > 0) {
          setCampaignAdsets(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            adsetRows.map((adset: any) => ({
              id: String(adset.id ?? ''),
              name: String(adset.name || 'Untitled'),
              spend:
                typeof adset.metrics?.spend === 'number'
                  ? adset.metrics.spend
                  : Number.parseFloat(String(adset.metrics?.spend || '0')),
              status: String(adset.status || 'UNKNOWN'),
            })),
          );
        }
      } catch {
        // Keep silent; UI will show empty state.
      } finally {
        setAdsetsLoading(false);
      }
    },
    [resolvedStoreId],
  );

  useEffect(() => {
    if (campaignMode === 'existing' && selectedCampaignId) {
      void fetchAdsets(selectedCampaignId);
      return;
    }
    setCampaignAdsets([]);
  }, [campaignMode, fetchAdsets, selectedCampaignId]);

  const existingCampaignStructure =
    selectedCampaign
      ? isCboCampaign(selectedCampaign)
        ? 'CBO'
        : 'ABO'
      : launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';
  const existingCampaignIsCbo = campaignMode === 'existing' && existingCampaignStructure === 'CBO';

  const structure =
    campaignMode === 'existing'
      ? existingCampaignStructure
      : launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';

  const derivedBidStrategy =
    (campaignMode === 'existing' && selectedCampaign?.campaignBidStrategy
      ? selectedCampaign.campaignBidStrategy
      : launchConfig.bidStrategy ?? DEFAULT_BID_STRATEGY) as
      | BidStrategy
      | string;
  const newCampaignBidStrategy = (launchConfig.bidStrategy ??
    DEFAULT_BID_STRATEGY) as BidStrategy;

  const currency = selectedProfile?.adAccountCurrency || 'USD';

  const dailyBudget =
    existingCampaignIsCbo && Number.isFinite(selectedCampaign?.campaignDailyBudget)
      ? Number(selectedCampaign?.campaignDailyBudget)
      : launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 20;

  const duration = launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 3;
  const launchTime = launchConfig.launchTime ?? 'immediately';
  const scheduledDate = launchConfig.scheduledDate ?? '';
  const scheduledTime = launchConfig.scheduledTime ?? '09:00';
  const attributionWindow = launchConfig.attributionWindow ?? DEFAULT_ATTRIBUTION_WINDOW;
  const inferredIncludedCountry = useMemo(
    () =>
      inferCountryFromUrl(selectedProfile?.destinationUrl) ||
      inferCountryFromUrl(activeStore?.domain) ||
      inferCountryFromCurrency(selectedProfile?.adAccountCurrency) ||
      'US',
    [activeStore?.domain, selectedProfile?.adAccountCurrency, selectedProfile?.destinationUrl],
  );
  const learnedIncludedCountries = useMemo(
    () => dedupeCountryCodes(storeLocationSuggestions?.includedCountries || []),
    [storeLocationSuggestions?.includedCountries],
  );
  const learnedExcludedCountries = useMemo(
    () =>
      dedupeCountryCodes(storeLocationSuggestions?.excludedCountries || []).filter(
        (countryCode) => countryCode !== WORLDWIDE_COUNTRY_VALUE,
      ),
    [storeLocationSuggestions?.excludedCountries],
  );
  const defaultIncludedCountries = useMemo(
    () => (learnedIncludedCountries.length > 0 ? learnedIncludedCountries : [inferredIncludedCountry]),
    [inferredIncludedCountry, learnedIncludedCountries],
  );
  const includedCountries = useMemo(
    () =>
      dedupeCountryCodes(launchConfig.customTargeting?.geoLocations?.countries || []),
    [launchConfig.customTargeting?.geoLocations?.countries],
  );
  const displayedIncludedCountries = includedCountries.length > 0 ? includedCountries : defaultIncludedCountries;
  const includesWorldwide = displayedIncludedCountries.includes(WORLDWIDE_COUNTRY_VALUE);
  const excludedCountries = useMemo(
    () =>
      dedupeCountryCodes(launchConfig.customTargeting?.excludedGeoLocations?.countries || []),
    [launchConfig.customTargeting?.excludedGeoLocations?.countries],
  );
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const totalAdSets = batches.length;
  const totalAds = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.creativeIds.length, 0),
    [batches],
  );

  const updateIncludedCountries = (countryCodes: string[]) => {
    const normalized = dedupeCountryCodes(countryCodes);
    const nextIncludedCountries = normalized.includes(WORLDWIDE_COUNTRY_VALUE)
      ? [WORLDWIDE_COUNTRY_VALUE]
      : normalized.length > 0
        ? normalized
        : defaultIncludedCountries;
    updateLaunchConfig({
      customTargeting: mergeTargeting(launchConfig.customTargeting, {
        geoLocations: {
          ...(launchConfig.customTargeting?.geoLocations || {}),
          countries: nextIncludedCountries,
        },
        excludedGeoLocations: {
          ...(launchConfig.customTargeting?.excludedGeoLocations || {}),
          countries: excludedCountries.filter((countryCode) => !nextIncludedCountries.includes(countryCode)),
        },
      }),
    });
  };

  const addIncludedCountries = (countryCodes: string[]) => {
    const normalized = dedupeCountryCodes(countryCodes);
    if (normalized.includes(WORLDWIDE_COUNTRY_VALUE)) {
      updateIncludedCountries([WORLDWIDE_COUNTRY_VALUE]);
      return;
    }
    updateIncludedCountries([
      ...(includesWorldwide ? [] : displayedIncludedCountries),
      ...normalized,
    ]);
  };

  const updateExcludedCountries = (countryCodes: string[]) => {
    const normalized = dedupeCountryCodes(countryCodes).filter(
      (countryCode) => countryCode !== WORLDWIDE_COUNTRY_VALUE && !displayedIncludedCountries.includes(countryCode),
    );
    updateLaunchConfig({
      customTargeting: mergeTargeting(launchConfig.customTargeting, {
        excludedGeoLocations: {
          ...(launchConfig.customTargeting?.excludedGeoLocations || {}),
          countries: normalized,
        },
      }),
    });
  };

  const addExcludedCountries = (countryCodes: string[]) => {
    updateExcludedCountries([...excludedCountries, ...countryCodes]);
  };

  const removeExcludedCountry = (countryCode: string) => {
    const normalized = normalizeCountryCode(countryCode);
    updateExcludedCountries(excludedCountries.filter((code) => code !== normalized));
  };

  const removeIncludedCountry = (countryCode: string) => {
    const normalized = normalizeCountryCode(countryCode);
    updateIncludedCountries(displayedIncludedCountries.filter((code) => code !== normalized));
  };

  const handleBulkCountryPaste = (kind: CountryListKind) => {
    const rawValue = kind === 'included' ? includeCountryPaste : excludeCountryPaste;
    const parsedCountries = parseCountryInput(rawValue);
    if (parsedCountries.length === 0) return;

    if (kind === 'included') {
      addIncludedCountries(parsedCountries);
      setIncludeCountryPaste('');
    } else {
      addExcludedCountries(parsedCountries);
      setExcludeCountryPaste('');
    }
  };

  useEffect(() => {
    const patch: Partial<LaunchConfig> = {};

    if (!launchConfig.productProfileId && selectedProfile?.id) {
      patch.productProfileId = selectedProfile.id;
    }

    if (!launchConfig.campaignMode) {
      patch.campaignMode = linkedCampaigns.length > 0 ? 'existing' : 'new';
    }

    if ((launchConfig.campaignMode ?? (linkedCampaigns.length > 0 ? 'existing' : 'new')) === 'existing') {
      if (selectedCampaign && !launchConfig.existingCampaignId) {
        patch.existingCampaignId = selectedCampaign.campaignId;
      }
      if (selectedCampaign?.pageId && launchConfig.pageId !== selectedCampaign.pageId) {
        patch.pageId = selectedCampaign.pageId;
      }
      if (
        selectedCampaign?.instagramActorId &&
        launchConfig.instagramActorId !== selectedCampaign.instagramActorId
      ) {
        patch.instagramActorId = selectedCampaign.instagramActorId;
      }
      if (selectedCampaign?.pixelId && launchConfig.pixelId !== selectedCampaign.pixelId) {
        patch.pixelId = selectedCampaign.pixelId;
      }
      if (!launchConfig.adsetMode) {
        patch.adsetMode = 'new_adsets';
      }
      const expectedStructure = selectedCampaign
        ? isCboCampaign(selectedCampaign)
          ? 'CBO'
          : 'ABO'
        : undefined;
      if (expectedStructure && launchConfig.structure !== expectedStructure) {
        patch.structure = expectedStructure;
      }
      if (existingCampaignIsCbo && Number.isFinite(selectedCampaign?.campaignDailyBudget)) {
        const campaignBudget = Number(selectedCampaign?.campaignDailyBudget);
        if (campaignBudget > 0 && launchConfig.dailyBudget !== campaignBudget) {
          patch.dailyBudget = campaignBudget;
        }
      }
    } else {
      if (launchConfig.adsetMode !== 'new_adsets') {
        patch.adsetMode = 'new_adsets';
      }
      if (!launchConfig.newCampaignName) {
        patch.newCampaignName = buildSuggestedCampaignName(selectedProfile?.productName);
      }
      if (!launchConfig.structure) {
        patch.structure = selectedProfile?.defaultStructure ?? 'ABO';
      }
    }

    if (!launchConfig.bidStrategy) {
      patch.bidStrategy = DEFAULT_BID_STRATEGY;
    }
    if (launchConfig.dailyBudget == null && selectedProfile?.defaultBudget != null) {
      patch.dailyBudget = selectedProfile.defaultBudget;
    }
    if (launchConfig.testDuration == null && selectedProfile?.defaultDuration != null) {
      patch.testDuration = selectedProfile.defaultDuration;
    }
    if (!launchConfig.launchStatus && selectedProfile?.defaultLaunchStatus) {
      patch.launchStatus = selectedProfile.defaultLaunchStatus;
    }
    if (!launchConfig.launchTime) {
      patch.launchTime = 'immediately';
    }
    if (!launchConfig.scheduledTime) {
      patch.scheduledTime = '09:00';
    }
    if (!launchConfig.attributionWindow) {
      patch.attributionWindow = DEFAULT_ATTRIBUTION_WINDOW;
    }
    if (locationSuggestionsResolved) {
      const customTargetingPatch: Partial<TargetingSpec> = {};
      const currentIncludedCountries = dedupeCountryCodes(
        launchConfig.customTargeting?.geoLocations?.countries || [],
      );
      const hasOnlyFallbackIncludedCountry =
        currentIncludedCountries.length === 1 &&
        currentIncludedCountries[0] === inferredIncludedCountry;
      const learnedHasMoreSpecificIncludedCountries =
        learnedIncludedCountries.length > 0 &&
        (
          learnedIncludedCountries.length !== currentIncludedCountries.length ||
          learnedIncludedCountries.some((countryCode) => !currentIncludedCountries.includes(countryCode))
        );

      if (
        (!currentIncludedCountries.length && defaultIncludedCountries.length > 0) ||
        (hasOnlyFallbackIncludedCountry && learnedHasMoreSpecificIncludedCountries)
      ) {
        customTargetingPatch.geoLocations = {
          ...(launchConfig.customTargeting?.geoLocations || {}),
          countries: defaultIncludedCountries,
        };
      }
      if (
        !launchConfig.customTargeting?.excludedGeoLocations?.countries?.length &&
        learnedExcludedCountries.length > 0
      ) {
        customTargetingPatch.excludedGeoLocations = {
          ...(launchConfig.customTargeting?.excludedGeoLocations || {}),
          countries: learnedExcludedCountries,
        };
      }
      if (Object.keys(customTargetingPatch).length > 0) {
        patch.customTargeting = mergeTargeting(launchConfig.customTargeting, customTargetingPatch);
      }
    }
    if (launchConfig.launchTime === 'scheduled' && !launchConfig.scheduledDate) {
      patch.scheduledDate = today;
    }

    if (Object.keys(patch).length > 0) {
      updateLaunchConfig(patch);
    }
  }, [
    existingCampaignIsCbo,
    launchConfig.adsetMode,
    launchConfig.attributionWindow,
    launchConfig.bidStrategy,
    launchConfig.campaignMode,
    launchConfig.customTargeting,
    launchConfig.dailyBudget,
    launchConfig.existingCampaignId,
    launchConfig.instagramActorId,
    launchConfig.launchStatus,
    launchConfig.launchTime,
    launchConfig.newCampaignName,
    launchConfig.pageId,
    launchConfig.pixelId,
    launchConfig.productProfileId,
    launchConfig.scheduledDate,
    launchConfig.scheduledTime,
    launchConfig.structure,
    launchConfig.testDuration,
    defaultIncludedCountries,
    inferredIncludedCountry,
    learnedIncludedCountries,
    learnedExcludedCountries,
    linkedCampaigns.length,
    locationSuggestionsResolved,
    selectedCampaign,
    selectedProfile,
    today,
    updateLaunchConfig,
  ]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-[#101b31]/80">
      <div className="mb-4 flex items-center gap-2">
        <Settings size={16} className="text-slate-500 dark:text-slate-300" />
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Launch Config</span>
      </div>

      <div className="space-y-4">
        <FormField label="Product Profile">
          <select
            value={productProfileId ?? launchConfig.productProfileId ?? ''}
            onChange={(event) =>
              updateLaunchConfig({
                productProfileId: event.target.value,
                existingCampaignId: undefined,
                existingAdsetAssignments: undefined,
              })
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
          >
            <option value="">Select profile...</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.productName}
              </option>
            ))}
          </select>
        </FormField>

        {selectedProfile && (
          <>
            <SectionTitle
              title="Campaign Mode"
              description="Add creatives to an existing campaign or create a new one."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard
                icon={FolderOpen}
                title="Use Existing Campaign"
                description="Add new ad sets or ads to a campaign that's already running"
                selected={campaignMode === 'existing'}
                onClick={() => updateLaunchConfig({ campaignMode: 'existing' })}
              />
              <ModeCard
                icon={Plus}
                title="Create New Campaign"
                description="Set up a brand new campaign with full control over settings"
                selected={campaignMode === 'new'}
                onClick={() =>
                  updateLaunchConfig({
                    campaignMode: 'new',
                    adsetMode: 'new_adsets',
                    existingCampaignId: undefined,
                    existingAdsetAssignments: undefined,
                  })
                }
              />
            </div>
          </>
        )}

        {selectedProfile && campaignMode === 'existing' && (
          <>
            <SectionTitle
              title="Select Campaign"
              description="Choose which campaign to add your new creatives to."
            />

            {linkedCampaigns.length > 0 ? (
              <>
                <div className="relative">
                  <select
                    value={selectedCampaign?.campaignId || ''}
                    onChange={(event) =>
                      updateLaunchConfig({
                        existingCampaignId: event.target.value,
                        existingAdsetAssignments: undefined,
                      })
                    }
                    className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                  >
                    {linkedCampaigns.map((campaign) => (
                      <option key={campaign.id} value={campaign.campaignId}>
                        {campaign.campaignName} • {isCboCampaign(campaign) ? 'CBO' : 'ABO'} • {campaign.effectiveStatus || (campaign.isActive ? 'ACTIVE' : 'PAUSED')}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                </div>

                {selectedCampaign ? (
                  <div className="rounded-lg border border-blue-300 bg-blue-50/70 p-3 dark:border-blue-500/50 dark:bg-blue-900/20">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedCampaign.campaignName}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span>
                        {selectedCampaign.campaignType.charAt(0).toUpperCase() +
                          selectedCampaign.campaignType.slice(1)}
                      </span>
                      <span>&middot;</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        {selectedCampaign.effectiveStatus || (selectedCampaign.isActive ? 'ACTIVE' : 'PAUSED')}
                      </span>
                      <span
                        className={cn(
                          'ml-1 inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          isCboCampaign(selectedCampaign)
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-400/20 dark:text-blue-200'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-400/20 dark:text-amber-200',
                        )}
                      >
                        {isCboCampaign(selectedCampaign) ? 'CBO' : 'ABO'}
                      </span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-300">
                {campaignsLoading
                  ? 'Loading campaigns for this product profile...'
                  : 'No campaigns found for this product profile.'}
              </div>
            )}
          </>
        )}

        {selectedProfile && campaignMode === 'existing' && selectedCampaign && (
          <>
            <SectionTitle
              title="Ad Set Mode"
              description="Create new ad sets or add creatives to existing ones."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ModeCard
                icon={Plus}
                title="Create New Ad Sets"
                description="Create fresh ad sets with your selected creatives"
                selected={adsetMode === 'new_adsets'}
                onClick={() => updateLaunchConfig({ adsetMode: 'new_adsets' })}
              />
              <ModeCard
                icon={FolderOpen}
                title="Use Existing Ad Sets"
                description="Add creatives inside current ad sets and keep their live setup"
                selected={adsetMode === 'existing_adsets'}
                onClick={() => updateLaunchConfig({ adsetMode: 'existing_adsets' })}
              />
            </div>
          </>
        )}

        {selectedProfile && campaignMode === 'existing' && selectedCampaign && adsetMode === 'new_adsets' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Ad Set Settings</p>

            {existingCampaignIsCbo ? (
              <>
                <div className="flex items-start gap-2 rounded-lg border border-blue-300 bg-blue-50/80 p-3 dark:border-blue-500/50 dark:bg-blue-900/20">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-300" />
                  <div className="text-xs text-blue-800 dark:text-blue-200">
                    <p className="font-medium">CBO Campaign — Advantage+ Campaign Budget</p>
                    <p className="mt-0.5">
                      Budget: <span className="font-semibold">{formatMoney(selectedCampaign.campaignDailyBudget)}/day</span> at campaign level.
                      {' '}Bid Strategy: <span className="font-semibold">{getBidStrategyLabel(selectedCampaign.campaignBidStrategy)}</span>
                    </p>
                  </div>
                </div>

                <FormField label="Test Duration" helper="Days to run before evaluation">
                  <NumberWithSuffix
                    min={1}
                    max={90}
                    suffix="days"
                    value={duration}
                    onChange={(value) => updateLaunchConfig({ testDuration: value || 3 })}
                  />
                </FormField>

                {shouldShowBidAmount(derivedBidStrategy) && (
                  <FormField
                    label={derivedBidStrategy === 'COST_CAP' ? 'Cost Per Result Goal' : 'Bid Cap Amount'}
                    helper={
                      derivedBidStrategy === 'COST_CAP'
                        ? 'Target cost per conversion (set per ad set)'
                        : 'Maximum bid per auction (set per ad set)'
                    }
                  >
                    <CurrencyInput
                      currency={currency}
                      min={0.01}
                      step={0.01}
                      value={launchConfig.bidAmount}
                      placeholder={derivedBidStrategy === 'COST_CAP' ? 'e.g. 15.00' : 'e.g. 5.00'}
                      onChange={(value) => updateLaunchConfig({ bidAmount: value })}
                    />
                  </FormField>
                )}

                {shouldShowRoas(derivedBidStrategy) && (
                  <FormField label="ROAS Goal" helper="Minimum return on ad spend target">
                    <NumberWithSuffix
                      min={0.01}
                      step={0.01}
                      suffix="x"
                      value={launchConfig.roasFloor}
                      placeholder="e.g. 2.5"
                      onChange={(value) => updateLaunchConfig({ roasFloor: value })}
                    />
                  </FormField>
                )}
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField label="Daily / Ad Set">
                    <CurrencyInput
                      currency={currency}
                      min={1}
                      step={1}
                      value={dailyBudget}
                      onChange={(value) => updateLaunchConfig({ dailyBudget: value ? Math.round(value) : 20 })}
                    />
                  </FormField>
                  <FormField label="Duration (days)">
                    <NumberWithSuffix
                      min={1}
                      max={90}
                      suffix="days"
                      value={duration}
                      onChange={(value) => updateLaunchConfig({ testDuration: value || 3 })}
                    />
                  </FormField>
                </div>

                <FormField label="Ad Set Bid Strategy">
                  <select
                    value={launchConfig.bidStrategy ?? DEFAULT_BID_STRATEGY}
                    onChange={(event) =>
                      updateLaunchConfig({
                        bidStrategy: event.target.value as BidStrategy,
                        bidAmount: event.target.value === DEFAULT_BID_STRATEGY ? undefined : launchConfig.bidAmount,
                        roasFloor: event.target.value === DEFAULT_BID_STRATEGY ? undefined : launchConfig.roasFloor,
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                  >
                    <option value="LOWEST_COST_WITHOUT_CAP">Highest volume or value</option>
                    <option value="COST_CAP">Cost Cap</option>
                    <option value="LOWEST_COST_WITH_BID_CAP">Bid Cap</option>
                    <option value="LOWEST_COST_WITH_MIN_ROAS">ROAS Goal</option>
                  </select>
                </FormField>

                {shouldShowBidAmount(launchConfig.bidStrategy) && (
                  <FormField
                    label={launchConfig.bidStrategy === 'COST_CAP' ? 'Cost Per Result Goal' : 'Bid Cap Amount'}
                  >
                    <CurrencyInput
                      currency={currency}
                      min={0.01}
                      step={0.01}
                      value={launchConfig.bidAmount}
                      onChange={(value) => updateLaunchConfig({ bidAmount: value })}
                    />
                  </FormField>
                )}

                {shouldShowRoas(launchConfig.bidStrategy) && (
                  <FormField label="ROAS Goal">
                    <NumberWithSuffix
                      min={0.01}
                      step={0.01}
                      suffix="x"
                      value={launchConfig.roasFloor}
                      onChange={(value) => updateLaunchConfig({ roasFloor: value })}
                    />
                  </FormField>
                )}
              </>
            )}
          </div>
        )}

        {selectedProfile && campaignMode === 'existing' && selectedCampaign && adsetMode === 'existing_adsets' && (
          <div className="space-y-3">
            <SectionTitle
              title="Select Ad Sets & Assign Creatives"
              description="Choose ad sets and assign specific creatives to each."
            />

            {adsetsLoading ? (
              <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-6 py-8 dark:border-slate-600 dark:bg-slate-900/40">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                <span className="text-sm text-slate-500 dark:text-slate-300">Loading ad sets...</span>
              </div>
            ) : campaignAdsets.length > 0 ? (
              <div className="space-y-3">
                <div ref={adsetDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAdsetDropdownOpen((current) => !current)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-slate-500"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Choose ad sets</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">
                        {selectedAdsetIds.length} selected out of {campaignAdsets.length}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 text-slate-400 transition-transform',
                        adsetDropdownOpen && 'rotate-180',
                      )}
                    />
                  </button>

                  {adsetDropdownOpen && (
                    <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-600 dark:bg-slate-900">
                      {campaignAdsets.map((adset) => {
                        const assignedIds = adsetAssignments[adset.id] || [];
                        const isChecked = assignedIds.length > 0;

                        return (
                          <label
                            key={adset.id}
                            className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                const next = { ...adsetAssignments };
                                if (isChecked) {
                                  delete next[adset.id];
                                } else {
                                  next[adset.id] = selectedCreatives.map((creative) => creative.id);
                                }
                                updateLaunchConfig({ existingAdsetAssignments: next });
                              }}
                              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {adset.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-300">
                                ${adset.spend.toFixed(2)} spent &middot; {adset.status}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedAdsetIds.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-600 dark:bg-slate-900/35">
                    {selectedAdsetIds.map((adsetId) => {
                      const adset = campaignAdsets.find((item) => item.id === adsetId);
                      if (!adset) return null;
                      const assignedIds = adsetAssignments[adset.id] || [];
                      return (
                        <div
                          key={adset.id}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-900/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {adset.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-300">
                                {assignedIds.length} creative{assignedIds.length !== 1 ? 's' : ''} assigned
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...adsetAssignments };
                                delete next[adset.id];
                                updateLaunchConfig({ existingAdsetAssignments: next });
                              }}
                              className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-red-200 hover:text-red-600 dark:border-slate-500 dark:text-slate-300"
                            >
                              Remove
                            </button>
                          </div>

                          {selectedCreatives.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {selectedCreatives.map((creative) => {
                                const isAssigned = assignedIds.includes(creative.id);
                                return (
                                  <button
                                    key={creative.id}
                                    type="button"
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
                                      'flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors',
                                      isAssigned
                                        ? 'border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-400 dark:bg-blue-900/35 dark:text-blue-200'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300',
                                    )}
                                  >
                                    <div className="flex h-5 w-5 items-center justify-center overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
                                      {creative.thumbnailUrl ? (
                                        <img src={creative.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                                      ) : (
                                        <ImageIcon className="h-3 w-3 text-slate-400" />
                                      )}
                                    </div>
                                    <span className="max-w-[170px] truncate">{creative.creativeName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center dark:border-slate-600 dark:bg-slate-900/40">
                <FolderOpen className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No ad sets found in this campaign.</p>
                <p className="text-xs text-slate-400 dark:text-slate-400">Choose Create New Ad Sets instead.</p>
              </div>
            )}
          </div>
        )}

        {selectedProfile && campaignMode === 'new' && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">New Campaign Settings</p>

            <FormField label="Campaign Name">
              <input
                type="text"
                value={launchConfig.newCampaignName || ''}
                onChange={(event) => updateLaunchConfig({ newCampaignName: event.target.value })}
                placeholder="Name the new campaign"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <ModeCard
                icon={Target}
                title="ABO"
                description="Budget per ad set"
                selected={structure === 'ABO'}
                onClick={() => updateLaunchConfig({ structure: 'ABO' })}
              />
              <ModeCard
                icon={Target}
                title="CBO"
                description="Budget at campaign level"
                selected={structure === 'CBO'}
                onClick={() => updateLaunchConfig({ structure: 'CBO' })}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label={structure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}>
                <CurrencyInput
                  currency={currency}
                  min={1}
                  step={1}
                  value={dailyBudget}
                  onChange={(value) => updateLaunchConfig({ dailyBudget: value ? Math.round(value) : 20 })}
                />
              </FormField>
              <FormField label="Duration (days)">
                <NumberWithSuffix
                  min={1}
                  max={90}
                  suffix="days"
                  value={duration}
                  onChange={(value) => updateLaunchConfig({ testDuration: value || 3 })}
                />
              </FormField>
            </div>

          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Launch As">
            <select
              value={launchConfig.launchStatus ?? selectedProfile?.defaultLaunchStatus ?? 'PAUSED'}
              onChange={(event) =>
                updateLaunchConfig({ launchStatus: event.target.value as 'ACTIVE' | 'PAUSED' })
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
            >
              <option value="PAUSED">Paused</option>
              <option value="ACTIVE">Active</option>
            </select>
          </FormField>

          <FormField
            label={structure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}
            helper={structure === 'CBO' ? 'Campaign-level budget model' : 'Ad set-level budget model'}
          >
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-200">
              {formatMoney(dailyBudget)} / day
            </div>
          </FormField>

          <FormField label="Attribution Settings">
            <select
              value={attributionWindow}
              onChange={(event) => updateLaunchConfig({ attributionWindow: event.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
            >
              {ATTRIBUTION_WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>

          {campaignMode === 'new' && (
            <FormField label="Campaign Bid Strategy">
              <select
                value={newCampaignBidStrategy}
                onChange={(event) =>
                  updateLaunchConfig({
                    bidStrategy: event.target.value as BidStrategy,
                    bidAmount: event.target.value === DEFAULT_BID_STRATEGY ? undefined : launchConfig.bidAmount,
                    roasFloor: event.target.value === DEFAULT_BID_STRATEGY ? undefined : launchConfig.roasFloor,
                  })
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
              >
                <option value="LOWEST_COST_WITHOUT_CAP">Highest volume or value</option>
                <option value="COST_CAP">Cost Cap</option>
                <option value="LOWEST_COST_WITH_BID_CAP">Bid Cap</option>
                <option value="LOWEST_COST_WITH_MIN_ROAS">ROAS Goal</option>
              </select>
            </FormField>
          )}
        </div>

        {campaignMode === 'new' && shouldShowBidAmount(newCampaignBidStrategy) && (
          <FormField
            label={newCampaignBidStrategy === 'COST_CAP' ? 'Cost Per Result Goal' : 'Bid Cap Amount'}
          >
            <CurrencyInput
              currency={currency}
              min={0.01}
              step={0.01}
              value={launchConfig.bidAmount}
              onChange={(value) => updateLaunchConfig({ bidAmount: value })}
            />
          </FormField>
        )}

        {campaignMode === 'new' && shouldShowRoas(newCampaignBidStrategy) && (
          <FormField label="ROAS Goal">
            <NumberWithSuffix
              min={0.01}
              step={0.01}
              suffix="x"
              value={launchConfig.roasFloor}
              onChange={(value) => updateLaunchConfig({ roasFloor: value })}
            />
          </FormField>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-600 dark:bg-slate-900/35">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                Location Targeting
              </p>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {locationSuggestionsLoading
                  ? 'Checking existing store ad sets...'
                  : storeLocationSuggestions?.sourceAdsetCount
                    ? `Auto-filled from ${storeLocationSuggestions.sourceAdsetCount} existing ad sets.`
                    : 'Add locations manually, or they will fall back to the store default.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCountryListModal('included')}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
              >
                {includesWorldwide ? 'Worldwide' : formatCountryCount(displayedIncludedCountries.length, 'included')}
              </button>
              <button
                type="button"
                onClick={() => setCountryListModal('excluded')}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
              >
                {formatCountryCount(excludedCountries.length, 'excluded')}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Include Locations" helper="Add one country or paste many names at once.">
              <div className="flex gap-2">
                <select
                  value=""
                  onChange={(event) => {
                    addIncludedCountries([event.target.value]);
                    event.target.value = '';
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  <option value="">Add included country...</option>
                  {COUNTRY_OPTIONS.filter((option) => !displayedIncludedCountries.includes(option.value)).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex gap-2">
                <textarea
                  value={includeCountryPaste}
                  onChange={(event) => setIncludeCountryPaste(event.target.value)}
                  rows={2}
                  placeholder="Paste countries: India, United States, GB..."
                  className="min-h-16 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => handleBulkCountryPaste('included')}
                  disabled={parseCountryInput(includeCountryPaste).length === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  Add
                </button>
              </div>
            </FormField>

            <FormField label="Exclude Locations" helper="Optional. Add one country or paste a large block.">
              <div className="flex gap-2">
                <select
                  value=""
                  onChange={(event) => {
                    addExcludedCountries([event.target.value]);
                    event.target.value = '';
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                >
                  <option value="">Add excluded country...</option>
                  {COUNTRY_OPTIONS.filter(
                    (option) =>
                      option.value !== WORLDWIDE_COUNTRY_VALUE &&
                      !displayedIncludedCountries.includes(option.value) &&
                      !excludedCountries.includes(option.value),
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex gap-2">
                <textarea
                  value={excludeCountryPaste}
                  onChange={(event) => setExcludeCountryPaste(event.target.value)}
                  rows={2}
                  placeholder="Paste exclusions, one per line or comma separated"
                  className="min-h-16 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => handleBulkCountryPaste('excluded')}
                  disabled={parseCountryInput(excludeCountryPaste).length === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  Add
                </button>
              </div>
            </FormField>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-600 dark:bg-slate-900/35">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
              Launch Timing
            </p>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {launchTime === 'scheduled'
                ? `${scheduledDate || 'Select date'} ${scheduledTime}`
                : 'Immediately'}
            </span>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => updateLaunchConfig({ launchTime: 'immediately', scheduledDate: undefined })}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm font-medium transition',
                launchTime === 'immediately'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/45 dark:text-slate-200',
              )}
            >
              Launch immediately
            </button>
            <button
              type="button"
              onClick={() =>
                updateLaunchConfig({
                  launchTime: 'scheduled',
                  scheduledDate: launchConfig.scheduledDate || today,
                  scheduledTime: launchConfig.scheduledTime || '09:00',
                })
              }
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm font-medium transition',
                launchTime === 'scheduled'
                  ? 'border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-400 dark:bg-blue-900/25 dark:text-blue-100'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/45 dark:text-slate-200',
              )}
            >
              Schedule launch
            </button>
          </div>

          {launchTime === 'scheduled' && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Scheduled Date">
                <input
                  type="date"
                  min={today}
                  value={scheduledDate}
                  onChange={(event) => updateLaunchConfig({ scheduledDate: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                />
              </FormField>
              <FormField label="Scheduled Time">
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => updateLaunchConfig({ scheduledTime: event.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
                />
              </FormField>
            </div>
          )}
        </div>
      </div>

      {totalAdSets > 0 && (
        <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {structure === 'CBO' ? (
            <>
              1 campaign x <span className="font-semibold">{totalAdSets}</span> ad sets x{' '}
              <span className="font-semibold">{totalAds}</span> ads ={' '}
              <span className="font-semibold text-blue-600 dark:text-blue-300">{formatMoney(dailyBudget)}/day</span>
            </>
          ) : (
            <>
              <span className="font-semibold">{totalAdSets}</span> ad sets x {formatMoney(dailyBudget)}/day ={' '}
              <span className="font-semibold text-blue-600 dark:text-blue-300">
                {formatMoney(totalAdSets * dailyBudget)}/day
              </span>
              {' '}total | <span className="font-semibold">{totalAds}</span> ads
            </>
          )}
          {' '}for {duration} days
        </div>
      )}

      {showOverviewButton && (
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={onOverviewLaunch}
            disabled={batches.length === 0}
            className={cn(
              'inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition',
              batches.length === 0
                ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500'
                : 'border border-blue-200 bg-blue-600 text-white hover:bg-blue-700',
            )}
          >
            Overview Launch
          </button>
        </div>
      )}

      {countryListModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-4"
          onClick={() => setCountryListModal(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {countryListModal === 'included' ? 'Included Countries' : 'Excluded Countries'}
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                  {countryListModal === 'included' && includesWorldwide
                    ? 'Worldwide'
                    : formatCountryCount(
                        countryListModal === 'included'
                          ? displayedIncludedCountries.length
                          : excludedCountries.length,
                        countryListModal,
                      )}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCountryListModal(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
              >
                Close
              </button>
            </div>

            <div className="max-h-[56vh] overflow-y-auto p-4">
              {(countryListModal === 'included' ? displayedIncludedCountries : excludedCountries).length > 0 ? (
                <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {(countryListModal === 'included' ? displayedIncludedCountries : excludedCountries).map(
                    (countryCode) => (
                      <div
                        key={countryCode}
                        className="flex items-center justify-between gap-3 bg-white px-3 py-2 dark:bg-slate-900/70"
                      >
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {getCountryLabel(countryCode)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            countryListModal === 'included'
                              ? removeIncludedCountry(countryCode)
                              : removeExcludedCountry(countryCode)
                          }
                          className="flex h-6 w-6 items-center justify-center rounded-md text-base font-semibold leading-none text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                          aria-label={`Remove ${getCountryLabel(countryCode)}`}
                        >
                          -
                        </button>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  No countries selected.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{description}</p>
    </div>
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
      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{label}</label>
      {children}
      {helper ? <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{helper}</p> : null}
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border p-3 text-left transition-all',
        selected
          ? 'border-blue-500 bg-blue-50/70 dark:border-blue-400 dark:bg-blue-900/25'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-600 dark:bg-slate-900/40 dark:hover:border-slate-500',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
            selected
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300',
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-300">{description}</p>
        </div>
      </div>
    </button>
  );
}

function CurrencyInput({
  value,
  onChange,
  currency,
  min,
  step,
  placeholder,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  currency: string;
  min?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 dark:text-slate-400">
        $
      </span>
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = Number.parseFloat(raw);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-7 pr-14 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
        {currency}
      </span>
    </div>
  );
}

function NumberWithSuffix({
  value,
  onChange,
  suffix,
  min,
  max,
  step,
  placeholder,
}: {
  value?: number;
  onChange: (value: number | undefined) => void;
  suffix: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value ?? ''}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = Number.parseFloat(raw);
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-14 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
        {suffix}
      </span>
    </div>
  );
}
