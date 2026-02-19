'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PaymentFee } from '@/types/pnlSettings';
import { commonPaymentGateways } from '@/types/pnlSettings';

interface DetectedGateway {
  name: string;
  rawName: string;
  orderCount: number;
  percentage: number;
}

interface PaymentFeesTabProps {
  fees: PaymentFee[];
  onAdd: (data: PaymentFee) => void;
  onUpdate: (data: PaymentFee) => void;
  onDelete: (gateway: string) => void;
  storeId?: string;
}

export function PaymentFeesTab({
  fees,
  onAdd,
  onUpdate,
  onDelete,
  storeId,
}: PaymentFeesTabProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGateway, setNewGateway] = useState('');
  const [newPct, setNewPct] = useState('2.9');
  const [newFixed, setNewFixed] = useState('0.30');
  const [detectedGateways, setDetectedGateways] = useState<DetectedGateway[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  const configuredGateways = new Set(fees.map((f) => f.gatewayName));
  const unconfiguredPresets = commonPaymentGateways.filter(
    (g) => !configuredGateways.has(g.name)
  );

  // Auto-detect payment gateways from Shopify orders
  const detectGateways = useCallback(async () => {
    if (!storeId) return;
    setDetecting(true);
    setDetectError(null);
    try {
      const res = await fetch(`/api/shopify/payment-gateways?storeId=${encodeURIComponent(storeId)}`);
      if (res.ok) {
        const data = await res.json();
        setDetectedGateways(data.data || []);
      } else {
        const err = await res.json();
        setDetectError(err.error || 'Failed to detect gateways');
      }
    } catch {
      setDetectError('Failed to connect to Shopify');
    } finally {
      setDetecting(false);
    }
  }, [storeId]);

  // Detect on mount
  useEffect(() => {
    if (storeId) {
      detectGateways();
    }
  }, [storeId, detectGateways]);

  const handleAddPreset = (preset: { name: string; defaultPct: number; defaultFixed: number }) => {
    onAdd({
      gatewayName: preset.name,
      feePercentage: preset.defaultPct,
      feeFixed: preset.defaultFixed,
      isActive: true,
    });
  };

  const handleAddDetected = (gateway: DetectedGateway) => {
    // Try to find matching preset for default fees
    const preset = commonPaymentGateways.find(
      (p) => p.name.toLowerCase() === gateway.name.toLowerCase()
    );
    onAdd({
      gatewayName: gateway.name,
      feePercentage: preset?.defaultPct || 2.9,
      feeFixed: preset?.defaultFixed || 0.30,
      isActive: true,
    });
  };

  const handleAddCustom = () => {
    if (!newGateway.trim()) return;
    onAdd({
      gatewayName: newGateway.trim(),
      feePercentage: parseFloat(newPct) || 0,
      feeFixed: parseFloat(newFixed) || 0,
      isActive: true,
    });
    setNewGateway('');
    setNewPct('2.9');
    setNewFixed('0.30');
    setShowAddForm(false);
  };

  // Detected gateways that aren't already configured
  const unconfiguredDetected = detectedGateways.filter(
    (g) => !configuredGateways.has(g.name)
  );

  return (
    <div className="space-y-6">
      {/* Auto-detected from Shopify */}
      {storeId && unconfiguredDetected.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                <Zap className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">Detected from Shopify Orders</h3>
                <p className="text-xs text-amber-700">
                  These payment gateways were found in your recent orders. Click to add them.
                </p>
              </div>
            </div>
            <button
              onClick={detectGateways}
              disabled={detecting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', detecting && 'animate-spin')} />
              Refresh
            </button>
          </div>
          <div className="border-t border-amber-200 px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {unconfiguredDetected.map((gateway) => (
                <button
                  key={gateway.name}
                  onClick={() => handleAddDetected(gateway)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-800 hover:border-amber-400 hover:bg-amber-100 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  {gateway.name}
                  <span className="text-amber-500">({gateway.percentage}% of orders)</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Detect error */}
      {detectError && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
          Could not auto-detect gateways: {detectError}. You can still add them manually below.
        </div>
      )}

      {/* Configured gateways */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-100 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <CreditCard className="h-4.5 w-4.5 text-purple-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Payment Gateway Fees</h3>
              <p className="text-xs text-gray-500">
                Configure processing fees for each payment method
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Custom
          </button>
        </div>

        {fees.length === 0 && !showAddForm ? (
          <div className="px-5 py-12 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No payment gateways configured yet.</p>
            <p className="mt-1 text-xs text-gray-400">
              {unconfiguredDetected.length > 0
                ? 'Add detected gateways above or use the quick-add presets below.'
                : 'Add gateways below or use the quick-add presets.'
              }
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {fees.map((fee) => (
              <div key={fee.gatewayName} className="flex items-center gap-4 px-5 py-3.5">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    fee.isActive ? 'bg-green-50' : 'bg-gray-100'
                  )}
                >
                  {fee.isActive ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{fee.gatewayName}</p>
                  <p className="text-xs text-gray-500">
                    {fee.feePercentage}% + ${fee.feeFixed.toFixed(2)} per transaction
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      onUpdate({ ...fee, isActive: !fee.isActive })
                    }
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-medium transition-colors',
                      fee.isActive
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    )}
                  >
                    {fee.isActive ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => onDelete(fee.gatewayName)}
                    className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Add custom form */}
            {showAddForm && (
              <div className="px-5 py-4 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700 mb-3">Add Custom Gateway</p>
                <div className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Name</label>
                    <input
                      type="text"
                      value={newGateway}
                      onChange={(e) => setNewGateway(e.target.value)}
                      placeholder="e.g. Square"
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Fee %</label>
                    <input
                      type="number"
                      value={newPct}
                      onChange={(e) => setNewPct(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      step={0.01}
                    />
                  </div>
                  <div className="w-24">
                    <label className="text-[10px] font-medium text-gray-500 uppercase">Fixed $</label>
                    <input
                      type="number"
                      value={newFixed}
                      onChange={(e) => setNewFixed(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      step={0.01}
                    />
                  </div>
                  <button
                    onClick={handleAddCustom}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick-add presets */}
      {unconfiguredPresets.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Quick Add</h3>
          <p className="text-xs text-gray-500 mb-4">
            Click to add common payment gateways with their default fees.
          </p>
          <div className="flex flex-wrap gap-2">
            {unconfiguredPresets.map((preset) => (
              <button
                key={preset.name}
                onClick={() => handleAddPreset(preset)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {preset.name}
                <span className="text-gray-400">({preset.defaultPct}% + ${preset.defaultFixed.toFixed(2)})</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
