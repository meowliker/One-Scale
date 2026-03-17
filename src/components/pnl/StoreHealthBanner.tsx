'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, PlugZap, CreditCard } from 'lucide-react';
import { useStoreStore } from '@/stores/storeStore';
import { cn } from '@/lib/utils';

interface StoreHealth {
  needsReauth: boolean;
  hasNoData: boolean;
  paymentGateway: 'shopify_payments' | 'other' | 'unknown';
  currency: string;
}

export function StoreHealthBanner() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [health, setHealth] = useState<StoreHealth | null>(null);

  useEffect(() => {
    if (!activeStoreId) return;

    async function check() {
      try {
        const res = await fetch(`/api/settings/store-health?storeId=${activeStoreId}`);
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      } catch {
        // Non-critical — don't show banner on error
      }
    }
    check();
  }, [activeStoreId]);

  if (!health) return null;

  // Token expired — needs reconnect
  if (health.needsReauth) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 mb-4">
        <PlugZap className="h-5 w-5 text-red-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">Connection expired</p>
          <p className="text-xs text-red-600 dark:text-red-400">Shopify access token expired. Data may be stale. Reconnect to resume sync.</p>
        </div>
        <a
          href="/dashboard/settings/integrations"
          className="text-xs font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50 px-3 py-1.5 rounded-md hover:bg-red-200 dark:hover:bg-red-900 transition-colors"
        >
          Reconnect
        </a>
      </div>
    );
  }

  // No data at all — needs setup
  if (health.hasNoData) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 mb-4">
        <PlugZap className="h-5 w-5 text-amber-500 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Store not synced</p>
          <p className="text-xs text-amber-600 dark:text-amber-400">No P&L data found. Connect Shopify and wait for the first sync to complete.</p>
        </div>
        <a
          href="/dashboard/settings/integrations"
          className="text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 px-3 py-1.5 rounded-md hover:bg-amber-200 dark:hover:bg-amber-900 transition-colors"
        >
          Connect Store
        </a>
      </div>
    );
  }

  // Non-Shopify Payments gateway
  if (health.paymentGateway === 'other') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface border border-border mb-4">
        <CreditCard className="h-3.5 w-3.5 text-text-muted flex-shrink-0" />
        <p className="text-[11px] text-text-muted">
          Using order data &bull; Fees estimated
          <span className="ml-1 text-text-muted/50">&mdash; This store uses a non-Shopify payment gateway</span>
        </p>
      </div>
    );
  }

  return null;
}
