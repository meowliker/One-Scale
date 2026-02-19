import type { Store, AdAccount } from '@/types/store';

async function readJsonSafe<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export async function getStores(): Promise<Store[]> {
  const response = await fetch('/api/settings/stores');
  if (!response.ok) throw new Error('Failed to fetch stores');
  const data = await readJsonSafe<{ stores?: Store[] }>(response);
  return data.stores || [];
}

export async function getAdAccounts(storeId: string): Promise<AdAccount[]> {
  const response = await fetch(`/api/settings/stores/ad-accounts?storeId=${encodeURIComponent(storeId)}`);
  if (!response.ok) throw new Error('Failed to fetch ad accounts');
  const data = await readJsonSafe<{ accounts?: AdAccount[] }>(response);
  return data.accounts || [];
}

export async function updateAdAccountStatus(
  storeId: string,
  accountId: string,
  isActive: boolean
): Promise<void> {
  const response = await fetch('/api/settings/stores/ad-accounts', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeId, adAccountId: accountId, isActive }),
  });
  if (!response.ok) throw new Error('Failed to update ad account');
}
