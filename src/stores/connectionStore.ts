import { create } from 'zustand';
import type { ConnectionStatus } from '@/types/auth';

interface MappedAccount {
  adAccountId: string;
  adAccountName: string;
  platform: string;
  isActive: boolean;
}

interface ConnectionState {
  status: ConnectionStatus | null;
  mappedAccounts: MappedAccount[];
  loading: boolean;
  error: string | null;
  refreshStatus: (storeId: string) => Promise<void>;
  isMetaConnected: () => boolean;
  isShopifyConnected: () => boolean;
  getActiveMetaAccountIds: () => string[];
  reset: () => void;
}

const defaultStatus: ConnectionStatus = {
  meta: { connected: false },
  shopify: { connected: false },
};

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: null,
  mappedAccounts: [],
  loading: false,
  error: null,

  refreshStatus: async (storeId: string) => {
    set({ loading: true, error: null });
    try {
      // Fetch connection status and mapped accounts in parallel
      const [statusRes, accountsRes] = await Promise.all([
        fetch(`/api/auth/status?storeId=${encodeURIComponent(storeId)}`),
        fetch(`/api/settings/stores/ad-accounts?storeId=${encodeURIComponent(storeId)}`),
      ]);

      let data: ConnectionStatus = defaultStatus;
      if (statusRes.ok) {
        data = await statusRes.json();
      }

      let mapped: MappedAccount[] = [];
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        mapped = (accountsData.accounts || []).map(
          (a: { accountId: string; name: string; platform: string; isActive: boolean }) => ({
            adAccountId: a.accountId,
            adAccountName: a.name,
            platform: a.platform,
            isActive: a.isActive,
          })
        );
      }

      set({ status: data, mappedAccounts: mapped, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ status: defaultStatus, mappedAccounts: [], loading: false, error: message });
    }
  },

  isMetaConnected: () => {
    const { status } = get();
    return status?.meta.connected ?? false;
  },

  isShopifyConnected: () => {
    const { status } = get();
    return status?.shopify.connected ?? false;
  },

  getActiveMetaAccountIds: () => {
    const { mappedAccounts } = get();
    return mappedAccounts
      .filter((a) => a.platform === 'meta' && a.isActive)
      .map((a) => a.adAccountId);
  },

  reset: () => {
    set({ status: null, mappedAccounts: [], loading: false, error: null });
  },
}));
