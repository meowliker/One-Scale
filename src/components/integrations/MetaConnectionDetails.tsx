'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  User,
  Building2,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Loader2,
  RefreshCw,
  AlertCircle,
  Search,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import toast from 'react-hot-toast';

interface AdAccount {
  id: string;
  name: string;
  accountId: string;
  currency: string;
  timezone: string;
  status: number;
  statusLabel: string;
  amountSpent: string;
  business: { id: string; name: string } | null;
}

interface MetaDetails {
  connected: boolean;
  user: { id: string; name: string; email?: string } | null;
  businesses: { id: string; name: string }[];
  adAccounts: AdAccount[];
  selectedAccounts: { id: string; name: string }[];
  connectedAt: string;
  lastSynced: string;
}

interface MetaConnectionDetailsProps {
  storeId: string;
  storeName: string;
  onAccountSelected?: () => void;
}

interface BMGroup {
  id: string;
  name: string;
  accounts: AdAccount[];
}

export function MetaConnectionDetails({
  storeId,
  storeName,
  onAccountSelected,
}: MetaConnectionDetailsProps) {
  const [details, setDetails] = useState<MetaDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedBMs, setExpandedBMs] = useState<Set<string>>(new Set());
  const [togglingAccounts, setTogglingAccounts] = useState<Set<string>>(new Set());

  const addAdAccount = useStoreStore((s) => s.addAdAccount);
  const removeAdAccount = useStoreStore((s) => s.removeAdAccount);

  async function fetchDetails() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/auth/meta/details?storeId=${encodeURIComponent(storeId)}`
      );
      if (!res.ok) {
        if (res.status === 401) {
          setError('Not connected');
          return;
        }
        throw new Error('Failed to fetch');
      }
      const data = await res.json();
      setDetails(data);
      // Auto-expand all BMs on first load
      if (data.businesses) {
        setExpandedBMs(new Set([...data.businesses.map((b: { id: string }) => b.id), '__personal__']));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Group accounts by Business Manager
  const { bmGroups, personalAccounts } = useMemo(() => {
    if (!details) return { bmGroups: [] as BMGroup[], personalAccounts: [] as AdAccount[] };

    const searchLower = search.toLowerCase();
    const filtered = details.adAccounts.filter(
      (acc) =>
        acc.name.toLowerCase().includes(searchLower) ||
        acc.id.toLowerCase().includes(searchLower) ||
        acc.accountId.toLowerCase().includes(searchLower) ||
        (acc.business?.name.toLowerCase().includes(searchLower) ?? false)
    );

    const bmMap = new Map<string, BMGroup>();
    const personal: AdAccount[] = [];

    for (const acc of filtered) {
      if (acc.business) {
        if (!bmMap.has(acc.business.id)) {
          bmMap.set(acc.business.id, {
            id: acc.business.id,
            name: acc.business.name,
            accounts: [],
          });
        }
        bmMap.get(acc.business.id)!.accounts.push(acc);
      } else {
        personal.push(acc);
      }
    }

    // Sort BMs by name
    const groups = Array.from(bmMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { bmGroups: groups, personalAccounts: personal };
  }, [details, search]);

  // Check if an account is selected (linked to the store)
  const selectedIds = useMemo(() => {
    if (!details?.selectedAccounts) return new Set<string>();
    return new Set(details.selectedAccounts.map((a) => a.id));
  }, [details?.selectedAccounts]);

  const linkedCount = selectedIds.size;

  async function handleToggleAccount(account: AdAccount) {
    const isCurrentlySelected = selectedIds.has(account.id);
    setTogglingAccounts((prev) => new Set(prev).add(account.id));

    try {
      if (isCurrentlySelected) {
        // Unlink
        await removeAdAccount(storeId, account.id);
        setDetails((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            selectedAccounts: prev.selectedAccounts.filter((a) => a.id !== account.id),
          };
        });
        toast.success(`${account.name} unlinked`);
      } else {
        // Link
        await addAdAccount(storeId, {
          adAccountId: account.id,
          adAccountName: account.name,
          platform: 'meta',
          currency: account.currency,
          timezone: account.timezone,
        });
        setDetails((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            selectedAccounts: [...prev.selectedAccounts, { id: account.id, name: account.name }],
          };
        });
        toast.success(`${account.name} linked to ${storeName}`);
      }
      onAccountSelected?.();
    } catch {
      toast.error('Failed to update account mapping');
    } finally {
      setTogglingAccounts((prev) => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  }

  function toggleBMExpansion(bmId: string) {
    setExpandedBMs((prev) => {
      const next = new Set(prev);
      if (next.has(bmId)) {
        next.delete(bmId);
      } else {
        next.add(bmId);
      }
      return next;
    });
  }

  function formatSpent(cents: string, currency: string) {
    const amount = parseInt(cents, 10) / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString()}`;
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm text-gray-500">Loading Meta connection details...</span>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{error || 'No connection data'}</span>
        </div>
      </div>
    );
  }

  const totalAccounts = details.adAccounts.length;
  const filteredCount = bmGroups.reduce((n, g) => n + g.accounts.length, 0) + personalAccounts.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Meta Ads Connection</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {details.user && (
                <span className="text-xs text-gray-500">
                  {details.user.name}
                  {details.user.email && ` · ${details.user.email}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {linkedCount > 0 && (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {linkedCount} account{linkedCount !== 1 ? 's' : ''} linked
            </span>
          )}
          <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Connected
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchDetails();
            }}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Connected User */}
          {details.user && (
            <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50 border-b border-gray-100">
              <User className="h-4 w-4 text-gray-400" />
              <div>
                <span className="text-xs font-medium text-gray-700">Connected as: </span>
                <span className="text-xs text-gray-600">
                  {details.user.name} (ID: {details.user.id})
                </span>
              </div>
            </div>
          )}

          {/* Search Bar */}
          <div className="px-5 py-3 border-b border-gray-100">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ad accounts by name, ID, or business manager..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                  {filteredCount} of {totalAccounts}
                </span>
              )}
            </div>
          </div>

          {/* Ad Accounts grouped by BM */}
          <div className="max-h-[500px] overflow-y-auto">
            {bmGroups.length === 0 && personalAccounts.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <BarChart3 className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-2 text-sm text-gray-500">
                  {search ? 'No ad accounts match your search.' : 'No ad accounts found.'}
                </p>
              </div>
            ) : (
              <>
                {/* BM Groups */}
                {bmGroups.map((group) => {
                  const isExpanded = expandedBMs.has(group.id);
                  const linkedInGroup = group.accounts.filter((a) => selectedIds.has(a.id)).length;

                  return (
                    <div key={group.id} className="border-b border-gray-100 last:border-b-0">
                      {/* BM Header */}
                      <button
                        onClick={() => toggleBMExpansion(group.id)}
                        className="flex w-full items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          )}
                          <Building2 className="h-4 w-4 text-purple-500" />
                          <span className="text-sm font-medium text-gray-900">{group.name}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            {group.accounts.length} account{group.accounts.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {linkedInGroup > 0 && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                            {linkedInGroup} linked
                          </span>
                        )}
                      </button>

                      {/* BM accounts */}
                      {isExpanded && (
                        <div className="bg-gray-50/30 pb-2">
                          {group.accounts.map((acc) => (
                            <AdAccountToggleRow
                              key={acc.id}
                              account={acc}
                              isLinked={selectedIds.has(acc.id)}
                              isToggling={togglingAccounts.has(acc.id)}
                              formatSpent={formatSpent}
                              onToggle={() => handleToggleAccount(acc)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Personal Accounts */}
                {personalAccounts.length > 0 && (
                  <div className="border-b border-gray-100 last:border-b-0">
                    <button
                      onClick={() => toggleBMExpansion('__personal__')}
                      className="flex w-full items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedBMs.has('__personal__') ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <User className="h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium text-gray-900">Personal Accounts</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                          {personalAccounts.length} account{personalAccounts.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {personalAccounts.filter((a) => selectedIds.has(a.id)).length > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          {personalAccounts.filter((a) => selectedIds.has(a.id)).length} linked
                        </span>
                      )}
                    </button>

                    {expandedBMs.has('__personal__') && (
                      <div className="bg-gray-50/30 pb-2">
                        {personalAccounts.map((acc) => (
                          <AdAccountToggleRow
                            key={acc.id}
                            account={acc}
                            isLinked={selectedIds.has(acc.id)}
                            isToggling={togglingAccounts.has(acc.id)}
                            formatSpent={formatSpent}
                            onToggle={() => handleToggleAccount(acc)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────── Ad Account Row with Toggle ─────────────── */

function AdAccountToggleRow({
  account,
  isLinked,
  isToggling,
  formatSpent,
  onToggle,
}: {
  account: AdAccount;
  isLinked: boolean;
  isToggling: boolean;
  formatSpent: (cents: string, currency: string) => string;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        'mx-5 mt-2 flex items-center justify-between rounded-lg border p-3 transition-colors',
        isLinked
          ? 'border-blue-200 bg-blue-50/50'
          : 'border-gray-200 bg-white hover:border-gray-300'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{account.name}</span>
          <span
            className={cn(
              'inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
              account.status === 1
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-500'
            )}
          >
            {account.statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-gray-400">{account.id}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-400">{account.currency}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500">
            Spent: {formatSpent(account.amountSpent, account.currency)}
          </span>
        </div>
      </div>

      {/* Toggle / checkbox button */}
      <button
        onClick={onToggle}
        disabled={isToggling}
        className={cn(
          'shrink-0 ml-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
          isToggling && 'opacity-50 cursor-wait',
          isLinked
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
            : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
        )}
      >
        {isToggling ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : isLinked ? (
          <>
            <Check className="h-3 w-3" />
            Linked
          </>
        ) : (
          'Link'
        )}
      </button>
    </div>
  );
}
