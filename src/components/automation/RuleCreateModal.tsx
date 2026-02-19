'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type {
  AutomationRule,
  RuleCondition,
  RuleAction,
  RuleFrequency,
} from '@/types/automation';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { ConditionBuilder } from '@/components/automation/ConditionBuilder';
import { ActionSelector } from '@/components/automation/ActionSelector';

interface RuleCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rule: AutomationRule) => void;
}

const frequencyOptions: { value: RuleFrequency; label: string }[] = [
  { value: 'hourly', label: 'Hourly' },
  { value: 'every6h', label: 'Every 6 Hours' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
];

const appliesToOptions: { value: AutomationRule['appliesTo']; label: string }[] = [
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'adsets', label: 'Ad Sets' },
  { value: 'ads', label: 'Ads' },
];

const TOTAL_STEPS = 4;

export function RuleCreateModal({ isOpen, onClose, onSave }: RuleCreateModalProps) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { metric: 'cpa', operator: '>', value: 0, timeWindow: 'last7days' },
  ]);
  const [action, setAction] = useState<RuleAction>({
    type: 'pause',
    params: {},
  });
  const [frequency, setFrequency] = useState<RuleFrequency>('daily');
  const [appliesTo, setAppliesTo] = useState<AutomationRule['appliesTo']>('campaigns');

  const resetForm = () => {
    setStep(1);
    setName('');
    setDescription('');
    setConditions([{ metric: 'cpa', operator: '>', value: 0, timeWindow: 'last7days' }]);
    setAction({ type: 'pause', params: {} });
    setFrequency('daily');
    setAppliesTo('campaigns');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreate = () => {
    const rule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name,
      description,
      status: 'active',
      conditions,
      action,
      frequency,
      appliesTo,
      lastTriggered: null,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    onSave(rule);
    resetForm();
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 1:
        return name.trim().length > 0;
      case 2:
        return conditions.length > 0 && conditions.every((c) => c.value > 0);
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const stepTitles = ['Rule Details', 'Conditions', 'Action', 'Schedule'];

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Create Automation Rule" size="lg">
      {/* Step indicator */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {stepTitles.map((title, i) => {
          const stepNum = i + 1;
          const isCurrent = step === stepNum;
          const isCompleted = step > stepNum;

          return (
            <div key={stepNum} className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                    isCurrent && 'bg-blue-600 text-white',
                    isCompleted && 'bg-green-500 text-white',
                    !isCurrent && !isCompleted && 'bg-gray-200 text-gray-500'
                  )}
                >
                  {stepNum}
                </div>
                <span
                  className={cn(
                    'text-xs font-medium',
                    isCurrent ? 'text-blue-600' : 'text-gray-400'
                  )}
                >
                  {title}
                </span>
              </div>
              {i < stepTitles.length - 1 && (
                <ChevronRight className="h-4 w-4 text-gray-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Name + Description */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Stop Loss - High CPA"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this rule does..."
              rows={3}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
      )}

      {/* Step 2: Conditions */}
      {step === 2 && (
        <ConditionBuilder conditions={conditions} onChange={setConditions} />
      )}

      {/* Step 3: Action */}
      {step === 3 && <ActionSelector action={action} onChange={setAction} />}

      {/* Step 4: Frequency + Applies To */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Check Frequency
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RuleFrequency)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {frequencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Applies To</label>
            <select
              value={appliesTo}
              onChange={(e) =>
                setAppliesTo(e.target.value as AutomationRule['appliesTo'])
              }
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {appliesToOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : handleClose())}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          {step > 1 ? 'Back' : 'Cancel'}
        </button>

        {step < TOTAL_STEPS ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors',
              canProceed()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            )}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleCreate}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Create Rule
          </button>
        )}
      </div>
    </Modal>
  );
}
