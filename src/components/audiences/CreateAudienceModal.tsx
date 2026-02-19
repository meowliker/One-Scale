'use client';

import { useState } from 'react';
import { X, Users, Globe, ShoppingCart, Mail, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface CreateAudienceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AudienceType =
  | 'website_visitors'
  | 'purchasers'
  | 'add_to_cart'
  | 'email_subscribers'
  | 'lookalike';

const audienceTypes: {
  key: AudienceType;
  label: string;
  icon: typeof Users;
  description: string;
}[] = [
  {
    key: 'website_visitors',
    label: 'Website Visitors',
    icon: Globe,
    description: 'People who visited your website',
  },
  {
    key: 'purchasers',
    label: 'Purchasers',
    icon: ShoppingCart,
    description: 'People who completed a purchase',
  },
  {
    key: 'add_to_cart',
    label: 'Add to Cart',
    icon: ShoppingCart,
    description: 'People who added items to cart',
  },
  {
    key: 'email_subscribers',
    label: 'Email Subscribers',
    icon: Mail,
    description: 'Upload your email subscriber list',
  },
  {
    key: 'lookalike',
    label: 'Lookalike',
    icon: Copy,
    description: 'Find people similar to your audience',
  },
];

const templates = [
  { name: 'High-Intent Shoppers', type: 'add_to_cart' as AudienceType, lookback: 30 },
  { name: 'Recent Purchasers', type: 'purchasers' as AudienceType, lookback: 90 },
  { name: 'All Site Visitors', type: 'website_visitors' as AudienceType, lookback: 180 },
  { name: '1% Purchase Lookalike', type: 'lookalike' as AudienceType, lookback: 90 },
];

export function CreateAudienceModal({ isOpen, onClose }: CreateAudienceModalProps) {
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<AudienceType | null>(null);
  const [lookbackWindow, setLookbackWindow] = useState(180);
  const [lookalikePercent, setLookalikePercent] = useState(1);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [audienceName, setAudienceName] = useState('');

  const handleSave = () => {
    if (!audienceName.trim()) {
      toast.error('Please enter an audience name');
      return;
    }
    toast.success(`Audience "${audienceName}" created successfully`);
    onClose();
    resetForm();
  };

  const resetForm = () => {
    setStep(1);
    setSelectedType(null);
    setLookbackWindow(180);
    setLookalikePercent(1);
    setExclusions([]);
    setAudienceName('');
  };

  const applyTemplate = (template: { name: string; type: AudienceType; lookback: number }) => {
    setSelectedType(template.type);
    setLookbackWindow(template.lookback);
    setAudienceName(template.name);
    setStep(2);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Create Audience
            </h2>
            <p className="text-xs text-gray-500">Step {step} of 3</p>
          </div>
          <button
            onClick={() => {
              onClose();
              resetForm();
            }}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex gap-1 px-6 pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full',
                s <= step ? 'bg-blue-600' : 'bg-gray-200'
              )}
            />
          ))}
        </div>

        <div className="p-6">
          {/* Step 1: Choose type */}
          {step === 1 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Choose Audience Type
              </h3>
              <div className="space-y-2">
                {audienceTypes.map((at) => {
                  const Icon = at.icon;
                  return (
                    <button
                      key={at.key}
                      onClick={() => {
                        setSelectedType(at.key);
                        setStep(2);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                        selectedType === at.key
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                        <Icon className="h-4 w-4 text-gray-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {at.label}
                        </p>
                        <p className="text-xs text-gray-500">
                          {at.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Templates */}
              <div className="mt-4 border-t border-gray-200 pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                  Quick Templates
                </h4>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => applyTemplate(t)}
                      className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Configure */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Configure Audience
              </h3>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Lookback Window (days)
                </label>
                <select
                  value={lookbackWindow}
                  onChange={(e) => setLookbackWindow(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>365 days</option>
                </select>
              </div>

              {selectedType === 'lookalike' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Lookalike Percentage
                  </label>
                  <select
                    value={lookalikePercent}
                    onChange={(e) =>
                      setLookalikePercent(Number(e.target.value))
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={1}>1% (Most similar)</option>
                    <option value={2}>2%</option>
                    <option value={3}>3%</option>
                    <option value={5}>5%</option>
                    <option value={10}>10% (Broadest reach)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Exclusions
                </label>
                <div className="space-y-1">
                  {['Existing Purchasers', 'Cart Abandoners', 'Email Subscribers'].map(
                    (exc) => (
                      <label
                        key={exc}
                        className="flex items-center gap-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={exclusions.includes(exc)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExclusions([...exclusions, exc]);
                            } else {
                              setExclusions(exclusions.filter((x) => x !== exc));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        Exclude {exc}
                      </label>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Name & Save */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Name & Save
              </h3>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">
                  Audience Name
                </label>
                <input
                  type="text"
                  value={audienceName}
                  onChange={(e) => setAudienceName(e.target.value)}
                  placeholder="e.g., Website Visitors 180d"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <h4 className="mb-2 text-xs font-semibold text-gray-500">
                  Summary
                </h4>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>
                    Type:{' '}
                    <span className="font-medium text-gray-900">
                      {audienceTypes.find((a) => a.key === selectedType)?.label}
                    </span>
                  </p>
                  <p>
                    Lookback:{' '}
                    <span className="font-medium text-gray-900">
                      {lookbackWindow} days
                    </span>
                  </p>
                  {selectedType === 'lookalike' && (
                    <p>
                      Lookalike:{' '}
                      <span className="font-medium text-gray-900">
                        {lookalikePercent}%
                      </span>
                    </p>
                  )}
                  {exclusions.length > 0 && (
                    <p>
                      Exclusions:{' '}
                      <span className="font-medium text-gray-900">
                        {exclusions.join(', ')}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between border-t border-gray-200 px-6 py-4">
          <button
            onClick={() => {
              if (step === 1) {
                onClose();
                resetForm();
              } else {
                setStep(step - 1);
              }
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !selectedType}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create Audience
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
