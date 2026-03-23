'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Loader2,
  Settings,
  Package,
  Globe,
  FlaskConical,
  Brain,
  Target,
  Tag,
  Link2,
  LayoutGrid,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type {
  ProductProfile,
  BidStrategy,
  NamingTemplate,
  TargetingPreset,
  ProductCampaignLink,
} from '@/types/creativeHub';

interface EditProductProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProductProfile | null;
  linkedCampaigns: ProductCampaignLink[];
}

type Section =
  | 'meta'
  | 'product'
  | 'destination'
  | 'testDefaults'
  | 'aiKill'
  | 'targeting'
  | 'naming'
  | 'campaigns'
  | 'clickup';

const bidStrategyLabels: Record<BidStrategy, string> = {
  LOWEST_COST_WITHOUT_CAP: 'Lowest Cost (No Cap)',
  COST_CAP: 'Cost Cap',
  LOWEST_COST_WITH_BID_CAP: 'Bid Cap',
  LOWEST_COST_WITH_MIN_ROAS: 'Min ROAS',
};

const sectionConfig: { id: Section; label: string; Icon: typeof Settings }[] = [
  { id: 'meta', label: 'Meta Configuration', Icon: Settings },
  { id: 'product', label: 'Product Info', Icon: Package },
  { id: 'destination', label: 'Destination', Icon: Globe },
  { id: 'testDefaults', label: 'Test Defaults', Icon: FlaskConical },
  { id: 'aiKill', label: 'AI Kill Thresholds', Icon: Brain },
  { id: 'targeting', label: 'Targeting Presets', Icon: Target },
  { id: 'naming', label: 'Naming Template', Icon: Tag },
  { id: 'campaigns', label: 'Linked Campaigns', Icon: Link2 },
  { id: 'clickup', label: 'ClickUp Integration', Icon: LayoutGrid },
];

function getDefaults(): Partial<ProductProfile> {
  return {
    productName: '',
    adAccountId: '',
    adAccountCurrency: 'USD',
    pageId: '',
    instagramActorId: '',
    pixelId: '',
    conversionEvent: 'PURCHASE',
    destinationUrl: '',
    utmTemplate: '',
    averageOrderValue: undefined,
    defaultBudget: 20,
    defaultDuration: 3,
    defaultBidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    defaultBidAmount: undefined,
    defaultRoasFloor: undefined,
    defaultStructure: 'ABO',
    defaultLaunchStatus: 'PAUSED',
    aiMinSpend: undefined,
    aiMinImpressions: 100,
    aiMinHours: 24,
    aiEvalFrequency: '6h',
    namingTemplate: { campaign: '{product}_{type}_{date}', adset: '{targeting}_{budget}', ad: '{creative}_{hook}' },
    targetingPresets: [],
    clickupListId: '',
    clickupSyncInterval: 60,
  };
}

