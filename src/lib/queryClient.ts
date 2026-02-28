'use client';

import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        gcTime: 30 * 60 * 1000, // 30 minutes
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse the same client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

let persisterInstance: ReturnType<typeof createSyncStoragePersister> | undefined;

export function getStoragePersister() {
  if (typeof window === 'undefined') return undefined;
  if (!persisterInstance) {
    persisterInstance = createSyncStoragePersister({
      storage: window.localStorage,
      key: 'onescale:query-cache',
      throttleTime: 1000,
    });
  }
  return persisterInstance;
}
