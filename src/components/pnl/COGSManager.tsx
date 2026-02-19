'use client';

import { useState } from 'react';
import type { ProductCOGS } from '@/types/pnl';
import { cn, formatCurrency } from '@/lib/utils';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { SearchInput } from '@/components/ui/SearchInput';

interface COGSManagerProps {
  products: ProductCOGS[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function COGSManager({ products: initialProducts }: COGSManagerProps) {
  const [products, setProducts] = useState<ProductCOGS[]>(initialProducts);
  const [search, setSearch] = useState('');

  const filtered = products.filter(
    (p) =>
      p.productName.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const handleCostUpdate = (productId: string, newCost: string) => {
    const cost = parseFloat(newCost);
    if (isNaN(cost) || cost < 0) return;

    setProducts((prev) =>
      prev.map((p) => {
        if (p.productId !== productId) return p;
        const newMargin = round2(
          ((p.sellingPrice - cost) / p.sellingPrice) * 100
        );
        return { ...p, costPerUnit: cost, margin: newMargin };
      })
    );
  };

  return (
    <div className="rounded-lg border border-border bg-surface-elevated shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="text-sm font-semibold text-text-primary">Cost of Goods</h3>
        <div className="w-64">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search products..."
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                Product Name
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                SKU
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                Cost / Unit
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                Selling Price
              </th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-text-muted">
                Margin
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product) => (
              <tr
                key={product.productId}
                className="border-b border-border hover:bg-surface-hover transition-colors"
              >
                <td className="px-6 py-3 font-medium text-text-primary">
                  {product.productName}
                </td>
                <td className="px-6 py-3 text-text-muted">{product.sku}</td>
                <td className="px-6 py-3">
                  <InlineEdit
                    value={product.costPerUnit.toFixed(2)}
                    onSave={(val) => handleCostUpdate(product.productId, val)}
                    type="number"
                    prefix="$"
                  />
                </td>
                <td className="px-6 py-3 text-text-secondary">
                  {formatCurrency(product.sellingPrice)}
                </td>
                <td className="px-6 py-3">
                  <span
                    className={cn(
                      'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold',
                      product.margin >= 60
                        ? 'bg-emerald-50 text-emerald-700'
                        : product.margin >= 40
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-red-50 text-red-700'
                    )}
                  >
                    {product.margin.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-text-dimmed">
                  No products found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
