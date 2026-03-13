'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStoreStore } from '@/stores/storeStore';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';

interface PixelStatus {
  enabled: boolean;
  script_tag_id: string | null;
  shopify_domain: string | null;
  installed_at: string | null;
}

export default function PixelSetup() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const [mainSnippet, setMainSnippet] = useState('');
  const [checkoutSnippet, setCheckoutSnippet] = useState('');
  const [copied, setCopied] = useState<'main' | 'checkout' | null>(null);
  const [loading, setLoading] = useState(true);
  const [pixelStatus, setPixelStatus] = useState<PixelStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const fetchStatus = useCallback(async (storeId: string) => {
    try {
      const res = await fetch(
        `/api/pixel/status?storeId=${encodeURIComponent(storeId)}`
      );
      if (res.ok) {
        const data = (await res.json()) as PixelStatus;
        setPixelStatus(data);
      } else {
        setPixelStatus(null);
      }
    } catch {
      setPixelStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!activeStoreId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/pixel/snippet?storeId=${activeStoreId}&type=main`).then(r => r.json()),
      fetch(`/api/pixel/snippet?storeId=${activeStoreId}&type=checkout`).then(r => r.json()),
      fetchStatus(activeStoreId),
    ]).then(([main, checkout]) => {
      setMainSnippet((main as { snippet: string }).snippet ?? '');
      setCheckoutSnippet((checkout as { snippet: string }).snippet ?? '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [activeStoreId, fetchStatus]);

  function copy(type: 'main' | 'checkout') {
    const text = type === 'main' ? mainSnippet : checkoutSnippet;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  async function handleInstall() {
    if (!activeStoreId || installing) return;
    setInstalling(true);
    try {
      const res = await fetch('/api/shopify/install-pixel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: activeStoreId }),
      });
      if (res.ok) {
        await fetchStatus(activeStoreId);
      }
    } catch { /* handled by status refresh */ }
    setInstalling(false);
  }

  async function handleUninstall() {
    if (!activeStoreId || uninstalling) return;
    setUninstalling(true);
    try {
      await fetch(
        `/api/shopify/install-pixel?storeId=${encodeURIComponent(activeStoreId)}`,
        { method: 'DELETE' }
      );
      await fetchStatus(activeStoreId);
    } catch { /* handled by status refresh */ }
    setUninstalling(false);
  }

  if (loading) return (
    <div className="p-6 text-sm text-gray-400">Loading pixel settings...</div>
  );

  const isInstalled = pixelStatus?.enabled === true;

  const steps = [
    {
      num: 1,
      title: 'Install on all store pages',
      desc: 'Shopify Admin \u2192 Online Store \u2192 Themes \u2192 Edit Code \u2192 Snippets \u2192 New snippet named "onescale-pixel" \u2192 paste \u2192 Save. Then in theme.liquid before </body>: {% render \'onescale-pixel\' %}',
      snippet: mainSnippet,
      type: 'main' as const,
    },
    {
      num: 2,
      title: 'Install on checkout thank-you page',
      desc: 'Shopify Admin \u2192 Settings \u2192 Checkout \u2192 Order status page \u2192 Additional scripts \u2192 paste \u2192 Save. This fires the purchase event with the real order ID.',
      snippet: checkoutSnippet,
      type: 'checkout' as const,
    },
  ];

  return (
    <div className="space-y-8 p-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1">Attribution Pixel</h2>
        <p className="text-sm text-gray-400">
          First-party pixel for accurate attribution. Install takes ~5 minutes.
          Data appears in P&amp;L within 24 hours.
        </p>
      </div>

      {/* ── Status indicator ────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between rounded-xl border p-4 ${
        isInstalled
          ? 'border-green-200 bg-green-50'
          : 'border-gray-200 bg-gray-50'
      }`}>
        <div className="flex items-center gap-3">
          {isInstalled ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-gray-400" />
          )}
          <div>
            <p className={`text-sm font-medium ${isInstalled ? 'text-green-800' : 'text-gray-700'}`}>
              {isInstalled ? 'Pixel installed' : 'Pixel not installed'}
            </p>
            {isInstalled && pixelStatus?.shopify_domain && (
              <p className="text-xs text-green-600">
                Active on {pixelStatus.shopify_domain}
                {pixelStatus.installed_at && (
                  <> &middot; Since {new Date(pixelStatus.installed_at).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
        </div>

        {isInstalled ? (
          <button
            onClick={handleUninstall}
            disabled={uninstalling}
            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50
                       hover:bg-red-100 border border-red-200 rounded-lg
                       transition-colors disabled:opacity-50"
          >
            {uninstalling ? 'Removing...' : 'Remove Pixel'}
          </button>
        ) : (
          <button
            onClick={handleInstall}
            disabled={installing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                       text-white bg-blue-600 hover:bg-blue-500 rounded-lg
                       transition-colors disabled:opacity-50"
          >
            {installing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {installing ? 'Installing...' : 'Auto-Install via Script Tag'}
          </button>
        )}
      </div>

      {/* ── Manual installation steps ───────────────────────────────────── */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">
          Manual Installation
        </h3>
        <p className="text-xs text-gray-400">
          If auto-install doesn&apos;t work, paste these snippets into your Shopify theme.
        </p>
      </div>

      {steps.map(step => (
        <div key={step.num} className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs
                             flex items-center justify-center font-bold shrink-0">
              {step.num}
            </span>
            <h3 className="font-medium text-sm">{step.title}</h3>
          </div>
          <p className="text-xs text-gray-400 ml-9">{step.desc}</p>
          <div className="relative ml-9">
            <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3
                            text-xs text-gray-400 overflow-x-auto max-h-32
                            scrollbar-thin scrollbar-thumb-gray-700">
              {step.snippet.slice(0, 400)}{step.snippet.length > 400 ? '\n...' : ''}
            </pre>
            <button
              onClick={() => copy(step.type)}
              className="absolute top-2 right-2 px-3 py-1 bg-blue-600
                         hover:bg-blue-500 text-white text-xs rounded
                         transition-colors font-medium"
            >
              {copied === step.type ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ))}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs
                           flex items-center justify-center font-bold shrink-0">
            3
          </span>
          <h3 className="font-medium text-sm">Add UTM parameters to your ad URLs</h3>
        </div>
        <p className="text-xs text-gray-400 ml-9">
          Add these to your Meta/Google destination URLs.
          The pixel reads them automatically on every click.
        </p>
        <pre className="bg-gray-900 border border-gray-800 rounded-lg p-3
                        text-xs text-green-400 ml-9">
{`utm_source=facebook&utm_medium=cpc
&utm_campaign={{campaign.name}}
&utm_content={{ad.name}}
&utm_term={{adset.name}}`}
        </pre>
      </div>

      <div className="ml-9 p-3 bg-yellow-900/20 border border-yellow-800/40
                      rounded-lg text-xs text-yellow-400">
        <strong>Attribution window:</strong> The pixel tracks clicks for 30 days.
        An order will be attributed to an ad even if the customer clicked 3 weeks ago
        and buys today. 5-7 day learning period before attribution stabilises.
      </div>
    </div>
  );
}
