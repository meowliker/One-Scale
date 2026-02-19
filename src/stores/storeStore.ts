import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Store } from '@/types/store';

interface StoreState {
  stores: Store[];
  activeStoreId: string;
  loading: boolean;
  error: string | null;
  fetchStores: () => Promise<void>;
  setActiveStore: (storeId: string) => void;
  addStore: (data: {
    name: string;
    domain: string;
    platform?: string;
    shopifyApiKey?: string;
    shopifyApiSecret?: string;
  }) => Promise<Store>;
  removeStore: (storeId: string) => Promise<void>;
  addAdAccount: (
    storeId: string,
    account: { adAccountId: string; adAccountName: string; platform?: string; currency?: string; timezone?: string }
  ) => Promise<void>;
  removeAdAccount: (storeId: string, adAccountId: string) => Promise<void>;
  toggleAdAccount: (storeId: string, adAccountId: string) => Promise<void>;
}

export const useStoreStore = create<StoreState>()(
  persist(
    (set, get) => ({
      stores: [],
      activeStoreId: '',
      loading: false,
      error: null,

      fetchStores: async () => {
        set({ loading: true, error: null });
        try {
          const res = await fetch('/api/settings/stores');
          if (!res.ok) throw new Error('Failed to fetch stores');
          const data = await res.json();
          const stores: Store[] = data.stores || [];
          const { activeStoreId } = get();

          // If current activeStoreId doesn't exist in stores, pick the first one
          const validActive = stores.find((s) => s.id === activeStoreId);
          set({
            stores,
            activeStoreId: validActive ? activeStoreId : stores[0]?.id || '',
            loading: false,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          set({ loading: false, error: msg });
        }
      },

      setActiveStore: (storeId) => {
        set({ activeStoreId: storeId });
      },

      addStore: async (data) => {
        const res = await fetch('/api/settings/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: 'Failed to create store' }));
          throw new Error(errData.error || 'Failed to create store');
        }
        const { store } = await res.json();

        // Refresh stores from server
        await get().fetchStores();

        // Auto-select the new store if it's the first one
        const { stores } = get();
        if (stores.length === 1) {
          set({ activeStoreId: store.id });
        }

        return store;
      },

      removeStore: async (storeId) => {
        const res = await fetch(`/api/settings/stores?storeId=${encodeURIComponent(storeId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Failed to delete store');

        // Refresh stores from server
        await get().fetchStores();
      },

      addAdAccount: async (storeId, account) => {
        const res = await fetch('/api/settings/stores/ad-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            adAccountId: account.adAccountId,
            adAccountName: account.adAccountName,
            platform: account.platform || 'meta',
            currency: account.currency,
            timezone: account.timezone,
          }),
        });
        if (!res.ok) throw new Error('Failed to link ad account');

        // Refresh stores from server
        await get().fetchStores();
      },

      removeAdAccount: async (storeId, adAccountId) => {
        const res = await fetch('/api/settings/stores/ad-accounts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, adAccountId }),
        });
        if (!res.ok) throw new Error('Failed to unlink ad account');

        await get().fetchStores();
      },

      toggleAdAccount: async (storeId, adAccountId) => {
        // Find current state
        const store = get().stores.find((s) => s.id === storeId);
        const account = store?.adAccounts.find((a) => a.id === adAccountId || a.accountId === adAccountId);
        if (!account) return;

        const res = await fetch('/api/settings/stores/ad-accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId,
            adAccountId,
            isActive: !account.isActive,
          }),
        });
        if (!res.ok) throw new Error('Failed to toggle ad account');

        await get().fetchStores();
      },
    }),
    {
      name: 'multi-store',
      // Only persist activeStoreId, not the full store list (that comes from API)
      partialize: (state) => ({ activeStoreId: state.activeStoreId }),
    }
  )
);

/**
 * Get the timezone of the currently active store's ad account.
 * Can be called from anywhere (not just React components).
 */
export function getActiveStoreTimezone(): string {
  const state = useStoreStore.getState();
  const activeStore = state.stores.find((s) => s.id === state.activeStoreId);

  if (activeStore?.adAccounts?.length) {
    const activeAccount = activeStore.adAccounts.find((a) => a.isActive);
    if (activeAccount?.timezone) return activeAccount.timezone;
    if (activeStore.adAccounts[0]?.timezone) return activeStore.adAccounts[0].timezone;
  }

  return 'America/New_York'; // Default fallback
}
