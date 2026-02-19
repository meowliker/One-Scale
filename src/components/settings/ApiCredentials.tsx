'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface PlatformCredentials {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes?: string;
  configured: boolean;
  updatedAt?: string;
}

interface CredentialsState {
  meta: PlatformCredentials;
  shopify: PlatformCredentials;
}

function getDefaultRedirect(path: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`;
  }
  return `http://localhost:3000${path}`;
}

const DEFAULT_SHOPIFY_SCOPES = 'read_orders,read_products,read_customers';

export function ApiCredentials() {
  const [credentials, setCredentials] = useState<CredentialsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'meta' | 'shopify' | null>(null);

  // Form state — separate from saved state so we can track dirty fields
  const [metaForm, setMetaForm] = useState({
    appId: '',
    appSecret: '',
    redirectUri: getDefaultRedirect('/api/auth/meta/callback'),
  });
  const [shopifyForm, setShopifyForm] = useState({
    appId: '',
    appSecret: '',
    redirectUri: getDefaultRedirect('/api/auth/shopify/callback'),
    scopes: DEFAULT_SHOPIFY_SCOPES,
  });

  // Visibility toggles
  const [showMetaSecret, setShowMetaSecret] = useState(false);
  const [showShopifySecret, setShowShopifySecret] = useState(false);

  useEffect(() => {
    async function loadCredentials() {
      try {
        const response = await fetch('/api/settings/credentials');
        if (!response.ok) throw new Error('Failed to load');
        const data: CredentialsState = await response.json();
        setCredentials(data);

        // Populate forms
        setMetaForm({
          appId: data.meta.appId || '',
          appSecret: '', // Never pre-fill secret (it's masked from server)
          redirectUri: data.meta.redirectUri || getDefaultRedirect('/api/auth/meta/callback'),
        });
        setShopifyForm({
          appId: data.shopify.appId || '',
          appSecret: '',
          redirectUri: data.shopify.redirectUri || getDefaultRedirect('/api/auth/shopify/callback'),
          scopes: data.shopify.scopes || DEFAULT_SHOPIFY_SCOPES,
        });
      } catch {
        toast.error('Failed to load API credentials');
      } finally {
        setLoading(false);
      }
    }

    loadCredentials();
  }, []);

  const handleSaveMeta = async () => {
    if (!metaForm.appId || !metaForm.appSecret) {
      toast.error('App ID and App Secret are required');
      return;
    }

    setSaving('meta');
    try {
      const response = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'meta',
          appId: metaForm.appId,
          appSecret: metaForm.appSecret,
          redirectUri: metaForm.redirectUri,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
      toast.success('Meta credentials saved');

      // Refresh state
      setCredentials((prev) =>
        prev
          ? {
              ...prev,
              meta: {
                appId: metaForm.appId,
                appSecret: '••••••••',
                redirectUri: metaForm.redirectUri,
                configured: true,
                updatedAt: new Date().toISOString(),
              },
            }
          : prev
      );
      setMetaForm((prev) => ({ ...prev, appSecret: '' }));
    } catch {
      toast.error('Failed to save Meta credentials');
    } finally {
      setSaving(null);
    }
  };

  const handleSaveShopify = async () => {
    if (!shopifyForm.appId || !shopifyForm.appSecret) {
      toast.error('API Key and API Secret are required');
      return;
    }

    setSaving('shopify');
    try {
      const response = await fetch('/api/settings/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: 'shopify',
          appId: shopifyForm.appId,
          appSecret: shopifyForm.appSecret,
          redirectUri: shopifyForm.redirectUri,
          scopes: shopifyForm.scopes,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
      toast.success('Shopify credentials saved');

      setCredentials((prev) =>
        prev
          ? {
              ...prev,
              shopify: {
                appId: shopifyForm.appId,
                appSecret: '••••••••',
                redirectUri: shopifyForm.redirectUri,
                scopes: shopifyForm.scopes,
                configured: true,
                updatedAt: new Date().toISOString(),
              },
            }
          : prev
      );
      setShopifyForm((prev) => ({ ...prev, appSecret: '' }));
    } catch {
      toast.error('Failed to save Shopify credentials');
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = async (platform: 'meta' | 'shopify') => {
    try {
      const response = await fetch('/api/settings/credentials', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });

      if (!response.ok) throw new Error('Failed to delete');
      toast.success(`${platform === 'meta' ? 'Meta' : 'Shopify'} credentials removed`);

      setCredentials((prev) =>
        prev
          ? {
              ...prev,
              [platform]: {
                appId: '',
                appSecret: '',
                redirectUri: platform === 'meta' ? getDefaultRedirect('/api/auth/meta/callback') : getDefaultRedirect('/api/auth/shopify/callback'),
                configured: false,
              },
            }
          : prev
      );

      if (platform === 'meta') {
        setMetaForm({ appId: '', appSecret: '', redirectUri: getDefaultRedirect('/api/auth/meta/callback') });
      } else {
        setShopifyForm({
          appId: '',
          appSecret: '',
          redirectUri: getDefaultRedirect('/api/auth/shopify/callback'),
          scopes: DEFAULT_SHOPIFY_SCOPES,
        });
      }
    } catch {
      toast.error('Failed to remove credentials');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Meta Credentials */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Meta (Facebook) App</h3>
              <p className="text-xs text-gray-500">developers.facebook.com</p>
            </div>
          </div>
          <StatusBadge configured={credentials?.meta.configured ?? false} />
        </div>

        <div className="space-y-4 p-5">
          <FormField
            label="App ID"
            value={metaForm.appId}
            onChange={(v) => setMetaForm((p) => ({ ...p, appId: v }))}
            placeholder="Enter your Meta App ID"
          />
          <FormField
            label="App Secret"
            value={metaForm.appSecret}
            onChange={(v) => setMetaForm((p) => ({ ...p, appSecret: v }))}
            placeholder={credentials?.meta.configured ? 'Enter new secret to update' : 'Enter your Meta App Secret'}
            type={showMetaSecret ? 'text' : 'password'}
            trailing={
              <button
                type="button"
                onClick={() => setShowMetaSecret(!showMetaSecret)}
                className="text-gray-400 hover:text-gray-600"
              >
                {showMetaSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <FormField
            label="Redirect URI"
            value={metaForm.redirectUri}
            onChange={(v) => setMetaForm((p) => ({ ...p, redirectUri: v }))}
            placeholder="Auto-detected from current URL"
            hint="Auto-filled from your current domain — this must also be set in your Meta app settings"
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveMeta}
              disabled={saving === 'meta'}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white',
                saving === 'meta' ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              )}
            >
              {saving === 'meta' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Meta Credentials
            </button>
            {credentials?.meta.configured && (
              <button
                onClick={() => handleDelete('meta')}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Shopify Credentials */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
              <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.058-.121-.074l-.914 21.104zm-1.635-17.504a4.46 4.46 0 00-.961-.052c-.346.013-.722.065-1.108.154-.079-.24-.171-.471-.276-.687.858-.426 1.555-1.095 1.838-1.97.005-.013.005-.027.01-.04-.253.038-.539.069-.839.069a5.09 5.09 0 01-1.271-.166c.66-1.439 1.859-2.249 3.284-2.385.138-.015.274-.018.408-.018-.003-.001.003-.13-.003-.268-.019-.449-.048-.9-.177-1.325C15.174.416 14.71.001 14.285 0c-.008 0-.013 0-.02.001-.194.006-.382.057-.57.149-.944.467-1.67 1.84-2.084 3.25a12.6 12.6 0 00-1.885.618l-.082-.25c-.496-1.515-1.389-2.6-2.471-2.6-.035 0-.072.001-.107.005C5.793 1.311 5.053 2.947 4.71 5.052c-.85.263-1.449.448-1.466.455-.457.143-.471.157-.531.586C2.67 6.41.5 22.296.5 22.296l11.826 2.217 1.376-18.038z"/>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Shopify App</h3>
              <p className="text-xs text-gray-500">partners.shopify.com</p>
            </div>
          </div>
          <StatusBadge configured={credentials?.shopify.configured ?? false} />
        </div>

        <div className="space-y-4 p-5">
          <FormField
            label="API Key"
            value={shopifyForm.appId}
            onChange={(v) => setShopifyForm((p) => ({ ...p, appId: v }))}
            placeholder="Enter your Shopify API Key"
          />
          <FormField
            label="API Secret"
            value={shopifyForm.appSecret}
            onChange={(v) => setShopifyForm((p) => ({ ...p, appSecret: v }))}
            placeholder={credentials?.shopify.configured ? 'Enter new secret to update' : 'Enter your Shopify API Secret'}
            type={showShopifySecret ? 'text' : 'password'}
            trailing={
              <button
                type="button"
                onClick={() => setShowShopifySecret(!showShopifySecret)}
                className="text-gray-400 hover:text-gray-600"
              >
                {showShopifySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <FormField
            label="Redirect URI"
            value={shopifyForm.redirectUri}
            onChange={(v) => setShopifyForm((p) => ({ ...p, redirectUri: v }))}
            placeholder="Auto-detected from current URL"
            hint="Auto-filled from your current domain — this must also be set in your Shopify app settings"
          />
          <FormField
            label="Scopes"
            value={shopifyForm.scopes}
            onChange={(v) => setShopifyForm((p) => ({ ...p, scopes: v }))}
            placeholder="read_orders,read_products,read_customers"
            hint="Comma-separated Shopify access scopes"
          />

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSaveShopify}
              disabled={saving === 'shopify'}
              className={cn(
                'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white',
                saving === 'shopify' ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              )}
            >
              {saving === 'shopify' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Shopify Credentials
            </button>
            {credentials?.shopify.configured && (
              <button
                onClick={() => handleDelete('shopify')}
                className="flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Helper Components ----

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        configured ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
      )}
    >
      {configured ? (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          Configured
        </>
      ) : (
        <>
          <XCircle className="h-3.5 w-3.5" />
          Not configured
        </>
      )}
    </span>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  trailing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3">
            {trailing}
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
