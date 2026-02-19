'use client';

import { useState } from 'react';
import { Package, Save, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HandlingFees, HandlingFeeType } from '@/types/pnlSettings';

interface HandlingFeesTabProps {
  settings: HandlingFees;
  onSave: (data: HandlingFees) => void;
}

const feeTypeOptions: { value: HandlingFeeType; label: string; description: string }[] = [
  {
    value: 'per_order',
    label: 'Per Order',
    description: 'A fixed handling fee added to each order. Covers boxing, packaging, and prep.',
  },
  {
    value: 'per_item',
    label: 'Per Item',
    description: 'A handling fee per item in the order. Total = items x fee amount.',
  },
  {
    value: 'percentage',
    label: 'Percentage of Order',
    description: 'Handling fee as a percentage of the order subtotal.',
  },
];

export function HandlingFeesTab({ settings, onSave }: HandlingFeesTabProps) {
  const [draft, setDraft] = useState<HandlingFees>(settings);
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = (updates: Partial<HandlingFees>) => {
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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
            <Package className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Handling Fee Configuration</h3>
            <p className="text-xs text-gray-500">
              Set the cost for boxing, packaging, and preparing orders for shipment
            </p>
          </div>
        </div>

        {/* Fee type selector */}
        <div className="space-y-3 mb-6">
          {feeTypeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleChange({ feeType: opt.value })}
              className={cn(
                'w-full rounded-xl border-2 p-4 text-left transition-all',
                draft.feeType === opt.value
                  ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-200'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'h-4 w-4 rounded-full border-2 flex items-center justify-center',
                    draft.feeType === opt.value
                      ? 'border-amber-500'
                      : 'border-gray-300'
                  )}
                >
                  {draft.feeType === opt.value && (
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-500 pl-6">{opt.description}</p>
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600">
            {draft.feeType === 'percentage' ? 'Fee Percentage' : 'Fee Amount'}
          </label>
          <div className="relative w-48">
            {draft.feeType !== 'percentage' && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            )}
            <input
              type="number"
              value={draft.amount}
              onChange={(e) => handleChange({ amount: parseFloat(e.target.value) || 0 })}
              className={cn(
                'w-full rounded-lg border border-gray-300 py-2.5 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none',
                draft.feeType === 'percentage' ? 'px-4 pr-8' : 'pl-7 pr-4'
              )}
              min={0}
              step={draft.feeType === 'percentage' ? 0.1 : 0.01}
            />
            {draft.feeType === 'percentage' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {draft.feeType === 'per_order' && `$${draft.amount.toFixed(2)} will be deducted per order.`}
            {draft.feeType === 'per_item' && `$${draft.amount.toFixed(2)} will be deducted per item in each order.`}
            {draft.feeType === 'percentage' && `${draft.amount}% of each order subtotal will be deducted.`}
          </p>
        </div>
      </div>

      {/* Example calculation */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h4 className="text-xs font-semibold text-gray-700 mb-3">Example Calculation</h4>
        <div className="bg-gray-50 rounded-lg p-4 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-gray-500">Sample order: 3 items, $150 subtotal</span>
          </div>
          <div className="flex justify-between font-medium text-gray-900">
            <span>Handling fee</span>
            <span>
              {draft.feeType === 'per_order' && `$${draft.amount.toFixed(2)}`}
              {draft.feeType === 'per_item' && `$${(draft.amount * 3).toFixed(2)} (3 × $${draft.amount.toFixed(2)})`}
              {draft.feeType === 'percentage' && `$${(150 * draft.amount / 100).toFixed(2)} (${draft.amount}% × $150)`}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Handling fees represent the cost of preparing orders for shipment — boxing, packaging materials,
          labels, and labor. These are separate from shipping carrier costs.
        </p>
      </div>

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
          Save Handling Fees
        </button>
      </div>
    </div>
  );
}
