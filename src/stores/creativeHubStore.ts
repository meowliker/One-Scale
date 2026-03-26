import { create } from 'zustand';
import type {
  CreativeHubTab,
  LaunchWizardStep,
  LaunchConfig,
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

  // Creative Inbox
  inboxCreatives: InboxCreative[];
  inboxLoading: boolean;
  inboxNotConnected: boolean;
  inboxNotConfigured: boolean;
  inboxError: string | null;
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

  // Actions
  setActiveTab: (tab: CreativeHubTab) => void;

  // Profile actions
  fetchProfiles: (storeId: string) => Promise<void>;
  autoDiscoverProfiles: (storeId: string) => Promise<void>;
  saveProfile: (profile: Partial<ProductProfile> & { storeId: string }) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;

  // Inbox actions
  fetchInbox: (storeId: string, productProfileId?: string) => Promise<void>;
  syncInbox: (storeId: string) => Promise<void>;
  toggleCreativeSelection: (id: string) => void;
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

  // Copy library actions
  fetchCopyLibrary: (productProfileId: string) => Promise<void>;
  fetchAllCopyLibrary: (storeId: string) => Promise<void>;
  autoPopulateCopyLibrary: (storeId: string, productProfileId: string) => Promise<{ saved: number; skipped: number; totalAdsFound: number }>;
  generateAICopy: (productProfileId: string, productName: string, context: string) => Promise<void>;
  saveCopyToLibrary: (copy: Omit<WinningCopy, 'id' | 'createdAt'>) => Promise<void>;
}

export const useCreativeHubStore = create<CreativeHubState>()((set, get) => ({
  // ── Initial state ──

  activeTab: 'profiles',

  profiles: [],
  profilesLoading: false,
  unmappedCampaigns: [],

  inboxCreatives: [],
  inboxLoading: false,
  inboxNotConnected: false,
  inboxNotConfigured: false,
  inboxError: null,
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
    set({ inboxLoading: true, inboxError: null, inboxNotConnected: false, inboxNotConfigured: false });
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
      set({
        inboxCreatives: data.creatives ?? [],
        inboxLoading: false,
        inboxNotConnected: !!data.notConnected,
        inboxNotConfigured: !!data.notConfigured,
        inboxError: data.error || null,
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
    const { selectedCreativeIds } = get();
    set({
      launchWizardOpen: true,
      launchStep: 1,
      launchConfig: {
        selectedCreativeIds: Array.from(selectedCreativeIds),
      },
    });
  },

  openLaunchWizardForProduct: (productProfileId: string, creativeIds?: string[]) => {
    const { profiles, selectedCreativeIds } = get();
    const profile = profiles.find((p) => p.id === productProfileId);
    const ids = creativeIds ?? Array.from(selectedCreativeIds);

    set({
      launchWizardOpen: true,
      launchStep: 1,
      launchConfig: {
        selectedCreativeIds: ids,
        productProfileId,
        adAccountId: profile?.adAccountId,
        pageId: profile?.pageId,
        instagramActorId: profile?.instagramActorId,
        pixelId: profile?.pixelId,
        conversionEvent: profile?.conversionEvent,
        destinationUrl: profile?.destinationUrl,
        dailyBudget: profile?.defaultBudget,
        testDuration: profile?.defaultDuration,
        bidStrategy: profile?.defaultBidStrategy,
        structure: profile?.defaultStructure,
        launchStatus: profile?.defaultLaunchStatus,
        utmTemplate: profile?.utmTemplate,
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

  fetchAllCopyLibrary: async (_storeId: string) => {
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
        body: JSON.stringify({ storeId, config: launchConfig }),
      });
      const data = await res.json();

      if (data.report) {
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
}));
