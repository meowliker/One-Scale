'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import type { AdAccount, AdPlatform } from '@/types/store';
import toast from 'react-hot-toast';

const platformBadge: Record<AdPlatform, { label: string; className: string }> = {
  meta: { label: 'Meta', className: 'bg-blue-100 text-blue-800' },
  google: { label: 'Google', className: 'bg-red-100 text-red-800' },
  tiktok: { label: 'TikTok', className: 'bg-[#1d1d1f] text-white' },
};

interface AdAccountMapperProps {
  storeId: string;
  accounts: AdAccount[];
}

export function AdAccountMapper({ storeId, accounts }: AdAccountMapperProps) {
  const toggleAdAccount = useStoreStore((s) => s.toggleAdAccount);
  const removeAdAccount = useStoreStore((s) => s.removeAdAccount);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-sm text-gray-500">No ad accounts connected to this store.</p>
        <p className="mt-1 text-xs text-gray-400">
          Link ad accounts from the Meta connection panel on the Integrations page.
        </p>
      </div>
    );
  }

  async function handleToggle(accountId: string) {
    setTogglingIds((prev) => new Set(prev).add(accountId));
    try {
      await toggleAdAccount(storeId, accountId);
    } catch {
      toast.error('Failed to toggle account');
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  }

  async function handleRemove(accountId: string, accountName: string) {
    setRemovingIds((prev) => new Set(prev).add(accountId));
    try {
      await removeAdAccount(storeId, accountId);
      toast.success(`${accountName} removed`);
    } catch {
      toast.error('Failed to remove account');
    } finally {
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(accountId);
        return next;
      });
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Account Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Account ID
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Platform
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Currency
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {accounts.map((account) => {
            const badge = platformBadge[account.platform];
            const isToggling = togglingIds.has(account.accountId);
            const isRemoving = removingIds.has(account.accountId);

            return (
              <tr key={account.id} className="hover:bg-gray-50 transition-colors">
                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {account.name}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm font-mono text-gray-600">
                  {account.accountId}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      badge.className
                    )}
                  >
                    {badge.label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                  {account.currency}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => handleToggle(account.accountId)}
                    disabled={isToggling}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      account.isActive
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {isToggling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          account.isActive ? 'bg-green-500' : 'bg-gray-400'
                        )}
                      />
                    )}
                    {account.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button
                    onClick={() => handleRemove(account.accountId, account.name)}
                    disabled={isRemoving}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                  >
                    {isRemoving ? (
                      <Loader2 className="h-3 w-3 animate-spin inline" />
                    ) : (
                      'Remove'
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
