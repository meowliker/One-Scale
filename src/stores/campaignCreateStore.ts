import { create } from 'zustand';
import { todayInTimezone } from '@/lib/timezone';
import type { CampaignObjective, BidStrategy, CTAType } from '@/types/campaign';
import type {
  CampaignCreateAIContext,
  CampaignCreateAnalysis,
  CampaignCreateCopyOption,
  CampaignPublishSettings,
  CampaignSetupOptions,
  CampaignUploadedAsset,
  CampaignWinnerChip,
  CampaignWinnerKey,
} from '@/types/campaignCreate';

const DEFAULT_URL_TAGS =
  'utm_source=FbAds&utm_medium={{adset.name}}&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}';

interface TargetingState {
  ageMin: number;
  ageMax: number;
  genders: string[];
  locations: string[];
  interests: string[];
}

interface BudgetState {
  type: 'daily' | 'lifetime';
  amount: number;
  bidStrategy: BidStrategy;
  bidAmount: number | null;
}

interface ScheduleState {
  startDate: string;
  endDate: string | null;
}

interface CreativeState {
  type: 'image' | 'video';
  headline: string;
  body: string;
  description: string;
  ctaType: CTAType;
}

interface CampaignCreateState {
  currentStep: number;
  objective: CampaignObjective | null;
  targeting: TargetingState;
  budget: BudgetState;
  schedule: ScheduleState;
  creative: CreativeState;
  analysisLoading: boolean;
  analysisError: string | null;
  winnerChips: Partial<Record<CampaignWinnerKey, CampaignWinnerChip>>;
  ourCopyOptions: CampaignCreateCopyOption[];
  aiContext: CampaignCreateAIContext;
  setupOptions: CampaignSetupOptions | null;
  setupOptionsLoading: boolean;
  setupOptionsError: string | null;
  publishSettings: CampaignPublishSettings;
  uploadedAsset: CampaignUploadedAsset | null;
  nextStep: () => void;
  prevStep: () => void;
  setObjective: (objective: CampaignObjective) => void;
  setTargeting: (targeting: Partial<TargetingState>) => void;
  setBudget: (budget: Partial<BudgetState>) => void;
  setSchedule: (schedule: Partial<ScheduleState>) => void;
  setCreative: (creative: Partial<CreativeState>) => void;
  setAnalysisLoading: (loading: boolean) => void;
  setAnalysisError: (error: string | null) => void;
  setAnalysisData: (data: CampaignCreateAnalysis) => void;
  setSetupOptionsLoading: (loading: boolean) => void;
  setSetupOptionsError: (error: string | null) => void;
  setSetupOptions: (data: CampaignSetupOptions) => void;
  setPublishSettings: (settings: Partial<CampaignPublishSettings>) => void;
  setUploadedAsset: (asset: CampaignUploadedAsset | null) => void;
  reset: () => void;
}

const defaultTargeting: TargetingState = {
  ageMin: 18,
  ageMax: 65,
  genders: ['all'],
  locations: ['United States'],
  interests: [],
};

const defaultBudget: BudgetState = {
  type: 'daily',
  amount: 50,
  bidStrategy: 'LOWEST_COST',
  bidAmount: null,
};

function buildDefaultSchedule(): ScheduleState {
  return {
    startDate: todayInTimezone(),
    endDate: null,
  };
}

const defaultCreative: CreativeState = {
  type: 'image',
  headline: '',
  body: '',
  description: '',
  ctaType: 'SHOP_NOW',
};

const defaultAIContext: CampaignCreateAIContext = {
  topHeadlines: [],
  topPrimaryTexts: [],
  topCtas: [],
  winningAngles: [],
};

function buildDefaultPublishSettings(): CampaignPublishSettings {
  const dateLabel = todayInTimezone();
  return {
    accountId: '',
    campaignName: `Campaign ${dateLabel}`,
    adSetName: `Ad Set ${dateLabel}`,
    adName: `Ad ${dateLabel}`,
    destinationUrl: '',
    urlTags: DEFAULT_URL_TAGS,
    pageId: '',
    instagramActorId: '',
    pixelId: '',
    conversionEvent: 'PURCHASE',
    customConversionId: '',
    publishNow: false,
  };
}

