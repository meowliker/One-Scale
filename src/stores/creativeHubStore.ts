import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  CreativeHubTab,
  LaunchWizardStep,
  LaunchConfig,
  LaunchCenterTab,
  BatchStrategy,
  CreativeBatch,
  ProductProfile,
  InboxCreative,
  CreativeTest,
  WinningCopy,
  FatigueAlert,
  PreLaunchReport,
  WinningAdsData,
  AIInsightsData,
} from '@/types/creativeHub';

// Inline type for unmapped campaigns returned by auto-discover
export interface UnmappedCampaign {
  campaignId: string;
  campaignName: string;
  adAccountId: string;
  spend?: number;
  status?: string;
}

interface CreativeHubState {
  // Tab navigation
  activeTab: CreativeHubTab;

  // Product Profiles
  profiles: ProductProfile[];
  profilesLoading: boolean;
  unmappedCampaigns: UnmappedCampaign[];
  profileCreativeCounts: Record<string, number>;
  profileCreativeTotal: number;
  profileCreativeCountsLoading: boolean;

  // Creative Inbox
  inboxCreatives: InboxCreative[];
  inboxLoading: boolean;
  inboxNotConnected: boolean;
  inboxNotConfigured: boolean;
  inboxError: string | null;
  inboxLastSyncedAt: string | null;
  selectedCreativeIds: Set<string>;
  uploadProgress: Map<string, number>;

  // Launch Wizard
  launchWizardOpen: boolean;
  launchStep: LaunchWizardStep;
  launchConfig: Partial<LaunchConfig>;

  // Active Tests
  activeTests: CreativeTest[];
  activeTestsLoading: boolean;

  // Completed Tests
  completedTests: CreativeTest[];

  // Copy Library
  copyLibrary: WinningCopy[];

  // Fatigue Alerts
  fatigueAlerts: FatigueAlert[];

  // Health Check
  healthCheckReport: PreLaunchReport | null;

  // Winning Ads
  winningAds: WinningAdsData | null;
  winningAdsLoading: boolean;

  // AI Insights
  aiInsights: AIInsightsData | null;
  aiInsightsLoading: boolean;

  // Launch Center
  launchCenterOpen: boolean;
  launchCenterTab: LaunchCenterTab;
  batches: CreativeBatch[];
  batchStrategy: BatchStrategy;
  creativesPerBatch: number;

  // Google Drive
  googleDriveConnected: boolean;
  googleDriveEmail: string | null;

  // Launch Studio
  launchStudioOpen: boolean;
  launchStudioProductId: string | null;
  launchStudioAiAnalysis: { loading: boolean; data: AIInsightsData | null; error: string | null };
  launchStudioAiChat: {
    messages: Array<{ role: 'user' | 'assistant'; content: string; actionItems?: string[] }>;
    loading: boolean;
    requestId?: string;
    meta?: {
      mode?: string;
      model?: string;
      toolCalls?: number;
      apiKeySource?: string;
      selectionAware?: boolean;
      degradedReason?: string;
    };
  };

  // Actions
  setActiveTab: (tab: CreativeHubTab) => void;

  // Profile actions
  fetchProfiles: (storeId: string) => Promise<void>;
  fetchProfileCreativeCounts: (storeId: string) => Promise<void>;
  autoDiscoverProfiles: (storeId: string) => Promise<void>;
  saveProfile: (profile: Partial<ProductProfile> & { storeId: string }) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;

  // Inbox actions
  fetchInbox: (storeId: string, productProfileId?: string) => Promise<void>;
  syncInbox: (storeId: string) => Promise<void>;
  toggleCreativeSelection: (id: string) => void;
  setSelectedCreativeIds: (ids: string[]) => void;
  selectAllCreatives: () => void;
  deselectAllCreatives: () => void;
  startUpload: (creativeId: string, storeId: string) => Promise<void>;

  // Launch wizard actions
  openLaunchWizard: () => void;
  openLaunchWizardForProduct: (productProfileId: string, creativeIds?: string[]) => void;
  closeLaunchWizard: () => void;
  setLaunchStep: (step: LaunchWizardStep) => void;
  updateLaunchConfig: (partial: Partial<LaunchConfig>) => void;
  executeLaunch: (storeId: string) => Promise<void>;

  // Test actions
  fetchActiveTests: (storeId: string) => Promise<void>;
  fetchCompletedTests: (storeId: string) => Promise<void>;
  executeAIActions: (testId: string, actions: Record<string, string>) => Promise<void>;
  fetchTestMetrics: (testId: string) => Promise<void>;
  fetchReviewStatus: (testId: string) => Promise<void>;

  // Launch actions
  runHealthCheck: (storeId: string) => Promise<void>;

  // Winning ads actions
  fetchWinningAds: (storeId: string, productProfileId: string) => Promise<void>;

  // AI insights actions
  fetchAIInsights: (storeId: string, productProfileId: string) => Promise<void>;

  // Google Drive actions
  checkGoogleDriveConnection: (storeId: string) => Promise<void>;

  // Launch Studio actions
  openLaunchStudio: (productId: string, creativeIds?: string[]) => void;
  restoreLaunchStudioSession: (productId: string, launchConfig?: Partial<LaunchConfig>) => void;
  closeLaunchStudio: () => void;
  fetchLaunchStudioAiAnalysis: (storeId: string, productProfileId: string) => Promise<void>;
  sendLaunchStudioAiChat: (storeId: string, productProfileId: string, message: string) => Promise<void>;

  // Launch Center actions
  setLaunchCenterTab: (tab: LaunchCenterTab) => void;
  openLaunchCenter: (productId?: string, creativeIds?: string[]) => void;
  closeLaunchCenter: () => void;
  autoBatch: (strategy: BatchStrategy, size: number) => void;
  createBatch: (name: string, creativeIds: string[]) => void;
  removeBatch: (batchId: string) => void;
  addCreativeToBatch: (batchId: string, creativeId: string) => void;
  removeCreativeFromBatch: (batchId: string, creativeId: string) => void;
  moveCreativeBetweenBatches: (fromId: string, toId: string, creativeId: string) => void;
  clearBatches: () => void;
  shuffleBatches: () => void;

  // Copy library actions
  fetchCopyLibrary: (productProfileId: string) => Promise<void>;
  fetchAllCopyLibrary: (storeId: string) => Promise<void>;
  autoPopulateCopyLibrary: (storeId: string, productProfileId: string) => Promise<{ saved: number; skipped: number; totalAdsFound: number }>;
  generateAICopy: (productProfileId: string, productName: string, context: string) => Promise<void>;
  saveCopyToLibrary: (copy: Omit<WinningCopy, 'id' | 'createdAt'>) => Promise<void>;
}

