'use client';

import { Shield } from 'lucide-react';
import { Toggle } from '@/components/ui/Toggle';
import type { TestRule } from '@/types/creativeSchedule';

interface TestRulesConfigProps {
  rules: TestRule[];
  onToggle: (id: string) => void;
}

export function TestRulesConfig({ rules, onToggle }: TestRulesConfigProps) {
  if (rules.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <Shield className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-sm text-gray-500">No test rules configured</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Rule Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Condition
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              Action
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rules.map((rule) => (
            <tr key={rule.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{rule.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{rule.description}</p>
                </div>
              </td>
              <td className="px-4 py-4">
                <span className="text-sm text-gray-700">{rule.condition}</span>
                <span className="ml-1 text-sm font-medium text-blue-600">
                  {rule.metric === 'ctr' || rule.metric === 'frequency'
                    ? rule.threshold
                    : `$${rule.threshold}`}
                  {rule.metric === 'ctr' && '%'}
                  {rule.metric === 'frequency' && 'x'}
                  {rule.metric === 'roas' && 'x'}
                </span>
              </td>
              <td className="px-4 py-4">
                <span className="text-sm text-gray-700">{rule.action}</span>
              </td>
              <td className="px-4 py-4">
                <div className="flex justify-center">
                  <Toggle
                    checked={rule.isActive}
                    onChange={() => onToggle(rule.id)}
                    size="sm"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
