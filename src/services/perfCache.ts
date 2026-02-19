import { useStoreStore } from '@/stores/storeStore';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function buildStoreScopedKey(namespace: string, suffix?: string): string {
  const storeId = useStoreStore.getState().activeStoreId || 'no-store';
  return suffix ? `${namespace}:${storeId}:${suffix}` : `${namespace}:${storeId}`;
}

export async function memoizePromise<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = (async () => {
    const value = await fetcher();
    cache.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

export function clearCachePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}
