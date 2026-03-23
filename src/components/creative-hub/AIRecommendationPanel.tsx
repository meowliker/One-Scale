'use client';

import { useState } from 'react';
import { XCircle, TrendingUp, Clock, Award, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRoas } from '@/lib/utils';
import type { CreativeTestItem, AIRecommendation, TestAdCopy } from '@/types/creativeHub';

interface AIRecommendationPanelProps {
  items: CreativeTestItem[];
  adCopy?: TestAdCopy[];
  lastEvaluatedAt?: string;
  onApplyAll: () => void;
  onEditActions: () => void;
  onDismiss: () => void;
}

const recConfig: Record<AIRecommendation, { icon: typeof XCircle; borderColor: string; iconColor: string; label: string }> = {
  kill: { icon: XCircle, borderColor: 'border-l-red-500', iconColor: 'text-red-500', label: 'Kill' },
  scale: { icon: TrendingUp, borderColor: 'border-l-emerald-500', iconColor: 'text-emerald-500', label: 'Scale' },
  wait: { icon: Clock, borderColor: 'border-l-amber-500', iconColor: 'text-amber-500', label: 'Wait' },
  graduate: { icon: Award, borderColor: 'border-l-blue-500', iconColor: 'text-blue-500', label: 'Graduate' },
};

function getBestCopyBreakdown(items: CreativeTestItem[], adCopy?: TestAdCopy[]) {
  if (!adCopy || adCopy.length === 0) return null;

  const primaryTexts = adCopy.filter((c) => c.copyType === 'primary_text');
  const headlines = adCopy.filter((c) => c.copyType === 'headline');

  if (primaryTexts.length <= 1 && headlines.length <= 1) return null;

  // Find best performing item by ROAS for PT/HL breakdown
  const sortedByRoas = [...items].sort((a, b) => b.roas - a.roas);
  const bestItem = sortedByRoas[0];
  if (!bestItem) return null;

  const bestPT = primaryTexts[0];
  const bestHL = headlines[0];

  return {
    bestPT: bestPT?.copyText,
    bestHL: bestHL?.copyText,
    bestComboRoas: bestItem.roas,
    totalImpressions: items.reduce((sum, i) => sum + i.impressions, 0),
  };
}

export function AIRecommendationPanel({
  items,
  adCopy,
  lastEvaluatedAt,
  onApplyAll,
  onEditActions,
  onDismiss,
}: AIRecommendationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const itemsWithRec = items.filter((i) => i.aiRecommendation);

  if (itemsWithRec.length === 0) return null;

  const copyBreakdown = getBestCopyBreakdown(items, adCopy);

  return (
    <div className="mt-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-100 dark:border-blue-900/40 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
          <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200">AI Recommendation</h4>
          {lastEvaluatedAt && (
            <span className="text-[10px] text-blue-500 dark:text-blue-400">
              Evaluated {new Date(lastEvaluatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {expanded && (
        <>
          {/* Recommendation list */}
          <div className="space-y-2.5 mb-4">
            {itemsWithRec.map((item) => {
              const rec = item.aiRecommendation!;
              const config = recConfig[rec];
              const Icon = config.icon;

              return (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border-l-4 bg-white/60 dark:bg-white/5 px-4 py-3',
                    config.borderColor
                  )}
                >
                  <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', config.iconColor)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-text-primary">{config.label}</span>
                      <span className="text-sm text-text-secondary truncate">{item.creativeName}</span>
                    </div>
                    {item.aiReasoning && (
                      <p className="text-xs text-text-dimmed mt-0.5 leading-relaxed">{item.aiReasoning}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Copy Performance Breakdown */}
          {copyBreakdown && (
            <div className="mb-4 rounded-lg bg-white/40 dark:bg-white/5 border border-blue-100 dark:border-blue-900/30 px-4 py-3">
              <h5 className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-2">Copy Performance Breakdown</h5>
              <div className="space-y-1.5 text-xs text-text-secondary">
                {copyBreakdown.bestPT && (
                  <p>
                    <span className="font-medium text-text-primary">Best PT:</span>{' '}
                    <span className="truncate">{copyBreakdown.bestPT.slice(0, 80)}{copyBreakdown.bestPT.length > 80 ? '...' : ''}</span>
                  </p>
                )}
                {copyBreakdown.bestHL && (
                  <p>
                    <span className="font-medium text-text-primary">Best HL:</span>{' '}
                    {copyBreakdown.bestHL}
                  </p>
                )}
                <p>
                  <span className="font-medium text-text-primary">Best Combo:</span>{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    ROAS {formatRoas(copyBreakdown.bestComboRoas)}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={onApplyAll}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              Apply All Actions
            </button>
            <button
              onClick={onEditActions}
              className="rounded-lg border border-blue-200 dark:border-blue-800 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              Edit Actions
            </button>
            <button
              onClick={onDismiss}
              className="rounded-lg px-4 py-2 text-xs font-medium text-text-dimmed hover:text-text-secondary transition-colors"
            >
              Dismiss
            </button>
          </div>
        </>
      )}
    </div>
  );
}
