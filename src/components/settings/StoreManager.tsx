'use client';

import { useState } from 'react';
import { Plus, Globe, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStoreStore } from '@/stores/storeStore';
import { AdAccountMapper } from './AdAccountMapper';
import { AddStoreModal } from './AddStoreModal';

const platformBadge: Record<string, { label: string; className: string }> = {
  shopify: { label: 'Shopify', className: 'bg-green-100 text-green-800' },
  woocommerce: { label: 'WooCommerce', className: 'bg-purple-100 text-purple-800' },
  custom: { label: 'Custom', className: 'bg-gray-100 text-gray-800' },
};

export function StoreManager() {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const { stores, removeStore } = useStoreStore();
  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {stores.length} store{stores.length !== 1 ? 's' : ''} connected
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Store
        </button>
      </div>

      {/* Store cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.map((store) => {
          const badge = platformBadge[store.platform];
          const activeAccounts = store.adAccounts.filter((a) => a.isActive).length;
          const isSelected = store.id === selectedStoreId;

          return (
            <div
              key={store.id}
              className={cn(
                'group relative cursor-pointer rounded-lg border bg-white p-4 transition-all hover:shadow-md',
                isSelected
                  ? 'border-blue-500 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-gray-300'
              )}
              onClick={() =>
                setSelectedStoreId(isSelected ? null : store.id)
              }
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-600">
                    {store.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {store.name}
                    </h3>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Globe className="h-3 w-3" />
                      {store.domain}
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className={cn(
                    'h-4 w-4 text-gray-400 transition-transform',
                    isSelected && 'rotate-90'
                  )}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize',
                    badge.className
                  )}
                >
                  {badge.label}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {activeAccounts}/{store.adAccounts.length} accounts active
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeStore(store.id);
                      if (isSelected) setSelectedStoreId(null);
                    }}
                    className="rounded-md p-1 text-gray-400 opacity-0 hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 transition-all"
                    title="Remove store"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Ad account mapper for selected store */}
      {selectedStore && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Ad Accounts — {selectedStore.name}
          </h2>
          <AdAccountMapper
            storeId={selectedStore.id}
            accounts={selectedStore.adAccounts}
          />
        </div>
      )}

      {/* Add store modal */}
      <AddStoreModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
      />
    </div>
  );
}