export function EditProductProfileModal({
  isOpen,
  onClose,
  profile,
  linkedCampaigns,
}: EditProductProfileModalProps) {
  const saveProfile = useCreativeHubStore((s) => s.saveProfile);
  const [form, setForm] = useState<Partial<ProductProfile>>(getDefaults());
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<Section>>(
    new Set(['meta', 'product', 'destination', 'testDefaults'])
  );
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (profile) {
        setForm({ ...profile });
      } else {
        setForm(getDefaults());
      }
      setExpandedSections(new Set(['meta', 'product', 'destination', 'testDefaults']));
    }
  }, [isOpen, profile]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const toggleSection = (section: Section) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const updateField = <K extends keyof ProductProfile>(key: K, value: ProductProfile[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateNamingTemplate = (key: keyof NamingTemplate, value: string) => {
    setForm((prev) => ({
      ...prev,
      namingTemplate: { ...(prev.namingTemplate ?? { campaign: '', adset: '', ad: '' }), [key]: value },
    }));
  };

  const addTargetingPreset = () => {
    if (!newPresetName.trim()) return;
    const preset: TargetingPreset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      targeting: {},
    };
    setForm((prev) => ({
      ...prev,
      targetingPresets: [...(prev.targetingPresets ?? []), preset],
    }));
    setNewPresetName('');
  };

  const removeTargetingPreset = (id: string) => {
    setForm((prev) => ({
      ...prev,
      targetingPresets: (prev.targetingPresets ?? []).filter((p) => p.id !== id),
    }));
  };

  const handleSave = async () => {
    if (!form.productName?.trim()) return;
    setSaving(true);
    try {
      await saveProfile({
        ...form,
        storeId: profile?.storeId ?? form.storeId ?? '',
        id: profile?.id,
      } as Partial<ProductProfile> & { storeId: string });
      onClose();
    } catch {
      // Error toast handled by store in Task 16
    } finally {
      setSaving(false);
    }
  };

  const isNew = !profile;
  const showBidAmount = form.defaultBidStrategy === 'COST_CAP' || form.defaultBidStrategy === 'LOWEST_COST_WITH_BID_CAP';
  const showRoasFloor = form.defaultBidStrategy === 'LOWEST_COST_WITH_MIN_ROAS';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-3xl mx-4 rounded-xl bg-surface-elevated shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {isNew ? 'New Product Profile' : 'Edit Product Profile'}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              {isNew ? 'Configure a new product for creative testing' : form.productName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1">
          {sectionConfig.map(({ id, label, Icon }) => {
            const isExpanded = expandedSections.has(id);
            return (
              <div key={id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(id)}
                  className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-surface-hover/50 transition-colors"
                >
                  <Icon className="h-4 w-4 text-text-dimmed flex-shrink-0" />
                  <span className="text-sm font-medium text-text-primary flex-1">{label}</span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-text-dimmed" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-dimmed" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-border bg-surface-hover/20">
                    {id === 'meta' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Ad Account ID">
                          <input
                            type="text"
                            value={form.adAccountId ?? ''}
                            onChange={(e) => updateField('adAccountId', e.target.value)}
                            placeholder="act_123456789"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Currency">
                          <select
                            value={form.adAccountCurrency ?? 'USD'}
                            onChange={(e) => updateField('adAccountCurrency', e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                            <option value="GBP">GBP</option>
                            <option value="CAD">CAD</option>
                            <option value="AUD">AUD</option>
                          </select>
                        </FormField>
                        <FormField label="Facebook Page ID">
                          <input
                            type="text"
                            value={form.pageId ?? ''}
                            onChange={(e) => updateField('pageId', e.target.value)}
                            placeholder="Page ID"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Instagram Actor ID">
                          <input
                            type="text"
                            value={form.instagramActorId ?? ''}
                            onChange={(e) => updateField('instagramActorId', e.target.value)}
                            placeholder="Instagram actor ID"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Pixel ID">
                          <input
                            type="text"
                            value={form.pixelId ?? ''}
                            onChange={(e) => updateField('pixelId', e.target.value)}
                            placeholder="Pixel ID"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Conversion Event">
                          <select
                            value={form.conversionEvent ?? 'PURCHASE'}
                            onChange={(e) => updateField('conversionEvent', e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="PURCHASE">Purchase</option>
                            <option value="ADD_TO_CART">Add to Cart</option>
                            <option value="INITIATE_CHECKOUT">Initiate Checkout</option>
                            <option value="LEAD">Lead</option>
                            <option value="COMPLETE_REGISTRATION">Complete Registration</option>
                            <option value="VIEW_CONTENT">View Content</option>
                          </select>
                        </FormField>
                      </div>
                    )}

                    {id === 'product' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Product Name" required>
                          <input
                            type="text"
                            value={form.productName ?? ''}
                            onChange={(e) => updateField('productName', e.target.value)}
                            placeholder="e.g. Premium Moisturizer"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Average Order Value">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dimmed text-sm">$</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={form.averageOrderValue ?? ''}
                              onChange={(e) =>
                                updateField('averageOrderValue', e.target.value ? Number(e.target.value) : undefined)
                              }
                              placeholder="0.00"
                              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 pl-7 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </FormField>
                        <FormField label="Product Image URL" colSpan2>
                          <input
                            type="url"
                            value={form.productImage ?? ''}
                            onChange={(e) => updateField('productImage', e.target.value)}
                            placeholder="https://..."
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                      </div>
                    )}

                    {id === 'destination' && (
                      <div className="grid grid-cols-1 gap-4">
                        <FormField label="Destination URL">
                          <input
                            type="url"
                            value={form.destinationUrl ?? ''}
                            onChange={(e) => updateField('destinationUrl', e.target.value)}
                            placeholder="https://yourstore.com/products/..."
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="UTM Template">
                          <input
                            type="text"
                            value={form.utmTemplate ?? ''}
                            onChange={(e) => updateField('utmTemplate', e.target.value)}
                            placeholder="utm_source=meta&utm_medium=paid&utm_campaign={campaign_name}"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <p className="text-[11px] text-text-dimmed mt-1">
                            Available tokens: {'{campaign_name}'}, {'{adset_name}'}, {'{ad_name}'}, {'{product}'}
                          </p>
                        </FormField>
                      </div>
                    )}

                    {id === 'testDefaults' && (
                      <div className="space-y-4">
                        {/* Structure toggle */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-text-secondary w-24">Structure:</span>
                          <div className="inline-flex rounded-lg border border-border overflow-hidden">
                            {(['ABO', 'CBO'] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateField('defaultStructure', s)}
                                className={cn(
                                  'px-4 py-1.5 text-sm font-medium transition-colors',
                                  form.defaultStructure === s
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-text-secondary hover:bg-surface-hover'
                                )}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField label={`Daily Budget (${form.adAccountCurrency ?? 'USD'})`}>
                            <input
                              type="number"
                              min={1}
                              value={form.defaultBudget ?? 20}
                              onChange={(e) => updateField('defaultBudget', Number(e.target.value))}
                              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </FormField>
                          <FormField label="Test Duration (days)">
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={form.defaultDuration ?? 3}
                              onChange={(e) => updateField('defaultDuration', Number(e.target.value))}
                              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </FormField>
                        </div>

                        <FormField label="Bid Strategy">
                          <select
                            value={form.defaultBidStrategy ?? 'LOWEST_COST_WITHOUT_CAP'}
                            onChange={(e) => updateField('defaultBidStrategy', e.target.value as BidStrategy)}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            {Object.entries(bidStrategyLabels).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </FormField>

                        {showBidAmount && (
                          <FormField label={`Bid Amount (${form.adAccountCurrency ?? 'USD'})`}>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={form.defaultBidAmount ?? ''}
                              onChange={(e) =>
                                updateField('defaultBidAmount', e.target.value ? Number(e.target.value) : undefined)
                              }
                              placeholder="0.00"
                              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </FormField>
                        )}

                        {showRoasFloor && (
                          <FormField label="Min ROAS Floor">
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={form.defaultRoasFloor ?? ''}
                              onChange={(e) =>
                                updateField('defaultRoasFloor', e.target.value ? Number(e.target.value) : undefined)
                              }
                              placeholder="e.g. 2.0"
                              className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                          </FormField>
                        )}

                        {/* Launch status */}
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-text-secondary w-24">Launch as:</span>
                          <div className="inline-flex rounded-lg border border-border overflow-hidden">
                            {(['PAUSED', 'ACTIVE'] as const).map((s) => (
                              <button
                                key={s}
                                onClick={() => updateField('defaultLaunchStatus', s)}
                                className={cn(
                                  'px-4 py-1.5 text-sm font-medium transition-colors',
                                  form.defaultLaunchStatus === s
                                    ? s === 'ACTIVE'
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-gray-600 text-white'
                                    : 'bg-white text-text-secondary hover:bg-surface-hover'
                                )}
                              >
                                {s === 'PAUSED' ? 'Paused' : 'Active'}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {id === 'aiKill' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label={`Min Spend Before Kill (${form.adAccountCurrency ?? 'USD'})`}>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={form.aiMinSpend ?? ''}
                            onChange={(e) =>
                              updateField('aiMinSpend', e.target.value ? Number(e.target.value) : undefined)
                            }
                            placeholder="e.g. 30"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Min Impressions">
                          <input
                            type="number"
                            min={0}
                            value={form.aiMinImpressions ?? 100}
                            onChange={(e) => updateField('aiMinImpressions', Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Min Hours Before Eval">
                          <input
                            type="number"
                            min={1}
                            value={form.aiMinHours ?? 24}
                            onChange={(e) => updateField('aiMinHours', Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Evaluation Frequency">
                          <select
                            value={form.aiEvalFrequency ?? '6h'}
                            onChange={(e) => updateField('aiEvalFrequency', e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="1h">Every 1 hour</option>
                            <option value="3h">Every 3 hours</option>
                            <option value="6h">Every 6 hours</option>
                            <option value="12h">Every 12 hours</option>
                            <option value="24h">Every 24 hours</option>
                          </select>
                        </FormField>
                      </div>
                    )}

                    {id === 'targeting' && (
                      <div className="space-y-3">
                        {(form.targetingPresets ?? []).length === 0 && (
                          <p className="text-sm text-text-dimmed italic">No targeting presets saved yet.</p>
                        )}
                        {(form.targetingPresets ?? []).map((preset) => (
                          <div
                            key={preset.id}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 bg-white"
                          >
                            <GripVertical className="h-3.5 w-3.5 text-text-dimmed flex-shrink-0" />
                            <span className="text-sm text-text-primary flex-1">{preset.name}</span>
                            <button
                              onClick={() => removeTargetingPreset(preset.id)}
                              className="text-text-dimmed hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="text"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTargetingPreset()}
                            placeholder="New preset name..."
                            className="flex-1 rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button
                            onClick={addTargetingPreset}
                            disabled={!newPresetName.trim()}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                              newPresetName.trim()
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-100 text-text-dimmed cursor-not-allowed'
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {id === 'naming' && (
                      <div className="space-y-4">
                        <FormField label="Campaign Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.campaign ?? ''}
                            onChange={(e) => updateNamingTemplate('campaign', e.target.value)}
                            placeholder="{product}_{type}_{date}"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Adset Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.adset ?? ''}
                            onChange={(e) => updateNamingTemplate('adset', e.target.value)}
                            placeholder="{targeting}_{budget}"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Ad Pattern">
                          <input
                            type="text"
                            value={form.namingTemplate?.ad ?? ''}
                            onChange={(e) => updateNamingTemplate('ad', e.target.value)}
                            placeholder="{creative}_{hook}"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        {/* Preview */}
                        <div className="rounded-lg bg-surface-hover/50 border border-border px-3 py-2.5">
                          <p className="text-[11px] font-medium text-text-dimmed uppercase tracking-wider mb-1.5">Preview</p>
                          <div className="space-y-1 text-xs text-text-secondary">
                            <p>
                              <span className="text-text-dimmed">Campaign:</span>{' '}
                              {(form.namingTemplate?.campaign ?? '{product}_{type}_{date}')
                                .replace('{product}', form.productName || 'Product')
                                .replace('{type}', 'Testing')
                                .replace('{date}', '2026-03-23')}
                            </p>
                            <p>
                              <span className="text-text-dimmed">Adset:</span>{' '}
                              {(form.namingTemplate?.adset ?? '{targeting}_{budget}')
                                .replace('{targeting}', 'Broad')
                                .replace('{budget}', String(form.defaultBudget ?? 20))}
                            </p>
                            <p>
                              <span className="text-text-dimmed">Ad:</span>{' '}
                              {(form.namingTemplate?.ad ?? '{creative}_{hook}')
                                .replace('{creative}', 'Creative-1')
                                .replace('{hook}', 'Hook-A')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {id === 'campaigns' && (
                      <div className="space-y-2">
                        {linkedCampaigns.length === 0 && (
                          <p className="text-sm text-text-dimmed italic">No campaigns linked to this profile.</p>
                        )}
                        {linkedCampaigns.map((link) => (
                          <div
                            key={link.id}
                            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 bg-white"
                          >
                            <span className="text-sm text-text-primary flex-1 truncate">{link.campaignName}</span>
                            <select
                              value={link.campaignType}
                              className="w-28 rounded-lg border border-border bg-surface-hover px-2 py-1 text-xs text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                              onChange={() => {
                                /* Campaign type change would be handled via store */
                              }}
                            >
                              <option value="testing">Testing</option>
                              <option value="scaling">Scaling</option>
                              <option value="retargeting">Retargeting</option>
                            </select>
                            <button className="text-text-dimmed hover:text-red-500 transition-colors text-xs">
                              Unlink
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {id === 'clickup' && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="ClickUp List ID">
                          <input
                            type="text"
                            value={form.clickupListId ?? ''}
                            onChange={(e) => updateField('clickupListId', e.target.value)}
                            placeholder="List ID"
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </FormField>
                        <FormField label="Sync Interval (minutes)">
                          <select
                            value={form.clickupSyncInterval ?? 60}
                            onChange={(e) => updateField('clickupSyncInterval', Number(e.target.value))}
                            className="w-full rounded-lg border border-border bg-surface-hover px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value={15}>Every 15 min</option>
                            <option value={30}>Every 30 min</option>
                            <option value={60}>Every 1 hour</option>
                            <option value={360}>Every 6 hours</option>
                            <option value={1440}>Daily</option>
                          </select>
                        </FormField>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4 flex-shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.productName?.trim()}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              saving || !form.productName?.trim()
                ? 'bg-blue-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            )}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? 'Create Profile' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Reusable form field ── */

function FormField({
  label,
  required,
  children,
  colSpan2,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  colSpan2?: boolean;
}) {
  return (
    <label className={cn('block', colSpan2 && 'col-span-2')}>
      <span className="text-xs font-medium text-text-secondary mb-1 block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
