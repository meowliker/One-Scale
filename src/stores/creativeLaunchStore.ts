import { create } from 'zustand';
import type {
  LaunchStage,
  ProductProfile,
  ClickUpCreativeSet,
  LaunchBatch,
  ActiveTest,
} from '@/types/creativeLaunch';

interface DiscoverResult {
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  notConnected?: boolean;
  notConfigured?: boolean;
  message?: string;
  destinationUrl?: string;
  storeDomain?: string;
}

interface CreativeLaunchState {
  stage: LaunchStage;
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  selectedCreativeIds: string[];
  batches: LaunchBatch[];
  activeTests: ActiveTest[];
  isLoading: boolean;
  launchSuccess: boolean;
  discoverError: string | null;
  notConnected: boolean;
  notConfigured: boolean;
  destinationUrl: string;

  setStage: (stage: LaunchStage) => void;
  fetchData: (storeId: string) => Promise<void>;
  toggleCreativeSelection: (id: string) => void;
  selectAllForProduct: (productId: string) => void;
  clearSelectionForProduct: (productId: string) => void;
  updateBatch: (productId: string, updates: Partial<LaunchBatch>) => void;
  initBatchesFromSelection: () => void;
  performLaunch: (storeId: string) => Promise<void>;
  resetFlow: () => void;
  setIsLoading: (v: boolean) => void;
}

export const useCreativeLaunchStore = create<CreativeLaunchState>()((set, get) => ({
  stage: 1,
  products: [],
  clickupCreatives: [],
  selectedCreativeIds: [],
  batches: [],
  activeTests: [],
  isLoading: false,
  launchSuccess: false,
  discoverError: null,
  notConnected: false,
  notConfigured: false,
  destinationUrl: '',

  setStage: (stage) => set({ stage }),

  fetchData: async (storeId: string) => {
    set({ isLoading: true, discoverError: null });
    try {
      const res = await fetch(`/api/creative-launch/discover?storeId=${encodeURIComponent(storeId)}`);
      const data = await res.json() as DiscoverResult & { error?: string };

      if (!res.ok) throw new Error(data.error || 'Failed to fetch data');

      set({
        products: data.products || [],
        clickupCreatives: data.clickupCreatives || [],
        notConnected: !!data.notConnected,
        notConfigured: !!data.notConfigured,
        destinationUrl: data.destinationUrl || '',
        discoverError: data.message && (data.notConnected || data.notConfigured) ? data.message : null,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        discoverError: err instanceof Error ? err.message : 'Failed to load data',
      });
    }
  },

  toggleCreativeSelection: (id) => {
    const { selectedCreativeIds } = get();
    if (selectedCreativeIds.includes(id)) {
      set({ selectedCreativeIds: selectedCreativeIds.filter((cid) => cid !== id) });
    } else {
      set({ selectedCreativeIds: [...selectedCreativeIds, id] });
    }
  },

  selectAllForProduct: (productId) => {
    const { clickupCreatives, selectedCreativeIds } = get();
    const productCreativeIds = clickupCreatives
      .filter((c) => c.productId === productId)
      .map((c) => c.id);
    const withoutProduct = selectedCreativeIds.filter(
      (id) => !productCreativeIds.includes(id)
    );
    set({ selectedCreativeIds: [...withoutProduct, ...productCreativeIds] });
  },

  clearSelectionForProduct: (productId) => {
    const { clickupCreatives, selectedCreativeIds } = get();
    const productCreativeIds = new Set(
      clickupCreatives.filter((c) => c.productId === productId).map((c) => c.id)
    );
    set({
      selectedCreativeIds: selectedCreativeIds.filter((id) => !productCreativeIds.has(id)),
    });
  },

  updateBatch: (productId, updates) => {
    const { batches } = get();
    set({
      batches: batches.map((b) =>
        b.productId === productId ? { ...b, ...updates } : b
      ),
    });
  },

  initBatchesFromSelection: () => {
    const { selectedCreativeIds, clickupCreatives, products } = get();

    // Group selected creative IDs by productId
    const byProduct = new Map<string, string[]>();
    for (const creativeId of selectedCreativeIds) {
      const creative = clickupCreatives.find((c) => c.id === creativeId);
      if (!creative) continue;
      const existing = byProduct.get(creative.productId) ?? [];
      byProduct.set(creative.productId, [...existing, creativeId]);
    }

    const batches: LaunchBatch[] = [];
    for (const [productId, creativeIds] of byProduct.entries()) {
      const product = products.find((p) => p.id === productId);
      if (!product) continue;

      const today = new Date().toISOString().split('T')[0];

      batches.push({
        productId: product.id,
        productName: product.name,
        productImage: product.image,
        creativeIds,
        campaignMode: product.defaultCampaignId ? 'existing' : 'new',
        existingCampaignId: product.defaultCampaignId,
        existingCampaignName: product.defaultCampaignName,
        newCampaignName: `TOF | ${product.name} | Broad | Test`,
        adsetMode: 'new',
        adAccountId: product.adAccountId,
        adAccountName: product.adAccountName,
        pageId: product.pageId,
        pageName: product.pageName,
        pixelId: product.pixelId,
        conversionEvent: product.conversionEvent,
        selectedPrimaryTextId:
          product.winnerCopyLibrary.length > 0 ? product.winnerCopyLibrary[0].id : '',
        selectedHeadlineId:
          product.winnerCopyLibrary.length > 0 ? product.winnerCopyLibrary[0].id : '',
        destinationUrl: product.landingUrl,
        dailyBudget: product.defaultBudget,
        testDuration: product.defaultDuration,
        launchDate: today,
      });
    }

    set({ batches });
  },

  performLaunch: async (storeId: string) => {
    set({ isLoading: true });
    const { batches, clickupCreatives } = get();

    try {
      // Update ClickUp task statuses to "testing" for all selected creatives
      const taskIds = new Set<string>();
      for (const batch of batches) {
        for (const creativeId of batch.creativeIds) {
          const creative = clickupCreatives.find((c) => c.id === creativeId);
          if (creative?.taskId) taskIds.add(creative.taskId);
        }
      }

      await Promise.allSettled(
        [...taskIds].map((taskId) =>
          fetch(`/api/integrations/clickup/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId, status: 'testing' }),
          })
        )
      );

      // Simulate a brief delay then advance to monitor stage
      await new Promise<void>((resolve) => setTimeout(resolve, 1500));
      set({ isLoading: false, launchSuccess: true, stage: 5 });
    } catch {
      // Even if ClickUp update fails, advance to stage 5
      set({ isLoading: false, launchSuccess: true, stage: 5 });
    }
  },

  // Legacy name kept for compatibility with Stage4Review
  resetFlow: () => {
    set({
      stage: 1,
      selectedCreativeIds: [],
      batches: [],
      launchSuccess: false,
      isLoading: false,
      discoverError: null,
    });
  },

  setIsLoading: (v) => set({ isLoading: v }),
}));
