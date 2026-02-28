'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { getQueryClient, getStoragePersister } from '@/lib/queryClient';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const persister = getStoragePersister();

  // On the server (or if localStorage unavailable), fall back to plain provider
  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 30 * 60 * 1000, // 30 minutes — matches gcTime
        buster: 'v1',
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
