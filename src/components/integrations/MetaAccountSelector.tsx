'use client';

import { useState, useEffect } from 'react';
import { X, Globe, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface MetaAdAccount {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  timezone: string;
}

interface MetaAccountSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  onAccountSelected: (account: MetaAdAccount) => void;
}

export function MetaAccountSelector({
  isOpen,
  onClose,
  storeId,
  onAccountSelected,
}: MetaAccountSelectorProps) {
  const [accounts, setAccounts] = useState<MetaAdAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    async function fetchAccounts() {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/meta/accounts?storeId=${encodeURIComponent(storeId)}`
        );
        if (!response.ok) {
          throw new Error('Failed to fetch ad accounts');
        }
        const data = await response.json();
        setAccounts(data.data || []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error loading accounts';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }

    fetchAccounts();
  }, [isOpen, storeId]);

  if (!isOpen) return null;

  const handleSelect = async () => {
    if (!selectedId) return;
    const account = accounts.find((a) => a.id === selectedId);
    if (!account) return;

    try {
      // Save the selected account to the database
      const response = await fetch('/api/meta/select-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          accountId: account.id,
          accountName: account.name,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save account selection');
      }

      onAccountSelected(account);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error saving account';
      toast.error(message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Globe className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Select Ad Account</h3>
            <p className="text-sm text-gray-500">Choose the Meta ad account to connect</p>
          </div>
        </div>

        {/* Account List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            <span className="ml-2 text-sm text-gray-500">Loading accounts...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">No ad accounts found.</p>
            <p className="mt-1 text-xs text-gray-400">
              Make sure your Meta account has active ad accounts.
            </p>
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {accounts.map((account) => (
              <button
                key={account.id}
                onClick={() => setSelectedId(account.id)}
                className={cn(
                  'w-full rounded-lg border p-3 text-left transition-colors',
                  selectedId === account.id
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{account.name}</p>
                    <p className="text-xs text-gray-500">
                      {account.id} &middot; {account.currency} &middot; {account.timezone}
                    </p>
                  </div>
                  <div
                    className={cn(
                      'h-4 w-4 rounded-full border-2 transition-colors',
                      selectedId === account.id
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300'
                    )}
                  />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSelect}
            disabled={!selectedId}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white',
              selectedId
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-300 cursor-not-allowed'
            )}
          >
            Connect Account
          </button>
        </div>
      </div>
    </div>
  );
}