export const useCampaignCreateStore = create<CampaignCreateState>()((set, get) => ({
  currentStep: 0,
  objective: null,
  targeting: { ...defaultTargeting },
  budget: { ...defaultBudget },
  schedule: buildDefaultSchedule(),
  creative: { ...defaultCreative },
  analysisLoading: false,
  analysisError: null,
  winnerChips: {},
  ourCopyOptions: [],
  aiContext: { ...defaultAIContext },
  setupOptions: null,
  setupOptionsLoading: false,
  setupOptionsError: null,
  publishSettings: buildDefaultPublishSettings(),
  uploadedAsset: null,

  nextStep: () => {
    const { currentStep } = get();
    if (currentStep < 4) {
      set({ currentStep: currentStep + 1 });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) {
      set({ currentStep: currentStep - 1 });
    }
  },

  setObjective: (objective) => {
    set({ objective });
  },

  setTargeting: (targeting) => {
    const current = get().targeting;
    set({ targeting: { ...current, ...targeting } });
  },

  setBudget: (budget) => {
    const current = get().budget;
    set({ budget: { ...current, ...budget } });
  },

  setSchedule: (schedule) => {
    const current = get().schedule;
    set({ schedule: { ...current, ...schedule } });
  },

  setCreative: (creative) => {
    const current = get().creative;
    set({ creative: { ...current, ...creative } });
  },

  setAnalysisLoading: (loading) => {
    set({ analysisLoading: loading });
  },

  setAnalysisError: (error) => {
    set({ analysisError: error });
  },

  setAnalysisData: (data) => {
    set({
      winnerChips: data.winnerChips,
      ourCopyOptions: data.ourCopyOptions,
      aiContext: data.aiContext,
    });
  },

  setSetupOptionsLoading: (loading) => {
    set({ setupOptionsLoading: loading });
  },

  setSetupOptionsError: (error) => {
    set({ setupOptionsError: error });
  },

  setSetupOptions: (data) => {
    const existingOptions = get().setupOptions;
    const mergedOptions: CampaignSetupOptions = {
      ...data,
      pages: data.pages.length > 0 ? data.pages : (existingOptions?.pages || []),
      instagramAccounts:
        data.instagramAccounts.length > 0 ? data.instagramAccounts : (existingOptions?.instagramAccounts || []),
      pixels: data.pixels.length > 0 ? data.pixels : (existingOptions?.pixels || []),
      customConversions:
        data.customConversions.length > 0 ? data.customConversions : (existingOptions?.customConversions || []),
    };
    const current = get().publishSettings;
    const accountId = current.accountId || mergedOptions.defaultAccountId || mergedOptions.accounts[0]?.id || '';
    const pageId = current.pageId || mergedOptions.pages[0]?.id || '';
    const instagramActorId =
      current.instagramActorId ||
      mergedOptions.instagramAccounts[0]?.id ||
      mergedOptions.pages[0]?.instagramAccountId ||
      '';
    const pixelId = current.pixelId || mergedOptions.pixels[0]?.id || '';

    set({
      setupOptions: mergedOptions,
      publishSettings: {
        ...current,
        accountId,
        pageId,
        instagramActorId,
        pixelId,
      },
    });
  },

  setPublishSettings: (settings) => {
    const current = get().publishSettings;
    set({ publishSettings: { ...current, ...settings } });
  },

  setUploadedAsset: (asset) => {
    set({ uploadedAsset: asset });
  },

  reset: () => {
    set({
      currentStep: 0,
      objective: null,
      targeting: { ...defaultTargeting },
      budget: { ...defaultBudget },
      schedule: buildDefaultSchedule(),
      creative: { ...defaultCreative },
      analysisLoading: false,
      analysisError: null,
      winnerChips: {},
      ourCopyOptions: [],
      aiContext: { ...defaultAIContext },
      setupOptions: null,
      setupOptionsLoading: false,
      setupOptionsError: null,
      publishSettings: buildDefaultPublishSettings(),
      uploadedAsset: null,
    });
  },
}));
