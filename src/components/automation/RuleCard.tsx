'use client';

import { Trash2, Clock } from 'lucide-react';
import type { AutomationRule } from '@/types/automation';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/Toggle';
import { Badge } from '@/components/ui/Badge';
import { getMetricDefinition } from '@/data/metricDefinitions';

interface RuleCardProps {
  rule: AutomationRule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const timeWindowLabels: Record<string, string> = {
  today: 'Today',
  last3days: 'Last 3 Days',
  last7days: 'Last 7 Days',
  last14days: 'Last 14 Days',
  last30days: 'Last 30 Days',
};

const frequencyLabels: Record<string, string> = {
  hourly: 'Hourly',
  every6h: 'Every 6 Hours',
  daily: 'Daily',
  weekly: 'Weekly',
};

const actionLabels: Record<string, string> = {
  pause: 'Pause',
  enable: 'Enable',
  adjustBudgetUp: 'Increase Budget',
  adjustBudgetDown: 'Decrease Budget',
  notify: 'Send Notification',
};

function formatActionSummary(rule: AutomationRule): string {
  const base = actionLabels[rule.action.type] || rule.action.type;
  if (
    (rule.action.type === 'adjustBudgetUp' || rule.action.type === 'adjustBudgetDown') &&
    rule.action.params.percentage
  ) {
    return `${base} by ${rule.action.params.percentage}%`;
  }
  if (rule.action.type === 'notify' && rule.action.params.notifyEmail) {
    return `${base} to ${rule.action.params.notifyEmail}`;
  }
  return base;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function RuleCard({ rule, onToggle, onDelete }: RuleCardProps) {
  const isActive = rule.status === 'active';

  return (
    <div
      className={cn(
        'relative rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md',
        isActive ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-300'
      )}
    >
      <div className="p-5">
        {/* Header row */}
        <div className="flex items-start gap-4">
          <div className="mt-0.5">
            <Toggle
              checked={isActive}
              onChange={() => onToggle(rule.id)}
              size="sm"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 truncate">
                {rule.name}
              </h3>
              <Badge variant="default">{rule.appliesTo}</Badge>
            </div>

            <p className="mt-1 text-sm text-gray-500">{rule.description}</p>

            {/* Conditions */}
            <div className="mt-3 space-y-1">
              {rule.conditions.map((cond, i) => {
                const metric = getMetricDefinition(cond.metric);
                return (
                  <div
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2.5 py-1 text-xs text-gray-700 mr-2"
                  >
                    <span className="font-medium text-gray-500">IF</span>{' '}
                    <span className="font-semibold">{metric?.shortLabel ?? cond.metric}</span>{' '}
                    <span className="text-gray-400">{cond.operator}</span>{' '}
                    <span className="font-semibold">{cond.value}</span>{' '}
                    <span className="text-gray-400">over</span>{' '}
                    <span>{timeWindowLabels[cond.timeWindow]}</span>
                  </div>
                );
              })}
            </div>

            {/* Action */}
            <div className="mt-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                <span className="font-medium text-blue-500">THEN</span>{' '}
                <span className="font-semibold">{formatActionSummary(rule)}</span>
              </span>
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
              <Badge variant="info">{frequencyLabels[rule.frequency]}</Badge>

              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last triggered: {formatDate(rule.lastTriggered)}
              </span>

              <span>Triggered {rule.triggerCount} time{rule.triggerCount !== 1 ? 's' : ''}</span>

              <button
                onClick={() => onDelete(rule.id)}
                className="ml-auto rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete rule"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