function getCreativesByIds(creatives: InboxCreative[], ids: string[]): InboxCreative[] {
  const idSet = new Set(ids);
  return creatives.filter((creative) => idSet.has(creative.id));
}

function getActiveCampaigns(profile?: ProductProfile): NonNullable<ProductProfile['campaignLinks']> {
  return (profile?.campaignLinks ?? []).filter(
    (campaign) => campaign.effectiveStatus === 'ACTIVE' || (!campaign.effectiveStatus && campaign.isActive),
  );
}

function getDefaultCampaignId(profile?: ProductProfile): string | undefined {
  const activeCampaigns = getActiveCampaigns(profile);
  return (
    activeCampaigns.find((campaign) => campaign.campaignType === 'testing')?.campaignId ||
    activeCampaigns[0]?.campaignId
  );
}

function buildSuggestedCampaignName(productName?: string): string | undefined {
  if (!productName) return undefined;
  const today = new Date().toISOString().slice(0, 10);
  return `${productName} | Creative Test ${today}`;
}

function buildCreativeCounts(creatives: InboxCreative[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const creative of creatives) {
    if (!creative.productProfileId) continue;
    counts[creative.productProfileId] = (counts[creative.productProfileId] ?? 0) + 1;
  }
  return counts;
}

function buildBaseLaunchConfig(
  profile?: ProductProfile,
  selectedCreativeIds: string[] = [],
  launchMode: LaunchCenterTab = 'quick',
): Partial<LaunchConfig> {
  const defaultCampaignId = getDefaultCampaignId(profile);

  return {
    productProfileId: profile?.id,
    selectedCreativeIds: selectedCreativeIds.slice(0, 60),
    campaignMode: defaultCampaignId ? 'existing' : 'new',
    existingCampaignId: defaultCampaignId,
    newCampaignName: defaultCampaignId ? undefined : buildSuggestedCampaignName(profile?.productName),
    adsetMode: 'new_adsets',
    adsetDistribution: 'one_per_adset',
    structure: profile?.defaultStructure ?? 'ABO',
    adAccountId: profile?.adAccountId,
    pageId: profile?.pageId,
    instagramActorId: profile?.instagramActorId,
    pixelId: profile?.pixelId,
    conversionEvent: profile?.conversionEvent,
    destinationUrl: profile?.destinationUrl,
    dailyBudget: profile?.defaultBudget ?? 20,
    testDuration: profile?.defaultDuration ?? 3,
    bidStrategy: profile?.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP',
    bidAmount: profile?.defaultBidAmount,
    roasFloor: profile?.defaultRoasFloor,
    launchStatus: profile?.defaultLaunchStatus ?? 'PAUSED',
    launchTime: 'immediately',
    scheduledDate: undefined,
    scheduledTime: '09:00',
    endDate: undefined,
    attributionWindow: '7d_click_1d_view',
    utmTemplate: profile?.utmTemplate,
    primaryTexts: [],
    headlines: [],
    descriptions: [],
    ctaType: 'SHOP_NOW',
    advantageCreative: true,
    batches: [],
    batchStrategy: 'manual',
    creativesPerBatch: 3,
    launchMode,
    aiMinSpend: profile?.aiMinSpend,
    aiMinImpressions: profile?.aiMinImpressions,
    aiMinHours: profile?.aiMinHours,
    aiEvalFrequency: profile?.aiEvalFrequency,
  };
}

type PersistedCopyItem = {
  id: string;
  text: string;
  source: 'winner' | 'ai_generated' | 'manual';
  sourceRoas?: number;
  sourceCopyId?: string;
};

function trimCopyItems(items?: PersistedCopyItem[], limit = 12): PersistedCopyItem[] | undefined {
  if (!items || items.length === 0) return undefined;
  return items.slice(0, limit).map((item) => ({
    id: item.id,
    text: item.text,
    source: item.source,
    sourceRoas: item.sourceRoas,
    sourceCopyId: item.sourceCopyId,
  }));
}

function trimExistingAdsetAssignments(
  assignments?: Record<string, string[]>,
  adsetLimit = 12,
  idsPerAdsetLimit = 12,
): Record<string, string[]> | undefined {
  if (!assignments) return undefined;
  const entries = Object.entries(assignments).slice(0, adsetLimit);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([adsetId, ids]) => [adsetId, ids.slice(0, idsPerAdsetLimit)]));
}

function buildPersistedLaunchConfig(launchConfig: Partial<LaunchConfig>): Partial<LaunchConfig> {
  const {
    productProfileId,
    selectedCreativeIds,
    campaignMode,
    existingCampaignId,
    adsetMode,
    adsetDistribution,
    existingAdsetAssignments,
    newCampaignName,
    structure,
    adAccountId,
    pageId,
    instagramActorId,
    pixelId,
    conversionEvent,
    destinationUrl,
    dailyBudget,
    testDuration,
    bidStrategy,
    bidAmount,
    roasFloor,
    launchStatus,
    targetingPresetId,
    customTargeting,
    primaryTexts,
    headlines,
    descriptions,
    ctaType,
    advantageCreative,
    launchTime,
    scheduledDate,
    scheduledTime,
    endDate,
    attributionWindow,
    utmTemplate,
    adsetNameOverride,
    adNameOverride,
    aiMinSpend,
    aiMinImpressions,
    aiMinHours,
    aiEvalFrequency,
    autoKill,
    notifyOnKill,
    aiAutopilotEnabled,
    aiAutopilotRequiresConfirmation,
    creativesPerBatch,
    batchStrategy,
    launchMode,
  } = launchConfig;

  return {
    productProfileId,
    selectedCreativeIds: selectedCreativeIds?.slice(0, 60),
    campaignMode,
    existingCampaignId,
    adsetMode,
    adsetDistribution,
    existingAdsetAssignments: trimExistingAdsetAssignments(existingAdsetAssignments),
    newCampaignName,
    structure,
    adAccountId,
    pageId,
    instagramActorId,
    pixelId,
    conversionEvent,
    destinationUrl,
    dailyBudget,
    testDuration,
    bidStrategy,
    bidAmount,
    roasFloor,
    launchStatus,
    targetingPresetId,
    customTargeting,
    primaryTexts: trimCopyItems(primaryTexts as PersistedCopyItem[] | undefined),
    headlines: trimCopyItems(headlines as PersistedCopyItem[] | undefined),
    descriptions: trimCopyItems(descriptions as PersistedCopyItem[] | undefined),
    ctaType,
    advantageCreative,
    launchTime,
    scheduledDate,
    scheduledTime,
    endDate,
    attributionWindow,
    utmTemplate,
    adsetNameOverride,
    adNameOverride,
    aiMinSpend,
    aiMinImpressions,
    aiMinHours,
    aiEvalFrequency,
    autoKill,
    notifyOnKill,
    aiAutopilotEnabled,
    aiAutopilotRequiresConfirmation,
    creativesPerBatch,
    batchStrategy,
    launchMode,
  };
}

