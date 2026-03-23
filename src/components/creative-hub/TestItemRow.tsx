'use client';

import { cn } from '@/lib/utils';
import { formatCurrency, formatPercentage, formatRoas } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { ReviewStatusBadge } from '@/components/creative-hub/ReviewStatusBadge';
import type { CreativeTestItem, AIRecommendation } from '@/types/creativeHub';

interface TestItemRowProps {
  item: CreativeTestItem;
  currency?: string;
}

const aiRecConfig: Record<AIRecommendation, { label: string; variant: 'danger' | 'success' | 'warning' | 'info' }> = {
  kill: { label: 'Kill', variant: 'danger' },
  scale: { label: 'Scale', variant: 'success' },
  wait: { label: 'Wait', variant: 'warning' },
  graduate: { label: 'Graduate', variant: 'info' },
};

function getRoasColor(roas: number): string {
  if (roas >= 2) return 'text-emerald-600 dark:text-emerald-400';
  if (roas >= 1) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function getStatusDotColor(item: CreativeTestItem): string {
  if (item.purchases === 0) return 'bg-red-500';
  if (item.roas >= 2) return 'bg-emerald-500';
  if (item.roas >= 1) return 'bg-amber-500';
  return 'bg-red-500';
}

export function TestItemRow({ item, currency }: TestItemRowProps) {
  return (
    <tr className="group border-b border-border/50 last:border-b-0 hover:bg-surface-hover/50 transition-colors">
      {/* Creative name + status dot */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={cn('h-2 w-2 rounded-full shrink-0', getStatusDotColor(item))} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary truncate">{item.creativeName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {item.reviewStatus && (
                <ReviewStatusBadge status={item.reviewStatus} reason={item.reviewFeedback} />
              )}
              {item.learningPhase && item.learningPhase !== 'ACTIVE' && (
                <Badge variant="info" size="sm">
                  {item.learningPhase === 'LEARNING' ? 'Learning' : 'Learning Limited'}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Spend */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-text-secondary">{formatCurrency(item.spend, currency)}</span>
      </td>

      {/* ROAS */}
      <td className="px-4 py-3 text-right">
        <span className={cn('text-sm font-semibold', getRoasColor(item.roas))}>
          {formatRoas(item.roas)}
        </span>
      </td>

      {/* CPA */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-text-secondary">
          {item.cpa != null ? formatCurrency(item.cpa, currency) : '—'}
        </span>
      </td>

      {/* CTR */}
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-text-secondary">
          {item.ctr != null ? formatPercentage(item.ctr) : '—'}
        </span>
      </td>

      {/* Purchases */}
      <td className="px-4 py-3 text-right">
        <span className={cn('text-sm font-medium', item.purchases === 0 ? 'text-red-500' : 'text-text-primary')}>
          {item.purchases}
        </span>
      </td>

      {/* AI Recommendation */}
      <td className="px-4 py-3 text-right">
        {item.aiRecommendation ? (
          <Badge variant={aiRecConfig[item.aiRecommendation].variant} size="sm">
            {aiRecConfig[item.aiRecommendation].label}
          </Badge>
        ) : (
          <span className="text-xs text-text-dimmed">—</span>
        )}
      </td>
    </tr>
  );
}
