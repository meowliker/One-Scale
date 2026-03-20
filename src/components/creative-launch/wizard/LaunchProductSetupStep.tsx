'use client';

import { useState, useEffect } from 'react';
import { Check, AlertCircle, ChevronDown, Link2, Building2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProductMapping } from '@/types/creativeLaunch';

interface LaunchProductSetupStepProps {
  storeId: string;
  mappings: ProductMapping[];
  onMappingsChange: (mappings: ProductMapping[]) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function LaunchProductSetupStep({
  storeId,
  mappings,
  onMappingsChange,
  isLoading = false,
  error = null,
}: LaunchProductSetupStepProps) {
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);
  const [savingProductId, setSavingProductId] = useState<string | null>(null);

  // Auto-expand first product
  useEffect(() => {
    if (mappings.length > 0 && !expandedProductId) {
      setExpandedProductId(mappings[0].productId);
    }
  }, [mappings, expandedProductId]);

  const updateMapping = (productId: string, updates: Partial<ProductMapping>) => {
    const newMappings = mappings.map(m => 
      m.productId === productId ? { ...m, ...updates } : m
    );
    onMappingsChange(newMappings);
  };

  const normalizeAccount = (value: string) => value.replace(/^act_/, '');

  const getAccountScopedPages = (mapping: ProductMapping, adAccountId: string) =>
    mapping.availablePages.filter((page) => {
      if (!page.adAccountIds || page.adAccountIds.length === 0) return true;
      return page.adAccountIds.some((id) => normalizeAccount(id) === normalizeAccount(adAccountId));
    });

  const getAccountScopedInstagram = (mapping: ProductMapping, adAccountId: string) =>
    mapping.availableInstagramAccounts.filter((account) => {
      if (!account.adAccountIds || account.adAccountIds.length === 0) return true;
      return account.adAccountIds.some((id) => normalizeAccount(id) === normalizeAccount(adAccountId));
    });

  const getAccountScopedPixels = (mapping: ProductMapping, adAccountId: string) =>
    mapping.availablePixels.filter((pixel) => normalizeAccount(pixel.adAccountId) === normalizeAccount(adAccountId));

  const handlePageChange = (productId: string, pageId: string) => {
    const mapping = mappings.find(m => m.productId === productId);
    if (!mapping) return;

    const pages = getAccountScopedPages(mapping, mapping.adAccountId);
    const selectedPage = pages.find(p => p.id === pageId) || mapping.availablePages.find((p) => p.id === pageId);
    updateMapping(productId, {
      pageId,
      pageName: selectedPage?.name || '',
      instagramId: selectedPage?.instagramId || '',
      instagramUsername: selectedPage?.instagramUsername || '',
    });
  };

  const handleAdAccountChange = (productId: string, adAccountId: string) => {
    const mapping = mappings.find(m => m.productId === productId);
    if (!mapping) return;

    const selectedAccount = mapping.availableAdAccounts.find(a => a.id === adAccountId);

    const accountPages = getAccountScopedPages(mapping, adAccountId);
    const accountPixels = getAccountScopedPixels(mapping, adAccountId);
    const accountInstagram = getAccountScopedInstagram(mapping, adAccountId);
    const selectedPage = accountPages[0];
    const selectedPixel = accountPixels[0];
    const selectedInstagram = accountInstagram.find((row) => row.id === selectedPage?.instagramId) || accountInstagram[0];

    updateMapping(productId, {
      adAccountId,
      adAccountName: selectedAccount?.name || '',
      businessManagerId: adAccountId ? `bm:${adAccountId}` : '',
      businessManagerName: selectedAccount?.name || '',
      pageId: selectedPage?.id || '',
      pageName: selectedPage?.name || '',
      pixelId: selectedPixel?.id || '',
      pixelName: selectedPixel?.name || '',
      instagramId: selectedInstagram?.id || '',
      instagramUsername: selectedInstagram?.username || selectedInstagram?.name || '',
    });
  };

