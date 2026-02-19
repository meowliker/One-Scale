'use client';

import { useState } from 'react';
import { Truck, Save, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ShippingSettings, ShippingMethod } from '@/types/pnlSettings';

interface ShippingSettingsTabProps {
  settings: ShippingSettings;
  onSave: (data: ShippingSettings) => void;
}

const methodOptions: { value: ShippingMethod; label: string; description: string }[] = [
  {
    value: 'flat_rate',
    label: 'Flat Rate',
    description: 'A fixed shipping cost applied to every order regardless of size or destination.',
  },
  {
    value: 'percentage',
    label: 'Percentage of Revenue',
    description: 'Shipping cost is calculated as a percentage of order revenue (e.g., 5% of each order).',
  },
  {
    value: 'equal_charged',
    label: 'Equal to Shipping Charged',
    description: 'Use the exact shipping amount charged to the customer. Assumes your actual cost equals what you charge.',
  },
  {
    value: 'per_item',
    label: 'Per Item',
    description: 'A fixed cost per item in the order. Total shipping = items × per-item rate.',
  },
];

export function ShippingSettingsTab({ settings, onSave }: ShippingSettingsTabProps) {
  const [draft, setDraft] = useState<ShippingSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (updates: Partial<ShippingSettings>) => {
    setDraft((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(draft);
    setHasChanges(false);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Truck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Shipping Cost Method</h3>
            <p className="text-xs text-gray-500">Choose how shipping costs are calculated for P&L</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {methodOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleChange({ method: opt.value })}
              className={cn(
                'rounded-xl border-2 p-4 text-left transition-all',
                draft.method === opt.value
                  ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2 flex items-center justify-center',
                    draft.method === opt.value
                      ? 'border-blue-500'
                      : 'border-gray-300'
                  )}
                >
                  {draft.method === opt.value && (
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500 pl-6">{opt.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration based on method */}
      {draft.method !== 'equal_charged' && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Configuration</h3>

          {draft.method === 'flat_rate' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Flat Rate Per Order</label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={draft.flatRate}
                  onChange={(e) => handleChange({ flatRate: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-4 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  min={0}
                  step={0.01}
                />
              </div>
              <p className="text-xs text-gray-500">This amount will be deducted from revenue for every order.</p>
            </div>
          )}

          {draft.method === 'percentage' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Percentage of Order Revenue</label>
              <div className="relative w-48">
                <input
                  type="number"
                  value={draft.percentage}
                  onChange={(e) => handleChange({ percentage: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 px-4 pr-8 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  min={0}
                  max={100}
                  step={0.1}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
              </div>
              <p className="text-xs text-gray-500">Shipping cost = {draft.percentage}% × order revenue.</p>
            </div>
          )}

          {draft.method === 'per_item' && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Cost Per Item</label>
              <div className="relative w-48">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  value={draft.perItemRate}
                  onChange={(e) => handleChange({ perItemRate: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-lg border border-gray-300 pl-7 pr-4 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  min={0}
                  step={0.01}
                />
              </div>
              <p className="text-xs text-gray-500">Total shipping = number of items × ${draft.perItemRate.toFixed(2)}.</p>
            </div>
          )}
        </div>
      )}

      {draft.method === 'equal_charged' && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Shipping costs will be pulled directly from what was charged to the customer on each order.
            No additional configuration needed. This assumes your actual shipping cost equals what you charge customers.
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={!hasChanges}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors',
            hasChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          )}
        >
          <Save className="h-4 w-4" />
          Save Shipping Settings
        </button>
      </div>
    </div>
  );
}
