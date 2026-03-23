'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Trophy,
  XCircle,
  HelpCircle,
  DollarSign,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { cn, formatCurrency, formatRoas } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import type { CreativeTest, CreativeTestItem } from '@/types/creativeHub';

interface CompletedTestCardProps {
  test: CreativeTest;
  onViewResults?: (testId: string) => void;
  onRetestInconclusive?: (testId: string, itemIds: string[]) => void;
}

export function CompletedTestCard({
  test,
  onViewResults,
  onRetestInconclusive,
}: CompletedTestCardProps) {
  const [expanded, setExpanded] = useState(false);

  const winners = test.items.filter((i) => i.testStatus === 'winner');
  const killed = test.items.filter((i) => i.testStatus === 'killed');
  const inconclusive = test.items.filter((i) => i.testStatus === 'inconclusive');

  const startDate = new Date(test.launchedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const endDate = test.completedAt
    ? new Date(test.completedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'N/A';

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          )}
          <div className="text-left min-w-0">
            <h3 className="text-sm font-semibold text-text-primary truncate">
              {test.campaignName}
            </h3>
            <p className="text-xs text-text-secondary">
              {startDate} &ndash; {endDate} &middot; {test.items.length} creatives
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary">
            <DollarSign className="h-3 w-3" />
            {formatCurrency(test.totalSpend)}
          </div>
          {winners.length > 0 ? (
            <Badge variant="success">{winners.length} Winner{winners.length > 1 ? 's' : ''}</Badge>
          ) : (
            <Badge variant="warning">No Winner</Badge>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Winners */}
          {winners.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Trophy className="h-3.5 w-3.5" />
                Winners
              </div>
              {winners.map((item) => (
                <WinnerRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Killed */}
          {killed.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                Killed
              </div>
              {killed.map((item) => (
                <KilledRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Inconclusive */}
          {inconclusive.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <HelpCircle className="h-3.5 w-3.5" />
                Inconclusive
              </div>
              {inconclusive.map((item) => (
                <InconclusiveRow key={item.id} item={item} />
              ))}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={() => onViewResults?.(test.id)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              View Full Results
            </button>
            {inconclusive.length > 0 && (
              <button
                onClick={() =>
                  onRetestInconclusive?.(
                    test.id,
                    inconclusive.map((i) => i.id)
                  )
                }
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-test Inconclusive
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WinnerRow({ item }: { item: CreativeTestItem }) {
  const actionText = item.aiRecommendation === 'scale'
    ? `Scaled to $${((item.spend / 7) * 2).toFixed(0)}/day`
    : item.aiRecommendation === 'graduate'
    ? 'Duplicated to scaling campaign'
    : null;

  return (
    <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">{item.creativeName}</p>
          {actionText && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{actionText}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
            ROAS {formatRoas(item.roas)}
          </span>
          {item.cpa != null && (
            <span className="text-xs text-text-secondary">
              CPA {formatCurrency(item.cpa)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function KilledRow({ item }: { item: CreativeTestItem }) {
  return (
    <div className="rounded-lg bg-surface px-4 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-dimmed line-through">{item.creativeName}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-dimmed">ROAS {formatRoas(item.roas)}</span>
          {item.aiReasoning && (
            <span className="text-xs text-text-dimmed italic">{item.aiReasoning}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function InconclusiveRow({ item }: { item: CreativeTestItem }) {
  return (
    <div className="rounded-lg bg-surface px-4 py-2.5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{item.creativeName}</p>
        <span className="text-xs text-text-dimmed">
          {formatCurrency(item.spend)} spent &middot; {item.impressions} imp
        </span>
      </div>
    </div>
  );
}
