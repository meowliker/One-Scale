import { create } from 'zustand';

interface DataFetchState {
  lastRefreshed: Date | null;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
}

export const useDataFetchStore = create<DataFetchState>()((set) => ({
  lastRefreshed: null,
  isRefreshing: false,

  refresh: async () => {
    set({ isRefreshing: true });

    // Mock network delay — replace with real API calls when backend is available
    await new Promise((resolve) => setTimeout(resolve, 1500));

    set({
      isRefreshing: false,
      lastRefreshed: new Date(),
    });
  },
}));
