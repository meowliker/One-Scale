'use client';

import { Plus, X } from 'lucide-react';
import type { RuleCondition, RuleOperator } from '@/types/automation';
import type { MetricKey } from '@/types/metrics';
import { allMetrics } from '@/data/metricDefinitions';

interface ConditionBuilderProps {
  conditions: RuleCondition[];
  onChange: (conditions: RuleCondition[]) => void;
}

const operators: { value: RuleOperator; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
];

const timeWindows: { value: RuleCondition['timeWindow']; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last3days', label: 'Last 3 Days' },
  { value: 'last7days', label: 'Last 7 Days' },
  { value: 'last14days', label: 'Last 14 Days' },
  { value: 'last30days', label: 'Last 30 Days' },
];

const defaultCondition: RuleCondition = {
  metric: 'cpa',
  operator: '>',
  value: 0,
  timeWindow: 'last7days',
};

export function ConditionBuilder({ conditions, onChange }: ConditionBuilderProps) {
  const handleAdd = () => {
    onChange([...conditions, { ...defaultCondition }]);
  };

  const handleRemove = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  const handleUpdate = (index: number, field: keyof RuleCondition, value: string | number) => {
    const updated = conditions.map((cond, i) => {
      if (i !== index) return cond;
      return { ...cond, [field]: value };
    });
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">Conditions</label>

      {conditions.map((cond, index) => (
        <div
          key={index}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
        >
          {/* Metric */}
          <select
            value={cond.metric}
            onChange={(e) => handleUpdate(index, 'metric', e.target.value as MetricKey)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {allMetrics.map((m) => (
              <option key={m.key} value={m.key}>
                {m.shortLabel}
              </option>
            ))}
          </select>

          {/* Operator */}
          <select
            value={cond.operator}
            onChange={(e) => handleUpdate(index, 'operator', e.target.value as RuleOperator)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {operators.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          {/* Value */}
          <input
            type="number"
            value={cond.value}
            onChange={(e) => handleUpdate(index, 'value', parseFloat(e.target.value) || 0)}
            className="w-24 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Value"
          />

          {/* Time Window */}
          <select
            value={cond.timeWindow}
            onChange={(e) =>
              handleUpdate(index, 'timeWindow', e.target.value as RuleCondition['timeWindow'])
            }
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {timeWindows.map((tw) => (
              <option key={tw.value} value={tw.value}>
                {tw.label}
              </option>
            ))}
          </select>

          {/* Remove */}
          <button
            onClick={() => handleRemove(index)}
            className="ml-auto rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Remove condition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      <button
        onClick={handleAdd}
        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add Condition
      </button>
    </div>
  );
}
