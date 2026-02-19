'use client';

import { useState } from 'react';
import {
  Rocket,
  XCircle,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AutoTestConfig } from '@/data/mockAutoTestRules';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/Toggle';

interface AutoTestRulesProps {
  config: AutoTestConfig;
}

interface RuleDefinition {
  id: string;
  icon: LucideIcon;
  label: string;
  description: string;
  accentColor: string;
  borderColor: string;
  iconBg: string;
}

function buildRules(config: AutoTestConfig): RuleDefinition[] {
  return [
    {
      id: 'rule-launch',
      icon: Rocket,
      label: 'Launch Rule',
      description: `Every ${config.launchDay}, launch ${config.launchCount} new creative${config.launchCount !== 1 ? 's' : ''} from the schedule queue into "${config.defaultCampaignName}" with $${config.minBudgetPerTest}/day each`,
      accentColor: 'border-l-blue-500',
      borderColor: 'hover:border-blue-200',
      iconBg: 'bg-blue-100 text-blue-600',
    },
    {
      id: 'rule-kill',
      icon: XCircle,
      label: 'Kill Rule',
      description: `After ${config.testDurationDays} days, if CPA > $${config.autoKillCPA} or ROAS < ${config.autoKillROAS}x, kill the ad`,
      accentColor: 'border-l-red-500',
      borderColor: 'hover:border-red-200',
      iconBg: 'bg-red-100 text-red-600',
    },
    {
      id: 'rule-scale',
      icon: TrendingUp,
      label: 'Scale Rule',
      description: `After ${config.testDurationDays} days, if ROAS > ${config.autoScaleROAS}x or CPA < $${config.autoScaleCPA}, move to scaling campaign with $${config.autoScaleBudget}/day`,
      accentColor: 'border-l-green-500',
      borderColor: 'hover:border-green-200',
      iconBg: 'bg-green-100 text-green-600',
    },
    {
      id: 'rule-fatigue',
      icon: RefreshCw,
      label: 'Fatigue Rule',
      description: `If creative fatigue score > ${config.fatigueThreshold}%, schedule a replacement from queue`,
      accentColor: 'border-l-orange-500',
      borderColor: 'hover:border-orange-200',
      iconBg: 'bg-orange-100 text-orange-600',
    },
  ];
}

export function AutoTestRules({ config }: AutoTestRulesProps) {
  const rules = buildRules(config);
  const [enabledRules, setEnabledRules] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(rules.map((r) => [r.id, true]))
  );

  function handleToggle(ruleId: string) {
    setEnabledRules((prev) => ({ ...prev, [ruleId]: !prev[ruleId] }));
  }

  return (
    <div className="space-y-3">
      {rules.map((rule) => {
        const Icon = rule.icon;
        const isEnabled = enabledRules[rule.id] ?? true;

        return (
          <div
            key={rule.id}
            className={cn(
              'relative rounded-lg border border-l-4 bg-white shadow-sm transition-all',
              rule.accentColor,
              rule.borderColor,
              !isEnabled && 'opacity-60'
            )}
          >
            <div className="flex items-start gap-4 p-4">
              {/* Icon */}
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  rule.iconBg
                )}
              >
                <Icon className="h-5 w-5" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-gray-900">{rule.label}</h4>
                </div>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">
                  {rule.description}
                </p>
              </div>

              {/* Toggle */}
              <div className="shrink-0 pt-0.5">
                <Toggle
                  checked={isEnabled}
                  onChange={() => handleToggle(rule.id)}
                  size="sm"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
