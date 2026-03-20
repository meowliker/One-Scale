'use client';

import { Loader2, Link2, Save, Sparkles } from 'lucide-react';

interface SidebarProduct {
  id: string;
  name: string;
}

interface LaunchProductLinksSidebarProps {
  products: SidebarProduct[];
  linksByProduct: Record<string, string[]>;
  isLoading?: boolean;
  savingProductId?: string | null;
  suggestingProductId?: string | null;
  onLinksChange: (productId: string, links: string[]) => void;
  onSaveProduct: (productId: string, productName: string) => Promise<void> | void;
  onSuggestLinks: (productId: string, productName: string) => Promise<void> | void;
}

export function LaunchProductLinksSidebar({
  products,
  linksByProduct,
  isLoading = false,
  savingProductId = null,
  suggestingProductId = null,
  onLinksChange,
  onSaveProduct,
  onSuggestLinks,
}: LaunchProductLinksSidebarProps) {
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Product Link Setup</h3>
        <p className="mt-2 text-xs text-slate-500">
          Select creatives first. Then set product page links here before moving to Product Setup.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Product Link Setup</h3>
          <p className="mt-1 text-xs text-slate-500">
            Add links now. Product Setup will use them to derive Meta assets.
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-500" />}
      </div>

      <div className="space-y-3">
        {products.map((product) => {
          const value = (linksByProduct[product.id] || []).join('\n');
          const isSaving = savingProductId === product.id;
          const isSuggesting = suggestingProductId === product.id;
          return (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700">{product.name}</p>
              <div className="relative">
                <Link2 className="absolute left-2 top-2 h-3.5 w-3.5 text-slate-400" />
                <textarea
                  rows={3}
                  value={value}
                  onChange={(e) => {
                    const links = e.target.value.split('\n').map((row) => row.trim()).filter(Boolean);
                    onLinksChange(product.id, links);
                  }}
                  placeholder="https://yourstore.com/products/..."
                  className="w-full rounded-lg border border-slate-200 py-2 pl-7 pr-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onSuggestLinks(product.id, product.name)}
                  disabled={isSuggesting}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isSuggesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  Auto-fill
                </button>
                <button
                  onClick={() => onSaveProduct(product.id, product.name)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
