'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Store, ChevronDown, Search, Settings, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { useConnectionStore } from '@/stores/connectionStore';

const platformColors: Record<string, string> = {
  shopify: 'bg-emerald-500/10 text-emerald-400',
  woocommerce: 'bg-purple-500/10 text-purple-400',
  custom: 'bg-surface-hover text-text-secondary',
};

export function StoreSwitcher({ isCollapsed }: { isCollapsed: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { stores, activeStoreId, setActiveStore, fetchStores, loading } = useStoreStore();
  const refreshConnectionStatus = useConnectionStore((s) => s.refreshStatus);

  // Fetch stores on mount
  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  // Initialize connection store when active store changes
  useEffect(() => {
    if (activeStoreId) {
      refreshConnectionStatus(activeStoreId);
    }
  }, [activeStoreId, refreshConnectionStatus]);
  const activeStore = stores.find((s) => s.id === activeStoreId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredStores = stores.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.domain.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors',
          isCollapsed && 'justify-center px-2'
        )}
      >
        <Store className="h-4 w-4 shrink-0 text-text-muted" />
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-text-primary">
                {activeStore?.name ?? 'Select Store'}
              </p>
              <p className="truncate text-xs text-text-muted">
                {activeStore?.domain ?? ''}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-text-dimmed transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </>
        )}
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1 w-72 rounded-lg border border-border bg-surface-elevated shadow-lg',
            isCollapsed ? 'left-full ml-2 top-0' : 'left-0'
          )}
        >
          {/* Search */}
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-dimmed" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stores..."
                className="w-full rounded-md border border-border-light bg-surface-elevated py-1.5 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
          </div>

          {/* Store list */}
          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center gap-2 px-3 py-4">
                <Loader2 className="h-4 w-4 animate-spin text-text-dimmed" />
                <span className="text-sm text-text-muted">Loading stores...</span>
              </div>
            ) : filteredStores.length === 0 && stores.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-text-muted">No stores connected</p>
                <Link
                  href="/dashboard/settings/stores"
                  onClick={() => { setIsOpen(false); setSearch(''); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary-light hover:text-primary"
                >
                  <Plus className="h-3 w-3" />
                  Add your first store
                </Link>
              </div>
            ) : filteredStores.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-text-muted">
                No stores found
              </p>
            ) : (
              filteredStores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => {
                    setActiveStore(store.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-hover transition-colors',
                    store.id === activeStoreId && 'bg-primary/10'
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-hover text-xs font-semibold text-text-secondary">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {store.name}
                    </p>
                    <p className="truncate text-xs text-text-muted">{store.domain}</p>
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize',
                      platformColors[store.platform]
                    )}
                  >
                    {store.platform}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Manage stores link */}
          <div className="border-t border-border p-2">
            <Link
              href="/dashboard/settings/stores"
              onClick={() => {
                setIsOpen(false);
                setSearch('');
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage Stores
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
