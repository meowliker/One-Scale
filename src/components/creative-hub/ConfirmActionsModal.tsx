'use client';

import { useState, useMemo } from 'react';
import { XCircle, TrendingUp, Clock, Award, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Checkbox } from '@/components/ui/Checkbox';
import type { CreativeTestItem, AIRecommendation } from '@/types/creativeHub';

interface ActionItem {
  itemId: string;
  creativeName: string;
  recommendation: AIRecommendation;
  reasoning?: string;
  currentSpend: number;
  enabled: boolean;
}

interface ConfirmActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CreativeTestItem[];
  dailyBudget: number;
  currency?: string;
  onExecute: (actions: Record<string, string>, saveCopy: boolean) => void;
}

const actionConfig: Record<AIRecommendation, { icon: typeof XCircle; color: string; label: string; effect: string }> = {
  kill: { icon: XCircle, color: 'text-red-500', label: 'Kill', effect: 'Pause ad and reallocate budget' },
  scale: { icon: TrendingUp, color: 'text-emerald-500', label: 'Scale', effect: 'Increase budget by 30%' },
  wait: { icon: Clock, color: 'text-amber-500', label: 'Wait', effect: 'Continue monitoring, no changes' },
  graduate: { icon: Award, color: 'text-blue-500', label: 'Graduate', effect: 'Move to scaling campaign' },
};

export function ConfirmActionsModal({
  isOpen,
  onClose,
  items,
  dailyBudget,
  currency,
  onExecute,
}: ConfirmActionsModalProps) {
  const initialActions = useMemo(
    () =>
      items
        .filter((i) => i.aiRecommendation)
        .map((i) => ({
          itemId: i.id,
          creativeName: i.creativeName,
          recommendation: i.aiRecommendation!,
          reasoning: i.aiReasoning,
          currentSpend: i.spend,
          enabled: true,
        })),
    [items]
  );

  const [actions, setActions] = useState<ActionItem[]>(initialActions);
  const [saveCopy, setSaveCopy] = useState(true);

  const toggleAction = (itemId: string) => {
    setActions((prev) =>
      prev.map((a) => (a.itemId === itemId ? { ...a, enabled: !a.enabled } : a))
    );
  };

  const netBudgetChange = useMemo(() => {
    let change = 0;
    for (const action of actions) {
      if (!action.enabled) continue;
      if (action.recommendation === 'kill') change -= action.currentSpend * 0.3;
      if (action.recommendation === 'scale') change += action.currentSpend * 0.3;
    }
    return change;
  }, [actions]);

  const handleExecute = () => {
    const actionMap: Record<string, string> = {};
    for (const action of actions) {
      if (action.enabled) {
        actionMap[action.itemId] = action.recommendation;
      }
    }
    onExecute(actionMap, saveCopy);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm AI Actions" size="lg">
      <div className="space-y-5">
        {/* Actions checklist */}
        <div className="space-y-2">
          {actions.map((action) => {
            const config = actionConfig[action.recommendation];
            const Icon = config.icon;

            return (
              <div
                key={action.itemId}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors',
                  action.enabled
                    ? 'border-border bg-surface-elevated'
                    : 'border-border/50 bg-surface opacity-60'
                )}
              >
                <div className="pt-0.5">
                  <Checkbox
                    checked={action.enabled}
                    onChange={() => toggleAction(action.itemId)}
                  />
                </div>
                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-xs font-bold uppercase', config.color)}>
                      {config.label}
                    </span>
                    <span className="text-sm font-medium text-text-primary truncate">
                      {action.creativeName}
                    </span>
                  </div>
                  <p className="text-xs text-text-dimmed mt-0.5">{config.effect}</p>
                  {action.reasoning && (
                    <p className="text-xs text-text-dimmed mt-1 italic">{action.reasoning}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Net budget change */}
        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-3 border border-border">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-text-dimmed" />
            <span className="text-sm font-medium text-text-primary">Net Budget Change</span>
          </div>
          <span
            className={cn(
              'text-sm font-semibold',
              netBudgetChange > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : netBudgetChange < 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-text-secondary'
            )}
          >
            {netBudgetChange >= 0 ? '+' : ''}
            {formatCurrency(netBudgetChange, currency)}/day
          </span>
        </div>

        {/* ClickUp status updates preview */}
        <div className="rounded-lg bg-surface px-4 py-3 border border-border">
          <p className="text-xs font-medium text-text-secondary mb-1.5">ClickUp Status Updates</p>
          <div className="space-y-1">
            {actions.filter((a) => a.enabled).map((action) => (
              <p key={action.itemId} className="text-xs text-text-dimmed">
                {action.creativeName} → {action.recommendation === 'kill' ? 'Killed' : action.recommendation === 'scale' ? 'Winner — Scaling' : action.recommendation === 'graduate' ? 'Graduated' : 'Testing'}
              </p>
            ))}
          </div>
        </div>

        {/* Save copy checkbox */}
        <div className="flex items-center gap-2">
          <Checkbox checked={saveCopy} onChange={setSaveCopy} />
          <span className="text-sm text-text-secondary">Save winning copy to library</span>
        </div>

        {/* Execute / Cancel */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
          >
            Execute Actions
          </button>
        </div>
      </div>
    </Modal>
  );
}