  const handlePixelChange = (productId: string, pixelId: string) => {
    const mapping = mappings.find(m => m.productId === productId);
    if (!mapping) return;

    const accountPixels = getAccountScopedPixels(mapping, mapping.adAccountId);
    const selectedPixel = accountPixels.find(p => p.id === pixelId) || mapping.availablePixels.find((p) => p.id === pixelId);
    updateMapping(productId, {
      pixelId,
      pixelName: selectedPixel?.name || '',
    });
  };

  const handleInstagramChange = (productId: string, instagramId: string) => {
    const mapping = mappings.find(m => m.productId === productId);
    if (!mapping) return;

    const accountInstagram = getAccountScopedInstagram(mapping, mapping.adAccountId);
    const selected = accountInstagram.find((row) => row.id === instagramId) || mapping.availableInstagramAccounts.find((row) => row.id === instagramId);
    updateMapping(productId, {
      instagramId,
      instagramUsername: selected?.username || selected?.name || '',
    });
  };

  const handleProductLinksChange = (productId: string, raw: string) => {
    const links = raw
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean);
    const mapping = mappings.find((m) => m.productId === productId);
    if (!mapping) return;

    updateMapping(productId, {
      productLinks: links,
      destinationUrl: mapping.destinationUrl || links[0] || '',
    });
  };

  const saveMapping = async (productId: string) => {
    const mapping = mappings.find(m => m.productId === productId);
    if (!mapping) return;

    setSavingProductId(productId);
    try {
      await fetch('/api/creative-launch/product-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          productId,
          action: 'save',
          mapping: {
            productName: mapping.productName,
            adAccountId: mapping.adAccountId,
            adAccountName: mapping.adAccountName,
            pageId: mapping.pageId,
            pageName: mapping.pageName,
            instagramId: mapping.instagramId,
            pixelId: mapping.pixelId,
            pixelName: mapping.pixelName,
            destinationUrl: mapping.destinationUrl,
            productLinks: mapping.productLinks,
            utmTemplate: mapping.utmTemplate,
          },
        }),
      });
    } catch (err) {
      console.error('Failed to save mapping:', err);
    } finally {
      setSavingProductId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500 mb-4" />
        <p className="text-sm text-slate-600">Loading product mappings...</p>
        <p className="text-xs text-slate-400 mt-1">Matching products to Meta campaigns</p>
      </div>
    );
  }

  if (mappings.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-slate-900">No Products Found</h3>
        <p className="text-sm text-slate-600 mt-2">
          Please go back and select creatives to configure product mappings.
        </p>
        {error && (
          <p className="text-xs text-red-600 mt-3">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Product Setup</h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure Meta account settings for each product. Auto-matched products are pre-filled based on existing campaigns.
        </p>
      </div>

      {/* Product Cards */}
      <div className="space-y-4">
        {mappings.map((mapping) => {
          const isExpanded = expandedProductId === mapping.productId;
          const accountPages = getAccountScopedPages(mapping, mapping.adAccountId);
          const accountInstagram = getAccountScopedInstagram(mapping, mapping.adAccountId);
          const accountPixels = getAccountScopedPixels(mapping, mapping.adAccountId);

          return (
            <div
              key={mapping.productId}
              className={cn(
                'rounded-xl border transition-all duration-200',
                isExpanded ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white'
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedProductId(isExpanded ? null : mapping.productId)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                {/* Product Image */}
                <div className="h-14 w-14 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0">
                  {mapping.productImage ? (
                    <img
                      src={mapping.productImage}
                      alt={mapping.productName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-slate-400" />
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-slate-900 truncate">{mapping.productName}</h3>
                    {mapping.isAutoMatched ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <Check className="h-3 w-3" />
                        Auto-matched ({mapping.matchScore}%)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                        <AlertCircle className="h-3 w-3" />
                        Manual setup needed
                      </span>
                    )}
                    {mapping.needsUrlReview && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        <AlertCircle className="h-3 w-3" />
                        Verify URL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">
                    {mapping.adAccountName || 'No ad account selected'} • {mapping.pageName || 'No page selected'}
                  </p>
                </div>

                {/* Expand Icon */}
                <ChevronDown
                  className={cn(
                    'h-5 w-5 text-slate-400 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-4 border-t border-slate-200/50 pt-4">
                  {/* Match Info */}
                  {mapping.isAutoMatched && mapping.matchedCampaignName && (
                    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                      <p className="text-xs text-emerald-700">
                        <span className="font-medium">Matched from campaign:</span> {mapping.matchedCampaignName}
                      </p>
                    </div>
                  )}
                  {mapping.needsUrlReview && (
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                      <p className="text-xs text-orange-700">
                        URL handle came from title-based Shopify lookup. Please verify before launch.
                      </p>
                    </div>
                  )}
                  {mapping.missingCachedAssets && (
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                      <p className="text-xs text-amber-700">
                        Some cached Meta setup options are missing. Manual overrides are available.
                      </p>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">Meta Publish Settings</p>
                      <span className="text-xs text-slate-500">Derived from product links + cache</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 text-sm text-slate-600">
                      <Link2 className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{mapping.shopifyUrl}</span>
                    </div>
                  </div>

                  {/* Two Column Layout */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Business Manager */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Business Manager</label>
                      <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
                        {mapping.businessManagerName || 'Derived from ad account'}
                      </div>
                    </div>

                    {/* Ad Account */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Ad Account</label>
                      <select
                        value={mapping.adAccountId}
                        onChange={(e) => handleAdAccountChange(mapping.productId, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select ad account...</option>
                        {mapping.availableAdAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Facebook Page */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Facebook Page</label>
                      <select
                        value={mapping.pageId}
                        onChange={(e) => handlePageChange(mapping.productId, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select page...</option>
                        {accountPages.map((page) => (
                          <option key={page.id} value={page.id}>
                            {page.name}
                          </option>
                        ))}
                      </select>
                      {accountPages.length === 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">No cached pages for this ad account yet.</p>
                      )}
                    </div>

                    {/* Pixel */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Pixel</label>
                      <select
                        value={mapping.pixelId}
                        onChange={(e) => handlePixelChange(mapping.productId, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select pixel...</option>
                        {accountPixels.map((pixel) => (
                          <option key={pixel.id} value={pixel.id}>
                            {pixel.name}
                          </option>
                        ))}
                      </select>
                      {accountPixels.length === 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">No cached pixels for this ad account yet.</p>
                      )}
                    </div>

                    {/* Instagram Account */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Instagram Account</label>
                      <select
                        value={mapping.instagramId}
                        onChange={(e) => handleInstagramChange(mapping.productId, e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="">Select instagram account...</option>
                        {accountInstagram.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.username || account.name}
                          </option>
                        ))}
                      </select>
                      {accountInstagram.length === 0 && (
                        <p className="mt-1 text-[11px] text-slate-400">No cached Instagram accounts for this ad account yet.</p>
                      )}
                    </div>
                  </div>

                  {/* Destination URL */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Product Links (one per line)</label>
                    <textarea
                      value={(mapping.productLinks || []).join('\n')}
                      onChange={(e) => handleProductLinksChange(mapping.productId, e.target.value)}
                      placeholder={'https://yourstore.com/products/example\nhttps://yourstore.com/products/example?variant=...'}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Add or edit product URLs manually. These links are used for future auto-mapping.
                    </p>
                  </div>

                  {/* Destination URL */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Landing Page URL</label>
                    <input
                      type="text"
                      value={mapping.destinationUrl}
                      onChange={(e) => updateMapping(mapping.productId, { destinationUrl: e.target.value })}
                      placeholder="https://yourstore.com/products/..."
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* UTM Template */}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">UTM Template</label>
                    <input
                      type="text"
                      value={mapping.utmTemplate}
                      onChange={(e) => updateMapping(mapping.productId, { utmTemplate: e.target.value })}
                      placeholder="utm_source=FbAds&utm_medium={{adset.name}}"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Available variables: {'{{campaign.name}}'}, {'{{adset.name}}'}, {'{{ad.name}}'}
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => saveMapping(mapping.productId)}
                      disabled={savingProductId === mapping.productId}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {savingProductId === mapping.productId ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Save for Future
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3">
          <Building2 className="h-5 w-5 text-slate-400" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              {mappings.filter(m => m.isAutoMatched).length} of {mappings.length} products auto-matched
            </p>
            <p className="text-xs text-slate-500">
              Settings will be used for campaign creation in the next steps
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
