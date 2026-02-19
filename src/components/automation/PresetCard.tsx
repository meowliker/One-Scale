'use client';

import { Zap } from 'lucide-react';
import type { RulePreset } from '@/types/automation';
import { getMetricDefinition } from '@/data/metricDefinitions';

interface PresetCardProps {
  preset: RulePreset;
  onUse: (preset: RulePreset) => void;
}

const iconEmojis: Record<string, string> = {
  ShieldAlert: '\uD83D\uDEE1\uFE0F',
  TrendingUp: '\uD83D\uDCC8',
  RefreshCw: '\uD83D\uDD04',
  ShieldCheck: '\uD83D\uDEE1\uFE0F',
};

const timeWindowLabels: Record<string, string> = {
  today: 'Today',
  last3days: 'Last 3 Days',
  last7days: 'Last 7 Days',
  last14days: 'Last 14 Days',
  last30days: 'Last 30 Days',
};

const actionLabels: Record<string, string> = {
  pause: 'Pause',
  enable: 'Enable',
  adjustBudgetUp: 'Increase Budget',
  adjustBudgetDown: 'Decrease Budget',
  notify: 'Send Notification',
};

function formatActionText(preset: RulePreset): string {
  const base = actionLabels[preset.action.type] || preset.action.type;
  if (
    (preset.action.type === 'adjustBudgetUp' || preset.action.type === 'adjustBudgetDown') &&
    preset.action.params.percentage
  ) {
    return `${base} by ${preset.action.params.percentage}%`;
  }
  return base;
}

export function PresetCard({ preset, onUse }: PresetCardProps) {
  const emoji = iconEmojis[preset.icon] || '\u26A1';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-label={preset.name}>
          {emoji}
        </span>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{preset.name}</h3>
          <p className="mt-1 text-sm text-gray-500">{preset.description}</p>

          {/* Conditions summary */}
          <div className="mt-3 space-y-1">
            {preset.conditions.map((cond, i) => {
              const metric = getMetricDefinition(cond.metric);
              return (
                <p key={i} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-500">IF</span>{' '}
                  {metric?.shortLabel ?? cond.metric} {cond.operator} {cond.value}{' '}
                  over {timeWindowLabels[cond.timeWindow]}
                </p>
              );
            })}
            <p className="text-xs text-gray-600">
              <span className="font-medium text-blue-500">THEN</span>{' '}
              {formatActionText(preset)}
            </p>
          </div>

          <button
            onClick={() => onUse(preset)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            Use This Preset
          </button>
        </div>
      </div>
    </div>
  );
}
