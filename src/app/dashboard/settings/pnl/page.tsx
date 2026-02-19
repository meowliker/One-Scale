'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Calculator, Package, Monitor } from 'lucide-react';
import { useStoreStore } from '@/stores/storeStore';
import { Tabs } from '@/components/ui/Tabs';
import { ProductCostsTab } from '@/components/pnl-settings/ProductCostsTab';
import { ShippingSettingsTab } from '@/components/pnl-settings/ShippingSettingsTab';
import { PaymentFeesTab } from '@/components/pnl-settings/PaymentFeesTab';
import { CustomExpensesTab } from '@/components/pnl-settings/CustomExpensesTab';
import { HandlingFeesTab } from '@/components/pnl-settings/HandlingFeesTab';
import { cn } from '@/lib/utils';
import type {
  PnLSettings,
  ShippingSettings,
  PaymentFee,
  CustomExpense,
  HandlingFees,
  ProductCost,
  ProductType,
} from '@/types/pnlSettings';
import {
  defaultShippingSettings,
  defaultHandlingFees,
} from '@/types/pnlSettings';

const allTabs = [
  { id: 'product_costs', label: 'Product Costs (COGS)', physical: true, digital: true },
  { id: 'shipping', label: 'Shipping', physical: true, digital: false },
  { id: 'payment_fees', label: 'Payment Fees', physical: true, digital: true },
  { id: 'custom_expenses', label: 'Custom Expenses', physical: true, digital: true },
  { id: 'handling', label: 'Handling Fees', physical: true, digital: false },
];

