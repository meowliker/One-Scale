'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, ShoppingBag } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useStoreStore } from '@/stores/storeStore';
import toast from 'react-hot-toast';

interface AddStoreModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddStoreModal({ isOpen, onClose }: AddStoreModalProps) {
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);

  const addStore = useStoreStore((s) => s.addStore);

  const handleSave = async () => {
    if (!name.trim() || !domain.trim() || !apiKey.trim() || !apiSecret.trim()) return;

    setSaving(true);
    try {
      await addStore({
        name: name.trim(),
        domain: domain.trim(),
        platform: 'shopify',
        shopifyApiKey: apiKey.trim(),
        shopifyApiSecret: apiSecret.trim(),
      });
      toast.success('Store connected successfully!');
      resetForm();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add store';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDomain('');
    setApiKey('');
    setApiSecret('');
    setShowSecret(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const isValid =
    name.trim().length > 0 &&
    domain.trim().length > 0 &&
    apiKey.trim().length > 0 &&
    apiSecret.trim().length > 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Connect Shopify Store" size="md">
      <div className="space-y-5">
        {/* Info banner */}
        <div className="flex gap-3 rounded-lg bg-primary/10 p-3">
          <ShoppingBag className="h-5 w-5 shrink-0 text-primary mt-0.5" />
          <div className="text-xs text-primary-light">
            <p className="font-medium">Connect using your Shopify Custom App credentials.</p>
            <p className="mt-1 text-primary">
              In Shopify Admin &rarr; <strong>Settings &rarr; Apps &rarr; Develop apps</strong> &rarr;
              create or open your custom app &rarr; <strong>API credentials</strong> tab &rarr;
              copy the <strong>Client ID</strong> and <strong>Client secret</strong>.
            </p>
          </div>
        </div>

        {/* Store Name */}
        <div>
          <label htmlFor="store-name" className="block text-sm font-medium text-text-secondary">
            Store Name <span className="text-red-500">*</span>
          </label>
          <input
            id="store-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., My Shopify Store"
            className="mt-1 w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Shop Domain */}
        <div>
          <label htmlFor="store-domain" className="block text-sm font-medium text-text-secondary">
            Shop Domain <span className="text-red-500">*</span>
          </label>
          <div className="mt-1 flex items-center">
            <input
              id="store-domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="my-store"
              className="w-full rounded-l-lg border border-r-0 border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="inline-flex items-center rounded-r-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-secondary">
              .myshopify.com
            </span>
          </div>
        </div>

        {/* Client ID (API Key) */}
        <div>
          <label htmlFor="store-api-key" className="block text-sm font-medium text-text-secondary">
            Client ID <span className="text-red-500">*</span>
          </label>
          <input
            id="store-api-key"
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="e.g., 1a2b3c4d5e6f7g8h9i0j"
            className="mt-1 w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Client Secret (API Secret Key) */}
        <div>
          <label htmlFor="store-api-secret" className="block text-sm font-medium text-text-secondary">
            Client Secret <span className="text-red-500">*</span>
          </label>
          <div className="relative mt-1">
            <input
              id="store-api-secret"
              type={showSecret ? 'text' : 'password'}
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="e.g., shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Found in your Custom App &rarr; API credentials. We use these to authenticate
            via Shopify&apos;s Client Credentials Grant (token auto-refreshes every 24h).
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button
            onClick={handleClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect Store'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
