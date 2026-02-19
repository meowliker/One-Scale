'use client';

import { useState } from 'react';
import { X, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShopifyConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
}

export function ShopifyConnectModal({ isOpen, onClose, storeId }: ShopifyConnectModalProps) {
  const [shopDomain, setShopDomain] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleaned = shopDomain
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    if (!cleaned) {
      setError('Please enter your Shopify store domain');
      return;
    }

    if (!cleaned.includes('.myshopify.com') && !cleaned.includes('.')) {
      setError('Please enter a valid domain (e.g., my-store.myshopify.com)');
      return;
    }

    // Open Shopify OAuth in a popup
    const url = `/api/auth/shopify?storeId=${encodeURIComponent(storeId)}&shop=${encodeURIComponent(cleaned)}`;
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url,
      'shopify_oauth',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    );
    // Fallback: if popup was blocked, redirect the page
    if (!popup || popup.closed) {
      window.location.href = url;
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-surface-elevated p-6 shadow-2xl border border-border">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
            <ShoppingBag className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">Connect Shopify</h3>
            <p className="text-sm text-text-secondary">Enter your store domain to begin</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <label htmlFor="shop-domain" className="block text-sm font-medium text-text-secondary mb-1">
            Store Domain
          </label>
          <input
            id="shop-domain"
            type="text"
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="my-store.myshopify.com"
            className={cn(
              'w-full rounded-lg border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed outline-none transition-colors',
              'focus:border-primary focus:ring-2 focus:ring-primary/20',
              error ? 'border-red-300' : 'border-border'
            )}
          />
          {error && (
            <p className="mt-1 text-xs text-red-600">{error}</p>
          )}
          <p className="mt-1.5 text-xs text-text-muted">
            This is the URL you use to log in to your Shopify admin.
          </p>

          {/* Actions */}
          <div className="mt-5 flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
