'use client';

import { Pause, Play, TrendingUp, TrendingDown, Bell } from 'lucide-react';
import type { RuleAction, RuleActionType } from '@/types/automation';
import { cn } from '@/lib/utils';

interface ActionSelectorProps {
  action: RuleAction;
  onChange: (action: RuleAction) => void;
}

const actionOptions: {
  type: RuleActionType;
  label: string;
  icon: React.ElementType;
  tint: string;
  selectedBorder: string;
}[] = [
  {
    type: 'pause',
    label: 'Pause',
    icon: Pause,
    tint: 'text-red-500 bg-red-50',
    selectedBorder: 'border-red-500 ring-red-100',
  },
  {
    type: 'enable',
    label: 'Enable',
    icon: Play,
    tint: 'text-green-500 bg-green-50',
    selectedBorder: 'border-green-500 ring-green-100',
  },
  {
    type: 'adjustBudgetUp',
    label: 'Increase Budget',
    icon: TrendingUp,
    tint: 'text-green-500 bg-green-50',
    selectedBorder: 'border-green-500 ring-green-100',
  },
  {
    type: 'adjustBudgetDown',
    label: 'Decrease Budget',
    icon: TrendingDown,
    tint: 'text-orange-500 bg-orange-50',
    selectedBorder: 'border-orange-500 ring-orange-100',
  },
  {
    type: 'notify',
    label: 'Notify',
    icon: Bell,
    tint: 'text-blue-500 bg-blue-50',
    selectedBorder: 'border-blue-500 ring-blue-100',
  },
];

export function ActionSelector({ action, onChange }: ActionSelectorProps) {
  const handleTypeChange = (type: RuleActionType) => {
    const params: RuleAction['params'] = {};
    if (type === 'adjustBudgetUp' || type === 'adjustBudgetDown') {
      params.percentage = action.params.percentage || 10;
    }
    if (type === 'notify') {
      params.notifyEmail = action.params.notifyEmail || '';
    }
    onChange({ type, params });
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">Action</label>

      <div className="grid grid-cols-5 gap-3">
        {actionOptions.map((opt) => {
          const Icon = opt.icon;
          const isSelected = action.type === opt.type;

          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => handleTypeChange(opt.type)}
              className={cn(
                'flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-center transition-all',
                isSelected
                  ? `${opt.selectedBorder} ring-2`
                  : 'border-gray-200 hover:border-gray-300'
              )}
            >
              <div className={cn('rounded-lg p-2', opt.tint)}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-gray-700">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {/* Conditional params */}
      {(action.type === 'adjustBudgetUp' || action.type === 'adjustBudgetDown') && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Percentage (%)
          </label>
          <input
            type="number"
            min={1}
            max={100}
            value={action.params.percentage ?? 10}
            onChange={(e) =>
              onChange({
                ...action,
                params: { ...action.params, percentage: parseInt(e.target.value) || 0 },
              })
            }
            className="w-32 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {action.type === 'notify' && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={action.params.notifyEmail ?? ''}
            onChange={(e) =>
              onChange({
                ...action,
                params: { ...action.params, notifyEmail: e.target.value },
              })
            }
            placeholder="team@example.com"
            className="w-full max-w-sm rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}
    </div>
  );
}
