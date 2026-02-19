'use client';

import type { AutomationRule } from '@/types/automation';
import { RuleCard } from '@/components/automation/RuleCard';
import { Zap } from 'lucide-react';

interface RulesListProps {
  rules: AutomationRule[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function RulesList({ rules, onToggle, onDelete }: RulesListProps) {
  if (rules.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white py-16">
        <Zap className="h-10 w-10 text-gray-400" />
        <h3 className="mt-3 text-sm font-semibold text-gray-900">No rules yet</h3>
        <p className="mt-1 text-sm text-gray-500">
          Create your first automation rule to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rules.map((rule) => (
        <RuleCard key={rule.id} rule={rule} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </div>
  );
}
