import { create } from 'zustand';
import type {
  LaunchStage,
  ProductProfile,
  ClickUpCreativeSet,
  LaunchBatch,
  ActiveTest,
} from '@/types/creativeLaunch';
import { mockProducts, mockClickUpCreatives, mockActiveTests } from '@/data/mockCreativeLaunch';

interface CreativeLaunchState {
  stage: LaunchStage;
  products: ProductProfile[];
  clickupCreatives: ClickUpCreativeSet[];
  selectedCreativeIds: string[];
  batches: LaunchBatch[];
  activeTests: ActiveTest[];
  isLoading: boolean;
  launchSuccess: boolean;

  setStage: (stage: LaunchStage) => void;
  toggleCreativeSelection: (id: string) => void;
  selectAllForProduct: (productId: string) => void;
  clearSelectionForProduct: (productId: string) => void;
  updateBatch: (productId: string, updates: Partial<LaunchBatch>) => void;
  initBatchesFromSelection: () => void;
  simulateLaunch: () => Promise<void>;
  resetFlow: () => void;
  setIsLoading: (v: boolean) => void;
}

export const useCreativeLaunchStore = create<CreativeLaunchState>()((set, get) => ({
  stage: 1,
  products: mockProducts,
  clickupCreatives: mockClickUpCreatives,
  selectedCreativeIds: [],
  batches: [],
  activeTests: mockActiveTests,
  isLoading: false,
  launchSuccess: false,

  setStage: (stage) => set({ stage }),

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

  simulateLaunch: async () => {
    set({ isLoading: true });
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    set({ isLoading: false, launchSuccess: true, stage: 5 });
  },

  resetFlow: () => {
    set({
      stage: 1,
      selectedCreativeIds: [],
      batches: [],
      launchSuccess: false,
      isLoading: false,
    });
  },

  setIsLoading: (v) => set({ isLoading: v }),
}));