const creativeHubSessionStorage = createJSONStorage(() => ({
  getItem: (name: string) => window.localStorage.getItem(name),
  setItem: (name: string, value: string) => {
    try {
      window.localStorage.setItem(name, value);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        try {
          window.localStorage.removeItem(name);
          window.localStorage.setItem(name, value);
        } catch {
          // Persistence is best-effort only. If localStorage is full for this
          // origin, keep the UI working and skip saving this session snapshot.
        }
        return;
      }
      throw error;
    }
  },
  removeItem: (name: string) => window.localStorage.removeItem(name),
}));

export const useCreativeHubStore = create<CreativeHubState>()(
  persist((set, get) => ({
  // ── Initial state ──

  activeTab: 'profiles',

  profiles: [],
  profilesLoading: false,
  unmappedCampaigns: [],
  profileCreativeCounts: {},
  profileCreativeTotal: 0,
  profileCreativeCountsLoading: false,

  inboxCreatives: [],
  inboxLoading: false,
  inboxNotConnected: false,
  inboxNotConfigured: false,
  inboxError: null,
  inboxLastSyncedAt: null,
  selectedCreativeIds: new Set<string>(),
  uploadProgress: new Map<string, number>(),

  launchWizardOpen: false,
  launchStep: 1,
  launchConfig: {},

  activeTests: [],
  activeTestsLoading: false,

  completedTests: [],

  copyLibrary: [],

  fatigueAlerts: [],

  healthCheckReport: null,

  winningAds: null,
  winningAdsLoading: false,

  aiInsights: null,
  aiInsightsLoading: false,

  launchCenterOpen: false,
  launchCenterTab: 'quick',
  batches: [],
  batchStrategy: 'sequential',
  creativesPerBatch: 3,

  googleDriveConnected: false,
  googleDriveEmail: null,

  launchStudioOpen: false,
  launchStudioProductId: null,
  launchStudioAiAnalysis: { loading: false, data: null, error: null },
  launchStudioAiChat: { messages: [], loading: false, requestId: undefined, meta: undefined },

  // ── Tab navigation ──

  setActiveTab: (tab) => set({ activeTab: tab }),

  // ── Product Profiles ──

  fetchProfiles: async (storeId: string) => {
    set({ profilesLoading: true });
    try {
      const res = await fetch(`/api/creative-hub/product-profiles?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      set({
        profiles: data.profiles ?? [],
        unmappedCampaigns: data.unmappedCampaigns ?? [],
        profilesLoading: false,
      });
    } catch {
      set({ profilesLoading: false });
    }
  },

  fetchProfileCreativeCounts: async (storeId: string) => {
    set({
      profileCreativeCounts: {},
      profileCreativeTotal: 0,
      profileCreativeCountsLoading: true,
    });
    try {
      const res = await fetch(`/api/creative-hub/inbox?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      const creatives: InboxCreative[] = data.creatives ?? [];
      const counts = buildCreativeCounts(creatives);

      set({
        profileCreativeCounts: counts,
        profileCreativeTotal: creatives.length,
        inboxCreatives: creatives,
        inboxLastSyncedAt: data.lastSyncedAt || data.syncedAt || data.cacheMeta?.lastSyncedAt || null,
        profileCreativeCountsLoading: false,
        inboxNotConnected: !!data.notConnected,
        inboxNotConfigured: !!data.notConfigured,
        inboxError: data.error || null,
      });
    } catch {
      set({ profileCreativeCountsLoading: false });
    }
  },

  autoDiscoverProfiles: async (storeId: string) => {
    if (!storeId) {
      console.error('[CreativeHub] autoDiscoverProfiles called without storeId');
      return;
    }
    set({ profilesLoading: true });
    try {
      const res = await fetch('/api/creative-hub/product-profiles/auto-discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[CreativeHub] Auto-discover failed:', data.error);
        set({ profilesLoading: false });
        return;
      }
      console.log('[CreativeHub] Auto-discover result:', {
        profiles: data.profiles?.length ?? 0,
        unmapped: data.unmappedCampaigns?.length ?? 0,
        stats: data.stats,
      });
      set({
        profiles: data.profiles ?? [],
        unmappedCampaigns: data.unmappedCampaigns ?? [],
        profilesLoading: false,
      });
    } catch (err) {
      console.error('[CreativeHub] Auto-discover error:', err);
      set({ profilesLoading: false });
    }
  },

  saveProfile: async (profile) => {
    try {
      const isNew = !profile.id;
      const url = isNew
        ? '/api/creative-hub/product-profiles'
        : `/api/creative-hub/product-profiles/${profile.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const data = await res.json();

      if (data.profile) {
        const { profiles } = get();
        if (isNew) {
          set({ profiles: [...profiles, data.profile] });
        } else {
          set({
            profiles: profiles.map((p) =>
              p.id === data.profile.id
                ? { ...p, ...data.profile, campaignLinks: p.campaignLinks, activeCampaignCount: p.activeCampaignCount }
                : p
            ),
          });
        }
      }
    } catch {
      // Error handling deferred to Task 16
    }
  },

  deleteProfile: async (id: string) => {
    try {
      await fetch(`/api/creative-hub/product-profiles/${id}`, {
        method: 'DELETE',
      });
      const { profiles } = get();
      set({ profiles: profiles.filter((p) => p.id !== id) });
    } catch {
      // Error handling deferred to Task 16
    }
  },

  // ── Creative Inbox ──

  fetchInbox: async (storeId: string, productProfileId?: string) => {
    set({
      inboxLoading: true,
      inboxError: null,
      inboxNotConnected: false,
      inboxNotConfigured: false,
      inboxCreatives: productProfileId ? [] : get().inboxCreatives,
    });
    try {
      const params = new URLSearchParams({ storeId });
      if (productProfileId) params.set('productId', productProfileId);

      const res = await fetch(`/api/creative-hub/inbox?${params.toString()}`);
      const data = await res.json();
      set({
        inboxCreatives: data.creatives ?? [],
        inboxLoading: false,
        inboxNotConnected: !!data.notConnected,
        inboxNotConfigured: !!data.notConfigured,
        inboxError: data.error || null,
        inboxLastSyncedAt: data.lastSyncedAt || data.syncedAt || data.cacheMeta?.lastSyncedAt || null,
      });
    } catch (err) {
      set({
        inboxLoading: false,
        inboxError: err instanceof Error ? err.message : 'Failed to fetch inbox',
      });
    }
  },

  syncInbox: async (storeId: string) => {
    set({ inboxLoading: true, inboxError: null, inboxNotConnected: false, inboxNotConfigured: false });
    try {
      const params = new URLSearchParams({ storeId });
      const res = await fetch(`/api/creative-hub/inbox/sync?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      });
      const data = await res.json();
      const creatives: InboxCreative[] = data.creatives ?? [];
      set({
        inboxCreatives: creatives,
        inboxLoading: false,
        inboxNotConnected: !!data.notConnected,
        inboxNotConfigured: !!data.notConfigured,
        inboxError: data.error || null,
        inboxLastSyncedAt: data.syncedAt || data.lastSyncedAt || data.cacheMeta?.lastSyncedAt || null,
        profileCreativeCounts: buildCreativeCounts(creatives),
        profileCreativeTotal: creatives.length,
      });
    } catch (err) {
      set({
        inboxLoading: false,
        inboxError: err instanceof Error ? err.message : 'Sync failed',
      });
    }
  },

  toggleCreativeSelection: (id: string) => {
    const { selectedCreativeIds } = get();
    const next = new Set(selectedCreativeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedCreativeIds: next });
  },

  setSelectedCreativeIds: (ids: string[]) => {
    set({ selectedCreativeIds: new Set(ids) });
  },

  selectAllCreatives: () => {
    const { inboxCreatives } = get();
    set({
      selectedCreativeIds: new Set(inboxCreatives.map((c) => c.id)),
    });
  },

  deselectAllCreatives: () => {
    set({ selectedCreativeIds: new Set() });
  },

  startUpload: async (creativeId: string, storeId: string) => {
    const { uploadProgress } = get();
    const next = new Map(uploadProgress);
    next.set(creativeId, 0);
    set({ uploadProgress: next });

    try {
      const res = await fetch('/api/creative-hub/inbox/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativeId, storeId }),
      });
      const data = await res.json();

      // Update the creative in inbox with upload result
      const { inboxCreatives, uploadProgress: currentProgress } = get();
      const updatedProgress = new Map(currentProgress);
      updatedProgress.set(creativeId, 100);

      set({
        inboxCreatives: inboxCreatives.map((c) =>
          c.id === creativeId
            ? {
                ...c,
                uploadStatus: data.success ? 'ready' as const : 'failed' as const,
                metaAssetId: data.assetId,
                metaAssetType: data.assetType,
                uploadError: data.error,
              }
            : c
        ),
        uploadProgress: updatedProgress,
      });
    } catch {
      const { uploadProgress: currentProgress, inboxCreatives } = get();
      const updatedProgress = new Map(currentProgress);
      updatedProgress.delete(creativeId);
      set({
        uploadProgress: updatedProgress,
        inboxCreatives: inboxCreatives.map((c) =>
          c.id === creativeId
            ? { ...c, uploadStatus: 'failed' as const, uploadError: 'Upload failed' }
            : c
        ),
      });
    }
  },

  // ── Launch Wizard ──

  openLaunchWizard: () => {
    const { selectedCreativeIds, inboxCreatives } = get();
    const creativeIds = Array.from(selectedCreativeIds);
    set({
      launchWizardOpen: true,
      launchStep: 1,
      launchConfig: {
        selectedCreativeIds: creativeIds,
        selectedCreativeSnapshots: getCreativesByIds(inboxCreatives, creativeIds),
      },
    });
  },

  openLaunchWizardForProduct: (productProfileId: string, creativeIds?: string[]) => {
    const {
      profiles,
      selectedCreativeIds,
      inboxCreatives,
      batches,
      batchStrategy,
      creativesPerBatch,
      launchConfig: existingLaunchConfig,
    } = get();
    const profile = profiles.find((p) => p.id === productProfileId);
    const ids = creativeIds ?? Array.from(selectedCreativeIds);
    const selectedSnapshots = getCreativesByIds(inboxCreatives, ids);
    const defaultCampaignId = existingLaunchConfig.existingCampaignId || getDefaultCampaignId(profile);

    set({
      launchWizardOpen: true,
      launchStep: 1,
      launchConfig: {
        ...existingLaunchConfig,
        selectedCreativeIds: ids,
        selectedCreativeSnapshots: selectedSnapshots,
        productProfileId,
        campaignMode:
          existingLaunchConfig.campaignMode || (defaultCampaignId ? 'existing' : 'new'),
        existingCampaignId: defaultCampaignId,
        newCampaignName:
          existingLaunchConfig.newCampaignName ||
          (defaultCampaignId ? undefined : buildSuggestedCampaignName(profile?.productName)),
        adsetMode: existingLaunchConfig.adsetMode || 'new_adsets',
        adsetDistribution:
          existingLaunchConfig.adsetDistribution ||
          (ids.length > 1 ? 'one_per_adset' : 'all_to_one'),
        adAccountId: existingLaunchConfig.adAccountId || profile?.adAccountId,
        pageId: existingLaunchConfig.pageId || profile?.pageId,
        instagramActorId:
          existingLaunchConfig.instagramActorId || profile?.instagramActorId,
        pixelId: existingLaunchConfig.pixelId || profile?.pixelId,
        conversionEvent:
          existingLaunchConfig.conversionEvent || profile?.conversionEvent,
        destinationUrl:
          existingLaunchConfig.destinationUrl || profile?.destinationUrl,
        dailyBudget: existingLaunchConfig.dailyBudget ?? profile?.defaultBudget ?? 20,
        testDuration: existingLaunchConfig.testDuration ?? profile?.defaultDuration ?? 3,
        bidStrategy:
          existingLaunchConfig.bidStrategy ||
          profile?.defaultBidStrategy ||
          'LOWEST_COST_WITHOUT_CAP',
        bidAmount: existingLaunchConfig.bidAmount ?? profile?.defaultBidAmount,
        roasFloor: existingLaunchConfig.roasFloor ?? profile?.defaultRoasFloor,
        structure: existingLaunchConfig.structure || profile?.defaultStructure || 'ABO',
        launchStatus:
          existingLaunchConfig.launchStatus || profile?.defaultLaunchStatus || 'PAUSED',
        launchTime: existingLaunchConfig.launchTime || 'immediately',
        scheduledDate:
          existingLaunchConfig.launchTime === 'scheduled'
            ? existingLaunchConfig.scheduledDate
            : undefined,
        scheduledTime: existingLaunchConfig.scheduledTime || '09:00',
        endDate: existingLaunchConfig.endDate,
        attributionWindow:
          existingLaunchConfig.attributionWindow || '7d_click_1d_view',
        utmTemplate: existingLaunchConfig.utmTemplate || profile?.utmTemplate,
        primaryTexts: existingLaunchConfig.primaryTexts || [],
        headlines: existingLaunchConfig.headlines || [],
        descriptions: existingLaunchConfig.descriptions || [],
        ctaType: existingLaunchConfig.ctaType || 'SHOP_NOW',
        advantageCreative: existingLaunchConfig.advantageCreative ?? true,
        batches: batches.length > 0 ? batches : existingLaunchConfig.batches,
        batchStrategy:
          batches.length > 0 ? batchStrategy : existingLaunchConfig.batchStrategy,
        creativesPerBatch:
          existingLaunchConfig.creativesPerBatch ?? creativesPerBatch,
        launchMode: existingLaunchConfig.launchMode || 'quick',
        aiMinSpend: existingLaunchConfig.aiMinSpend ?? profile?.aiMinSpend,
        aiMinImpressions:
          existingLaunchConfig.aiMinImpressions ?? profile?.aiMinImpressions,
        aiMinHours: existingLaunchConfig.aiMinHours ?? profile?.aiMinHours,
        aiEvalFrequency:
          existingLaunchConfig.aiEvalFrequency || profile?.aiEvalFrequency,
      },
    });
  },

  closeLaunchWizard: () => {
    set({
      launchWizardOpen: false,
      launchStep: 1,
      launchConfig: {},
    });
  },

  setLaunchStep: (step) => set({ launchStep: step }),

  updateLaunchConfig: (partial) => {
    const { launchConfig } = get();
    set({ launchConfig: { ...launchConfig, ...partial } });
  },

  executeLaunch: async (storeId: string) => {
    const { launchConfig } = get();
    const res = await fetch('/api/creative-hub/launch/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, launchConfig }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Launch execution failed');
    }

    if (data.status === 'partial') {
      // Close wizard but warn caller about partial failure
      set({
        launchWizardOpen: false,
        launchStep: 1,
        launchConfig: {},
        selectedCreativeIds: new Set(),
      });
      get().fetchActiveTests(storeId);
      throw new Error('Some creatives failed to launch. Check the test details for more info.');
    }

    if (data.testId) {
      // Refresh active tests and close wizard
      set({
        launchWizardOpen: false,
        launchStep: 1,
        launchConfig: {},
        selectedCreativeIds: new Set(),
      });
      get().fetchActiveTests(storeId);
    }
  },

  // ── Active Tests ──

  fetchActiveTests: async (storeId: string) => {
    set({ activeTestsLoading: true });
    try {
      const res = await fetch(`/api/creative-hub/tests/active?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      set({
        activeTests: data.tests ?? [],
        fatigueAlerts: data.fatigueAlerts ?? [],
        activeTestsLoading: false,
      });
    } catch {
      set({ activeTestsLoading: false });
    }
  },

  fetchCompletedTests: async (storeId: string) => {
    try {
      const res = await fetch(`/api/creative-hub/tests/active?storeId=${encodeURIComponent(storeId)}&status=completed`);
      const data = await res.json();
      set({ completedTests: data.tests ?? [] });
    } catch {
      // silent
    }
  },

  executeAIActions: async (testId: string, actions: Record<string, string>) => {
    try {
      await fetch(`/api/creative-hub/tests/${testId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actions }),
      });

      // Update local state: apply actions to test items
      const { activeTests } = get();
      set({
        activeTests: activeTests.map((test) => {
          if (test.id !== testId) return test;
          return {
            ...test,
            items: test.items.map((item) => {
              const action = actions[item.id];
              if (!action) return item;
              return {
                ...item,
                aiRecommendation: action as CreativeTest['items'][number]['aiRecommendation'],
              };
            }),
          };
        }),
      });
    } catch {
      // Error handling deferred to Task 16
    }
  },

  // ── Winning Ads ──

  fetchWinningAds: async (storeId: string, productProfileId: string) => {
    set({ winningAdsLoading: true });
    try {
      const res = await fetch(`/api/creative-hub/winning-ads?storeId=${encodeURIComponent(storeId)}&productProfileId=${encodeURIComponent(productProfileId)}`);
      if (!res.ok) throw new Error('Failed to fetch winning ads');
      const data = await res.json();
      set({ winningAds: data, winningAdsLoading: false });
    } catch (err) {
      console.error('[CreativeHub] Failed to fetch winning ads:', err);
      set({ winningAdsLoading: false });
    }
  },

  // ── AI Insights ──

  fetchAIInsights: async (storeId: string, productProfileId: string) => {
    set({ aiInsightsLoading: true });
    try {
      const res = await fetch('/api/creative-hub/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, productProfileId }),
      });
      if (!res.ok) throw new Error('Failed to fetch AI insights');
      const data = await res.json();
      set({ aiInsights: data, aiInsightsLoading: false });
    } catch (err) {
      console.error('[CreativeHub] Failed to fetch AI insights:', err);
      set({ aiInsightsLoading: false });
    }
  },

  // ── Google Drive ──

  checkGoogleDriveConnection: async (storeId: string) => {
    try {
      const res = await fetch(`/api/google-drive/status?storeId=${encodeURIComponent(storeId)}`);
      if (res.ok) {
        const data = await res.json();
        set({
          googleDriveConnected: !!data.connected,
          googleDriveEmail: data.email || null,
        });
      } else {
        set({ googleDriveConnected: false, googleDriveEmail: null });
      }
    } catch {
      set({ googleDriveConnected: false, googleDriveEmail: null });
    }
  },

  // ── Launch Studio ──

  openLaunchStudio: (productId: string, creativeIds?: string[]) => {
    const { profiles } = get();
    const profile = profiles.find((item) => item.id === productId);
    const selectedIds = creativeIds ?? [];
    const selectedSnapshots = getCreativesByIds(get().inboxCreatives, selectedIds);
    set({
      launchStudioOpen: true,
      launchStudioProductId: productId,
      selectedCreativeIds: new Set(selectedIds),
      launchStudioAiAnalysis: { loading: false, data: null, error: null },
      launchStudioAiChat: { messages: [], loading: false, requestId: undefined, meta: undefined },
      batches: [],
      launchConfig: {
        ...buildBaseLaunchConfig(profile, selectedIds, 'quick'),
        selectedCreativeSnapshots: selectedSnapshots,
        productProfileId: productId,
        selectedCreativeIds: selectedIds,
      },
    });
  },

  restoreLaunchStudioSession: (productId: string, launchConfig = {}) => {
    set((state) => ({
      launchStudioOpen: true,
      launchStudioProductId: productId,
      selectedCreativeIds: new Set(launchConfig.selectedCreativeIds ?? []),
      launchStudioAiAnalysis: { loading: false, data: null, error: null },
      launchStudioAiChat: { messages: [], loading: false, requestId: undefined, meta: undefined },
      batches: launchConfig.batches ?? state.batches,
      batchStrategy: launchConfig.batchStrategy ?? state.batchStrategy,
      creativesPerBatch: launchConfig.creativesPerBatch ?? state.creativesPerBatch,
      launchConfig: {
        ...state.launchConfig,
        ...launchConfig,
        productProfileId: productId,
      },
    }));
  },

  closeLaunchStudio: () => set({
    launchStudioOpen: false,
    launchStudioProductId: null,
    launchStudioAiAnalysis: { loading: false, data: null, error: null },
    launchStudioAiChat: { messages: [], loading: false, requestId: undefined, meta: undefined },
  }),

  fetchLaunchStudioAiAnalysis: async (storeId: string, productProfileId: string) => {
    const { inboxCreatives, selectedCreativeIds } = get();
    const selectedCreatives = inboxCreatives.filter(
      (creative) =>
        creative.productProfileId === productProfileId &&
        selectedCreativeIds.has(creative.id),
    );

    const previous = get().launchStudioAiAnalysis;
    set({
      launchStudioAiAnalysis: {
        loading: true,
        data: previous.data,
        error: null,
      },
    });
    const controller = new AbortController();
    // Launch analysis can spend time rebuilding winner history plus Cloud fallback cards.
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch('/api/creative-hub/ai-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productProfileId,
          selectedCreativeIds: selectedCreatives.map((creative) => creative.id),
          selectedCreatives: selectedCreatives.slice(0, 20),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(errorBody.error || `AI analysis failed (${res.status})`);
      }
      const data = await res.json();
      // Validate expected shape — the response must contain `insights` with required fields
      if (!data.insights || !data.insights.summary) {
        throw new Error('Invalid response: missing insights data');
      }
      set({ launchStudioAiAnalysis: { loading: false, data, error: null } });
    } catch (err) {
      const hasPreviousLaunchDraft =
        Boolean(previous.data?.launchDraft?.actionCards?.length) ||
        Boolean(previous.data?.insights?.summary);
      const timedOut = err instanceof Error && err.name === 'AbortError';
      const message = err instanceof Error
        ? (timedOut ? 'Cloud analysis took too long. Please try again in a moment.' : err.message)
        : 'Analysis failed';
      set({
        launchStudioAiAnalysis: {
          loading: false,
          data: previous.data,
          error: timedOut && hasPreviousLaunchDraft ? null : message,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  },

  sendLaunchStudioAiChat: async (storeId: string, productProfileId: string, message: string) => {
    const { launchStudioAiChat, inboxCreatives, winningAds, selectedCreativeIds } = get();
    if (launchStudioAiChat.loading) {
      return;
    }
    const updatedMessages = [
      ...launchStudioAiChat.messages,
      { role: 'user' as const, content: message },
    ];
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set({
      launchStudioAiChat: {
        messages: updatedMessages,
        loading: true,
        requestId,
        meta: launchStudioAiChat.meta,
      },
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 120s client-side timeout (strategist uses tool loops)

    try {
      // Build context from available data for richer AI responses
      const context: Record<string, unknown[]> = {};
      if (winningAds?.winningAds) {
        context.winningAds = winningAds.winningAds.slice(0, 10);
      }
      const productCreatives = inboxCreatives.filter(
        c => c.productProfileId === productProfileId && (c.uploadStatus === 'ready' || c.driveUrl)
      );
      const selectedCreatives = productCreatives.filter((creative) =>
        selectedCreativeIds.has(creative.id),
      );
      if (productCreatives.length > 0) {
        context.creatives = productCreatives.slice(0, 15);
      }
      if (selectedCreatives.length > 0) {
        context.selectedCreatives = selectedCreatives.slice(0, 12);
      }

      const res = await fetch('/api/creative-hub/ai-strategist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productProfileId,
          message,
          selectedCreativeIds: selectedCreatives.map((creative) => creative.id),
          history: updatedMessages.slice(-10).map(m => ({ role: m.role, content: m.content })),
          context,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: `Chat failed (${res.status})` }));
        throw new Error(errorBody.error || `Chat request failed (${res.status})`);
      }
      const data = await res.json();
      const assistantMessage = {
        role: 'assistant' as const,
        content: data.response || 'I analyzed your creatives but could not generate a response.',
        actionItems: data.actionItems,
      };
      if (get().launchStudioAiChat.requestId !== requestId) {
        return;
      }
      set({
        launchStudioAiChat: {
          messages: [...updatedMessages, assistantMessage],
          loading: false,
          requestId: undefined,
          meta: data.meta,
        },
      });
    } catch (err) {
      const errMsg = err instanceof Error
        ? (err.name === 'AbortError' ? 'Request timed out. Please try again.' : err.message)
        : 'Sorry, I encountered an error. Please try again.';
      if (get().launchStudioAiChat.requestId !== requestId) {
        return;
      }
      set({
        launchStudioAiChat: {
          messages: [
            ...updatedMessages,
            { role: 'assistant' as const, content: errMsg },
          ],
          loading: false,
          requestId: undefined,
          meta: undefined,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  },

  // ── Launch Center ──

  setLaunchCenterTab: (tab: LaunchCenterTab) => set({ launchCenterTab: tab }),

  openLaunchCenter: (productId?: string, creativeIds?: string[]) => {
    const state = get();
    const profile = productId ? state.profiles.find(p => p.id === productId) : undefined;
    const scopedCreativeIds = creativeIds
      ? creativeIds
      : productId
        ? state.inboxCreatives
            .filter(c => c.productProfileId === productId && (c.uploadStatus === 'ready' || c.driveUrl))
            .map(c => c.id)
        : [...state.selectedCreativeIds];
    set({
      launchCenterOpen: true,
      launchStudioOpen: false,
      launchWizardOpen: false,
      launchCenterTab: 'quick',
      batches: [],
      selectedCreativeIds: new Set(scopedCreativeIds),
      launchConfig: {
        ...buildBaseLaunchConfig(profile, scopedCreativeIds, 'quick'),
        productProfileId: profile?.id,
        selectedCreativeIds: scopedCreativeIds,
        selectedCreativeSnapshots: getCreativesByIds(state.inboxCreatives, scopedCreativeIds),
      },
    });
  },

  closeLaunchCenter: () => set({ launchCenterOpen: false, batches: [] }),

  autoBatch: (strategy: BatchStrategy, size: number) => {
    const state = get();
    const creativeIds = [...state.selectedCreativeIds];
    const batches: CreativeBatch[] = [];
    const creativesById = new Map(
      state.inboxCreatives.map((creative) => [creative.id, creative]),
    );

    let ordered = [...creativeIds];
    if (strategy === 'shuffle') {
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
      }
    } else if (strategy === 'by_format') {
      const videos = ordered.filter(id => creativesById.get(id)?.creativeFormat === 'video');
      const images = ordered.filter(id => creativesById.get(id)?.creativeFormat === 'image');
      const carousels = ordered.filter(id => creativesById.get(id)?.creativeFormat === 'carousel');
      ordered = [...videos, ...images, ...carousels];
    } else if (strategy === 'by_folder') {
      const grouped = new Map<string, string[]>();
      for (const id of ordered) {
        const creative = creativesById.get(id);
        const key =
          creative?.driveParentFolderName ||
          creative?.clickupTaskName ||
          'Ungrouped';
        grouped.set(key, [...(grouped.get(key) || []), id]);
      }

      let batchNumber = 1;
      for (const [groupName, ids] of grouped.entries()) {
        for (let i = 0; i < ids.length; i += size) {
          batches.push({
            id: `batch-${batchNumber}`,
            name: `${groupName} ${Math.floor(i / size) + 1}`,
            creativeIds: ids.slice(i, i + size),
          });
          batchNumber += 1;
        }
      }

      set({ batches, batchStrategy: strategy, creativesPerBatch: size });
      return;
    } else if (strategy === 'one_per_adset') {
      // 1 creative per ad set (Marpipe-style fair test)
      for (let i = 0; i < ordered.length; i++) {
        batches.push({
          id: `batch-${i + 1}`,
          name: `Ad Set ${i + 1}`,
          creativeIds: [ordered[i]],
        });
      }
      set({ batches, batchStrategy: strategy, creativesPerBatch: 1 });
      return;
    } else if (strategy === 'smart_mix') {
      const selectedCreatives = ordered
        .map((id) => creativesById.get(id))
        .filter((creative): creative is InboxCreative => !!creative);

      const batchCount = Math.max(1, Math.ceil(selectedCreatives.length / Math.max(size, 1)));
      const draftBatches = Array.from({ length: batchCount }, (_, index) => ({
        id: `batch-${index + 1}`,
        name: `Angle Mix ${index + 1}`,
        creativeIds: [] as string[],
      }));

      const priority = (creative: InboxCreative): number => {
        const result = creative.pastTestResult?.status;
        const testScore =
          result === 'winner'
            ? 4
            : result === 'inconclusive'
              ? 2
              : result === 'killed'
                ? -1
                : 3;
        const sourceScore = creative.sourceType === 'drive_asset' ? 1 : 0;
        const hookScore = creative.hook ? 1 : 0;
        return testScore + sourceScore + hookScore;
      };

      const remaining = [...selectedCreatives].sort((a, b) => priority(b) - priority(a));
      const takeBestForBatch = (existingIds: string[]): InboxCreative | undefined => {
        if (remaining.length === 0) return undefined;
        if (existingIds.length === 0) return remaining.shift();

        const existingCreatives = existingIds
          .map((id) => creativesById.get(id))
          .filter((creative): creative is InboxCreative => !!creative);

        let bestIndex = 0;
        let bestScore = Number.NEGATIVE_INFINITY;

        for (let index = 0; index < remaining.length; index++) {
          const candidate = remaining[index];
          let score = priority(candidate);

          if (!existingCreatives.some((creative) => creative.creativeFormat === candidate.creativeFormat)) {
            score += 4;
          }
          if (candidate.angle && !existingCreatives.some((creative) => creative.angle === candidate.angle)) {
            score += 3;
          }
          if (candidate.creator && !existingCreatives.some((creative) => creative.creator === candidate.creator)) {
            score += 2;
          }
          if (candidate.hook && !existingCreatives.some((creative) => creative.hook === candidate.hook)) {
            score += 2;
          }
          if (
            candidate.driveParentFolderName &&
            !existingCreatives.some(
              (creative) => creative.driveParentFolderName === candidate.driveParentFolderName,
            )
          ) {
            score += 1;
          }

          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        }

        return remaining.splice(bestIndex, 1)[0];
      };

      while (remaining.length > 0) {
        for (const batch of draftBatches) {
          if (batch.creativeIds.length >= size || remaining.length === 0) continue;
          const next = takeBestForBatch(batch.creativeIds);
          if (next) {
            batch.creativeIds.push(next.id);
          }
        }
      }

      const nonEmpty = draftBatches.filter((batch) => batch.creativeIds.length > 0);
      set({ batches: nonEmpty, batchStrategy: strategy, creativesPerBatch: size });
      return;
    }

    // Group into batches of `size`
    for (let i = 0; i < ordered.length; i += size) {
      const chunk = ordered.slice(i, i + size);
      const batchNum = Math.floor(i / size) + 1;
      batches.push({
        id: `batch-${batchNum}`,
        name: `Batch ${batchNum}`,
        creativeIds: chunk,
      });
    }
    set({ batches, batchStrategy: strategy, creativesPerBatch: size });
  },

  createBatch: (name: string, creativeIds: string[]) => {
    const state = get();
    const newBatch: CreativeBatch = {
      id: `batch-${Date.now()}`,
      name,
      creativeIds,
    };
    set({ batches: [...state.batches, newBatch] });
  },

  removeBatch: (batchId: string) => {
    set({ batches: get().batches.filter(b => b.id !== batchId) });
  },

  addCreativeToBatch: (batchId: string, creativeId: string) => {
    set({
      batches: get().batches.map(b =>
        b.id === batchId && !b.creativeIds.includes(creativeId)
          ? { ...b, creativeIds: [...b.creativeIds, creativeId] }
          : b
      ),
    });
  },

  removeCreativeFromBatch: (batchId: string, creativeId: string) => {
    set({
      batches: get().batches.map(b =>
        b.id === batchId
          ? { ...b, creativeIds: b.creativeIds.filter(id => id !== creativeId) }
          : b
      ),
    });
  },

  moveCreativeBetweenBatches: (fromId: string, toId: string, creativeId: string) => {
    set({
      batches: get().batches.map(b => {
        if (b.id === fromId) return { ...b, creativeIds: b.creativeIds.filter(id => id !== creativeId) };
        if (b.id === toId && !b.creativeIds.includes(creativeId)) return { ...b, creativeIds: [...b.creativeIds, creativeId] };
        return b;
      }),
    });
  },

  clearBatches: () => set({ batches: [] }),

  shuffleBatches: () => {
    const state = get();
    const size = state.creativesPerBatch || 3;
    state.autoBatch('shuffle', size);
  },

  // ── Copy Library ──

  fetchCopyLibrary: async (productProfileId: string) => {
    try {
      const res = await fetch(`/api/creative-hub/copy-library?productId=${encodeURIComponent(productProfileId)}`);
      const data = await res.json();
      set({ copyLibrary: data.copies ?? [] });
    } catch {
      // silent
    }
  },

  fetchAllCopyLibrary: async () => {
    try {
      const { profiles } = get();
      if (profiles.length === 0) {
        set({ copyLibrary: [] });
        return;
      }
      // Fetch copies for all profiles in parallel
      const results = await Promise.all(
        profiles.map(async (p) => {
          const res = await fetch(`/api/creative-hub/copy-library?productId=${encodeURIComponent(p.id)}`);
          const data = await res.json();
          return (data.copies ?? []) as WinningCopy[];
        }),
      );
      set({ copyLibrary: results.flat() });
    } catch {
      // silent
    }
  },

  autoPopulateCopyLibrary: async (storeId: string, productProfileId: string) => {
    const res = await fetch('/api/creative-hub/copy-library/auto-populate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, productProfileId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Auto-populate failed');
    }
    return { saved: data.saved ?? 0, skipped: data.skipped ?? 0, totalAdsFound: data.totalAdsFound ?? 0 };
  },

  generateAICopy: async (productProfileId: string, productName: string, context: string) => {
    try {
      // Fetch existing winners for context
      const { copyLibrary } = get();
      const existingWinners = copyLibrary
        .filter((c) => c.productProfileId === productProfileId)
        .slice(0, 5)
        .map((c) => ({ primaryText: c.primaryText, headline: c.headline, roas: c.roas }));

      const res = await fetch('/api/creative-hub/copy-library/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productProfileId, productName, context, existingWinners }),
      });
      const data = await res.json();

      // The endpoint returns { primaryTexts, headlines, source }
      // Convert to WinningCopy objects and save each to the library
      if (data.primaryTexts && Array.isArray(data.primaryTexts)) {
        const newCopies: WinningCopy[] = [];
        for (let i = 0; i < data.primaryTexts.length; i++) {
          const primaryText = data.primaryTexts[i];
          const headline = data.headlines?.[i] || undefined;
          // Save each generated copy to the API
          const saveRes = await fetch('/api/creative-hub/copy-library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productProfileId,
              primaryText,
              headline,
              roas: 0,
              totalSpend: 0,
              totalRevenue: 0,
              totalPurchases: 0,
              isAiGenerated: true,
            }),
          });
          const saved = await saveRes.json();
          if (saved.id) {
            newCopies.push({
              ...saved,
              createdAt: saved.createdAt || new Date().toISOString(),
            });
          }
        }
        if (newCopies.length > 0) {
          const { copyLibrary: current } = get();
          set({ copyLibrary: [...newCopies, ...current] });
        }
      }
    } catch {
      // Error handling deferred to Task 16
    }
  },

  saveCopyToLibrary: async (copy) => {
    try {
      const res = await fetch('/api/creative-hub/copy-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copy),
      });
      const data = await res.json();

      // The POST endpoint returns the copy object flat (not wrapped)
      if (data.id) {
        const { copyLibrary } = get();
        set({ copyLibrary: [{ ...data, createdAt: data.createdAt || new Date().toISOString() }, ...copyLibrary] });
      }
    } catch {
      // silent
    }
  },

  // ── Health Check ──

  runHealthCheck: async (storeId: string) => {
    try {
      const { launchConfig } = get();
      const res = await fetch('/api/creative-hub/launch/health-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, launchConfig }),
      });
      const data = await res.json();

      if (data?.checks) {
        set({ healthCheckReport: data });
      } else if (data?.report) {
        set({ healthCheckReport: data.report });
      }
    } catch {
      // silent
    }
  },

  // ── Test Metrics ──

  fetchTestMetrics: async (testId: string) => {
    try {
      const res = await fetch(`/api/creative-hub/tests/${testId}/metrics`);
      const data = await res.json();

      if (data.test) {
        const { activeTests } = get();
        set({
          activeTests: activeTests.map((t) =>
            t.id === testId ? { ...t, ...data.test } : t
          ),
        });
      }
    } catch {
      // silent
    }
  },

  // ── Review Status ──

  fetchReviewStatus: async (testId: string) => {
    try {
      const res = await fetch(`/api/creative-hub/tests/${testId}/review-status`);
      const data = await res.json();

      if (data.items) {
        const { activeTests } = get();
        set({
          activeTests: activeTests.map((t) => {
            if (t.id !== testId) return t;
            return {
              ...t,
              items: t.items.map((item) => {
                const updated = data.items.find(
                  (u: { id: string }) => u.id === item.id
                );
                return updated ? { ...item, ...updated } : item;
              }),
            };
          }),
        });
      }
    } catch {
      // silent
    }
  },
}),
  {
    name: 'creative-hub-session',
    storage: creativeHubSessionStorage,
    partialize: (state) => ({
      activeTab: state.activeTab,
      launchCenterTab: state.launchCenterTab,
      launchConfig: buildPersistedLaunchConfig(state.launchConfig),
    }),
  })
);
