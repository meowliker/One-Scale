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

const CONNECTION_CACHE_KEY = 'onescale:connection-cache';

/** Read cached connection state from localStorage for instant hydration */
function readConnectionCache(storeId: string): { status: ConnectionStatus; mappedAccounts: MappedAccount[] } | null {
  try {
    const raw = localStorage.getItem(`${CONNECTION_CACHE_KEY}:${storeId}`);
    if (!raw) return null;
    const { status, mappedAccounts, ts } = JSON.parse(raw);
    // Use cache if less than 30 minutes old
    if (Date.now() - ts > 30 * 60 * 1000) return null;
    return { status, mappedAccounts };
  } catch {
    return null;
  }
}

/** Write connection state to localStorage */
function writeConnectionCache(storeId: string, status: ConnectionStatus, mappedAccounts: MappedAccount[]) {
  try {
    localStorage.setItem(`${CONNECTION_CACHE_KEY}:${storeId}`, JSON.stringify({ status, mappedAccounts, ts: Date.now() }));
  } catch { /* quota exceeded */ }
}

export const useConnectionStore = create<ConnectionState>()((set, get) => ({
  status: null,
  mappedAccounts: [],
  loading: false,
  error: null,

  refreshStatus: async (storeId: string) => {
    // Hydrate from localStorage immediately if available (eliminates skeleton flash)
    const cached = typeof window !== 'undefined' ? readConnectionCache(storeId) : null;
    if (cached && get().status === null) {
      set({ status: cached.status, mappedAccounts: cached.mappedAccounts, loading: true, error: null });
    } else {
      set({ loading: true, error: null });
    }
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
      if (typeof window !== 'undefined') writeConnectionCache(storeId, data, mapped);
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
