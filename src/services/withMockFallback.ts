import { useConnectionStore } from '@/stores/connectionStore';
import toast from 'react-hot-toast';

type Platform = 'meta' | 'shopify';

/**
 * Custom error class to signal that no data is available because
 * the platform is not connected or no accounts are mapped.
 * Pages should catch this and render an empty state.
 */
export class NotConnectedError extends Error {
  public readonly reason: 'not_connected' | 'no_accounts';

  constructor(reason: 'not_connected' | 'no_accounts', platform: Platform) {
    const msg =
      reason === 'not_connected'
        ? `${platform} is not connected. Please connect in Settings → Integrations.`
        : `No ${platform} ad accounts are linked. Please link accounts in Settings → Integrations.`;
    super(msg);
    this.name = 'NotConnectedError';
    this.reason = reason;
  }
}

/**
 * Creates a service function that:
 * - Throws NotConnectedError when the platform is not connected or no accounts are mapped
 *   (pages catch this to show empty state — NO mock data)
 * - Calls the real API when connected AND at least one active account is mapped
 * - Re-throws API errors so the page can handle them (no silent mock fallback)
 *
 * IMPORTANT: When connection status hasn't loaded yet (status === null),
 * we throw NotConnectedError so the page stays in loading state rather than
 * flashing mock data. The page re-fetches once connection status resolves.
 */
export function createServiceFn<T, Args extends unknown[] = []>(
  platform: Platform,
  mockFn: (...args: Args) => Promise<T>,
  realFn: (...args: Args) => Promise<T>
): (...args: Args) => Promise<T> {
  return async (...args: Args) => {
    const store = useConnectionStore.getState();

    // If connection status hasn't loaded yet, throw so the page stays in loading state.
    // This prevents mock data from flashing before real data arrives.
    if (store.status === null) {
      throw new NotConnectedError('not_connected', platform);
    }

    const isConnected =
      platform === 'meta'
        ? store.isMetaConnected()
        : store.isShopifyConnected();

    // For Meta, also require at least one active mapped account
    const hasActiveAccounts =
      platform === 'meta'
        ? store.getActiveMetaAccountIds().length > 0
        : true;

    // When not connected or no accounts, throw so the page shows empty state
    if (!isConnected || !hasActiveAccounts) {
      throw new NotConnectedError(
        !isConnected ? 'not_connected' : 'no_accounts',
        platform
      );
    }

    try {
      return await realFn(...args);
    } catch (err) {
      if (err instanceof NotConnectedError) throw err;
      const message = err instanceof Error ? err.message : 'API call failed';
      toast.error(`${platform} API error: ${message}`);
      // Re-throw so the page can handle the error state properly.
      // Never fall back to mock data — users should see real data or an error.
      throw err;
    }
  };
}
