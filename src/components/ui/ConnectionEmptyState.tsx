'use client';

import { PlugZap, Database } from 'lucide-react';
import Link from 'next/link';

interface ConnectionEmptyStateProps {
  reason: 'not_connected' | 'no_accounts' | 'error';
  message?: string;
}

export function ConnectionEmptyState({ reason, message }: ConnectionEmptyStateProps) {
  if (reason === 'not_connected') {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-5">
          <PlugZap className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">Connect your Meta account</h2>
        <p className="mt-2 max-w-md text-center text-sm text-text-secondary">
          This page requires a connected Meta Ads account to display real data.
          Head to Integrations to connect your Facebook Business account.
        </p>
        <Link
          href="/dashboard/settings/integrations"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <PlugZap className="h-4 w-4" />
          Go to Integrations
        </Link>
      </div>
    );
  }

  if (reason === 'no_accounts') {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 mb-5">
          <Database className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-semibold text-text-primary">No ad accounts linked</h2>
        <p className="mt-2 max-w-md text-center text-sm text-text-secondary">
          Your Meta account is connected, but no ad accounts are linked to this store.
          Go to Integrations and link at least one ad account to start seeing data.
        </p>
        <Link
          href="/dashboard/settings/integrations"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Database className="h-4 w-4" />
          Link Ad Accounts
        </Link>
      </div>
    );
  }

  // Generic error
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 mb-5">
        <PlugZap className="h-8 w-8 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">Something went wrong</h2>
      <p className="mt-2 max-w-md text-center text-sm text-text-secondary">
        {message || 'Failed to load data. Please try again or check your connection settings.'}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