export default function PnLSettingsPage() {
  const [activeTab, setActiveTab] = useState('product_costs');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PnLSettings>({
    productType: 'physical',
    productCosts: [],
    shipping: defaultShippingSettings,
    paymentFees: [],
    customExpenses: [],
    handling: defaultHandlingFees,
  });

  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const isDigital = settings.productType === 'digital';

  // Filter tabs based on product type
  const settingsTabs = useMemo(() => {
    return allTabs
      .filter((tab) => isDigital ? tab.digital : tab.physical)
      .map(({ id, label }) => ({ id, label }));
  }, [isDigital]);

  // If active tab is hidden (e.g. switched to digital while on shipping), reset
  useEffect(() => {
    const visibleIds = settingsTabs.map((t) => t.id);
    if (!visibleIds.includes(activeTab)) {
      setActiveTab('product_costs');
    }
  }, [settingsTabs, activeTab]);

  const fetchSettings = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/settings/pnl?storeId=${encodeURIComponent(activeStoreId)}`);
      if (res.ok) {
        const data = await res.json();
        setSettings({
          productType: data.productType || 'physical',
          productCosts: data.productCosts || [],
          shipping: data.shipping || defaultShippingSettings,
          paymentFees: data.paymentFees || [],
          customExpenses: data.customExpenses || [],
          handling: data.handling || defaultHandlingFees,
        });
      }
    } catch {
      // Settings may not exist yet, use defaults
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // --- Save helpers ---
  const saveSection = async (section: string, data: unknown) => {
    if (!activeStoreId) return;
    setSaving(true);
    try {
      await fetch(`/api/settings/pnl?storeId=${encodeURIComponent(activeStoreId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data }),
      });
      await fetchSettings();
    } catch (err) {
      console.error('Failed to save P&L settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const addItem = async (section: string, data: unknown) => {
    if (!activeStoreId) return;
    setSaving(true);
    try {
      await fetch(`/api/settings/pnl?storeId=${encodeURIComponent(activeStoreId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, data }),
      });
      await fetchSettings();
    } catch (err) {
      console.error('Failed to add P&L item:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteItem = async (section: string, id: string | number) => {
    if (!activeStoreId) return;
    setSaving(true);
    try {
      await fetch(
        `/api/settings/pnl?storeId=${encodeURIComponent(activeStoreId)}&section=${section}&id=${id}`,
        { method: 'DELETE' }
      );
      await fetchSettings();
    } catch (err) {
      console.error('Failed to delete P&L item:', err);
    } finally {
      setSaving(false);
    }
  };

  // --- Handlers ---
  const handleProductTypeChange = (type: ProductType) => {
    saveSection('product_type', { productType: type });
  };

  const handleShippingSave = (data: ShippingSettings) => saveSection('shipping', data);
  const handleHandlingSave = (data: HandlingFees) => saveSection('handling', data);

  const handlePaymentFeeAdd = (data: PaymentFee) => addItem('payment_fees', data);
  const handlePaymentFeeUpdate = (data: PaymentFee) => saveSection('payment_fees', data);
  const handlePaymentFeeDelete = (gateway: string) => deleteItem('payment_fees', gateway);

  const handleExpenseAdd = (data: CustomExpense) => addItem('custom_expenses', data);
  const handleExpenseUpdate = (data: CustomExpense) => saveSection('custom_expenses', data);
  const handleExpenseDelete = (id: number) => deleteItem('custom_expenses', id);

  const handleProductCostUpdate = (data: ProductCost) => saveSection('product_costs', data);
  const handleProductCostDelete = (productId: string) => deleteItem('product_costs', productId);

  if (!activeStoreId) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center">
        <Calculator className="mx-auto h-12 w-12 text-text-dimmed" />
        <h3 className="mt-4 text-lg font-semibold text-text-primary">No store selected</h3>
        <p className="mt-2 text-sm text-text-secondary">
          Select a store from the store switcher to configure P&L settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">P&L Cost Settings</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            Configure your cost structure for accurate profit & loss tracking
          </p>
        </div>
        {saving && (
          <div className="flex items-center gap-2 text-sm text-primary-light">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving...
          </div>
        )}
      </div>

      {/* Product Type Toggle */}
      <div className="rounded-lg border border-border bg-surface-elevated p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-1">Product Type</h3>
        <p className="text-xs text-text-secondary mb-4">
          Select your product type. Digital products skip shipping & handling cost configuration.
        </p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            onClick={() => handleProductTypeChange('physical')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              settings.productType !== 'digital'
                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                : 'border-border hover:border-border-light hover:bg-surface-hover'
            )}
          >
            <div className="flex items-center gap-2.5">
              <Package className={cn(
                'h-5 w-5',
                settings.productType !== 'digital' ? 'text-primary-light' : 'text-text-muted'
              )} />
              <span className="text-sm font-medium text-text-primary">Physical Product</span>
            </div>
            <p className="mt-1.5 text-xs text-text-secondary pl-7.5">
              Requires shipping, handling & packaging costs
            </p>
          </button>
          <button
            onClick={() => handleProductTypeChange('digital')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              isDigital
                ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-200'
                : 'border-border hover:border-border-light hover:bg-surface-hover'
            )}
          >
            <div className="flex items-center gap-2.5">
              <Monitor className={cn(
                'h-5 w-5',
                isDigital ? 'text-primary-light' : 'text-text-muted'
              )} />
              <span className="text-sm font-medium text-text-primary">Digital Product</span>
            </div>
            <p className="mt-1.5 text-xs text-text-secondary pl-7.5">
              No shipping or handling. Shipping charged counts as revenue.
            </p>
          </button>
        </div>
      </div>

      {/* Digital product info */}
      {isDigital && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <Monitor className="mt-0.5 h-5 w-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-900">
                Digital Product Mode
              </p>
              <p className="mt-1 text-xs text-green-700">
                Shipping & handling tabs are hidden. Any shipping charges collected from customers
                will be added to your revenue in P&L calculations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info banner */}
      {!isDigital && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <Calculator className="mt-0.5 h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Accurate costs = Accurate profit tracking
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Set up your product costs, shipping, payment fees, and custom expenses below.
                These settings are used to calculate your P&L dashboard metrics, including net profit and margins.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs tabs={settingsTabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-text-secondary">Loading cost settings...</span>
        </div>
      ) : (
        <>
          {activeTab === 'product_costs' && (
            <ProductCostsTab
              productCosts={settings.productCosts}
              onUpdate={handleProductCostUpdate}
              onDelete={handleProductCostDelete}
              storeId={activeStoreId}
            />
          )}
          {activeTab === 'shipping' && !isDigital && (
            <ShippingSettingsTab
              settings={settings.shipping}
              onSave={handleShippingSave}
            />
          )}
          {activeTab === 'payment_fees' && (
            <PaymentFeesTab
              fees={settings.paymentFees}
              onAdd={handlePaymentFeeAdd}
              onUpdate={handlePaymentFeeUpdate}
              onDelete={handlePaymentFeeDelete}
              storeId={activeStoreId}
            />
          )}
          {activeTab === 'custom_expenses' && (
            <CustomExpensesTab
              expenses={settings.customExpenses}
              onAdd={handleExpenseAdd}
              onUpdate={handleExpenseUpdate}
              onDelete={handleExpenseDelete}
            />
          )}
          {activeTab === 'handling' && !isDigital && (
            <HandlingFeesTab
              settings={settings.handling}
              onSave={handleHandlingSave}
            />
          )}
        </>
      )}
    </div>
  );
}
