'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  Package,
  DollarSign,
  Percent,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { todayInTimezone } from '@/lib/timezone';
import type { ProductCost } from '@/types/pnlSettings';

interface ProductCostsTabProps {
  productCosts: ProductCost[];
  onUpdate: (data: ProductCost) => void;
  onDelete: (productId: string) => void;
  storeId: string;
}

interface ShopifyProduct {
  productId: string;
  productName: string;
  sku: string;
  sellingPrice: number;
  costPerUnit: number;
  margin: number;
}

export function ProductCostsTab({
  productCosts,
  onUpdate,
  onDelete,
  storeId,
}: ProductCostsTabProps) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState('');
  const [editType, setEditType] = useState<'fixed' | 'percentage'>('fixed');
  const [defaultCogsPct, setDefaultCogsPct] = useState(30);

  // Fetch products from Shopify
  useEffect(() => {
    async function fetchProducts() {
      setLoadingProducts(true);
      try {
        const res = await fetch(`/api/shopify/products?storeId=${encodeURIComponent(storeId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setProducts(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.data.map((p: any) => {
                const variant = p.variants?.[0];
                const sellingPrice = parseFloat(variant?.price || '0');
                return {
                  productId: String(p.id),
                  productName: p.title,
                  sku: variant?.sku || '',
                  sellingPrice,
                  costPerUnit: sellingPrice * 0.3,
                  margin: 70,
                };
              })
            );
          }
        }
      } catch {
        // Products not available
      } finally {
        setLoadingProducts(false);
      }
    }
    if (storeId) fetchProducts();
  }, [storeId]);

  // Merge products with saved costs
  const mergedProducts = products.map((p) => {
    const saved = productCosts.find((c) => c.productId === p.productId);
    if (saved) {
      const cost =
        saved.costType === 'percentage'
          ? (saved.costPerUnit / 100) * p.sellingPrice
          : saved.costPerUnit;
      const margin = p.sellingPrice > 0 ? ((p.sellingPrice - cost) / p.sellingPrice) * 100 : 0;
      return { ...p, costPerUnit: saved.costPerUnit, margin, costType: saved.costType };
    }
    return { ...p, costType: 'fixed' as const };
  });

  const filtered = mergedProducts.filter(
    (p) =>
      p.productName.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = (product: ShopifyProduct & { costType?: string }) => {
    const cost = parseFloat(editCost);
    if (isNaN(cost) || cost < 0) return;
    onUpdate({
      productId: product.productId,
      productName: product.productName,
      sku: product.sku,
      costPerUnit: cost,
      costType: editType,
      effectiveDate: todayInTimezone(),
    });
    setEditingId(null);
  };

  const handleApplyDefaultCogs = () => {
    for (const product of products) {
      const saved = productCosts.find((c) => c.productId === product.productId);
      if (!saved) {
        onUpdate({
          productId: product.productId,
          productName: product.productName,
          sku: product.sku,
          costPerUnit: defaultCogsPct,
          costType: 'percentage',
          effectiveDate: todayInTimezone(),
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Default COGS */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Default COGS</h3>
        <p className="text-xs text-gray-500 mb-4">
          Set a default cost of goods percentage for all products that don&apos;t have individual costs configured.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={defaultCogsPct}
              onChange={(e) => setDefaultCogsPct(parseFloat(e.target.value) || 0)}
              className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              min={0}
              max={100}
            />
            <span className="text-sm text-gray-500">% of revenue</span>
          </div>
          <button
            onClick={handleApplyDefaultCogs}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Apply to unconfigured products
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2.5 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
          />
        </div>
        <div className="text-xs text-gray-500">
          {productCosts.length} of {products.length} configured
        </div>
      </div>

      {/* Product list */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        {loadingProducts ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-500">Loading products from Shopify...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Package className="h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              {products.length === 0
                ? 'No products found. Connect Shopify to import products.'
                : 'No products match your search.'}
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Product
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  SKU
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Selling Price
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Cost (COGS)
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Margin
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500 w-24">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((product) => {
                const isEditing = editingId === product.productId;
                const hasSaved = productCosts.some((c) => c.productId === product.productId);

                return (
                  <tr key={product.productId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-gray-100 flex items-center justify-center shrink-0">
                          <Package className="h-4 w-4 text-gray-400" />
                        </div>
                        <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {product.productName}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 font-mono text-xs">
                      {product.sku || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                      ${product.sellingPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <select
                            value={editType}
                            onChange={(e) => setEditType(e.target.value as 'fixed' | 'percentage')}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="fixed">$</option>
                            <option value="percentage">%</option>
                          </select>
                          <input
                            type="number"
                            value={editCost}
                            onChange={(e) => setEditCost(e.target.value)}
                            className="w-20 rounded border border-blue-400 px-2 py-1 text-sm text-right ring-1 ring-blue-400"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSave(product);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => handleSave(product)}
                            className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            'text-sm font-medium',
                            hasSaved ? 'text-gray-900' : 'text-gray-400 italic'
                          )}
                        >
                          {hasSaved ? (
                            product.costType === 'percentage'
                              ? `${product.costPerUnit}%`
                              : `$${product.costPerUnit.toFixed(2)}`
                          ) : (
                            `~$${(product.sellingPrice * 0.3).toFixed(2)}`
                          )}
                          {!hasSaved && (
                            <span className="ml-1 text-[10px] text-amber-500">(est.)</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'text-sm font-medium',
                          product.margin >= 50
                            ? 'text-green-600'
                            : product.margin >= 30
                            ? 'text-amber-600'
                            : 'text-red-600'
                        )}
                      >
                        {product.margin.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(product.productId);
                            setEditCost(String(product.costPerUnit));
                            setEditType((product.costType as 'fixed' | 'percentage') || 'fixed');
                          }}
                          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                          title="Edit cost"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {hasSaved && (
                          <button
                            onClick={() => onDelete(product.productId)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Remove cost"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Help text */}
      <div className="flex items-start gap-2 text-xs text-gray-500">
        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
        <p>
          Products without configured costs use the default COGS percentage ({defaultCogsPct}%).
          Set individual product costs for more accurate profit tracking.
          Costs can be set as a fixed dollar amount or as a percentage of selling price.
        </p>
      </div>
    </div>
  );
}
