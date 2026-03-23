'use client';

import { useState } from 'react';
import { ChevronDown, Pause, DollarSign, Copy, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { TestItemRow } from '@/components/creative-hub/TestItemRow';
import { AIRecommendationPanel } from '@/components/creative-hub/AIRecommendationPanel';
import { ConfirmActionsModal } from '@/components/creative-hub/ConfirmActionsModal';
import type { CreativeTest } from '@/types/creativeHub';

interface TestCardProps {
  test: CreativeTest;
  onExecuteActions: (testId: string, actions: Record<string, string>, saveCopy: boolean) => void;
}

function getDayProgress(launchedAt: string, duration: number): { current: number; total: number } {
  const launched = new Date(launchedAt);
  const now = new Date();
  const daysDiff = Math.max(1, Math.ceil((now.getTime() - launched.getTime()) / (1000 * 60 * 60 * 24)));
  return { current: Math.min(daysDiff, duration), total: duration };
}

const productEmojis = ['🧪', '👕', '👟', '🎧', '💄', '🧴', '🎒', '🕶️', '⌚', '📱'];

function getProductEmoji(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return productEmojis[Math.abs(hash) % productEmojis.length];
}

export function TestCard({ test, onExecuteActions }: TestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const dayProgress = getDayProgress(test.launchedAt, test.testDuration);

  const handleApplyAll = () => {
    setConfirmModalOpen(true);
  };

  const handleEditActions = () => {
    setConfirmModalOpen(true);
  };

  const handleDismiss = () => {
    // Dismiss AI recommendations (local-only UI action)
  };

  const handleExecute = (actions: Record<string, string>, saveCopy: boolean) => {
    onExecuteActions(test.id, actions, saveCopy);
  };

  return (
    <>
      <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden">
        {/* Header - clickable to toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-5 py-4 hover:bg-surface-hover/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <ChevronDown
              className={cn(
                'h-4 w-4 text-text-dimmed shrink-0 transition-transform duration-200',
                !expanded && '-rotate-90'
              )}
            />
            <span className="text-lg shrink-0">{getProductEmoji(test.productName)}</span>
            <div className="text-left min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-text-primary truncate">{test.productName}</h3>
                <span className="text-xs text-text-dimmed shrink-0">
                  {test.items.length} creative{test.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-text-dimmed truncate">{test.campaignName}</span>
                <span className="text-xs text-text-dimmed">·</span>
                <span className="text-xs text-text-dimmed flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {test.launchedBy}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0 ml-4">
            <div className="hidden sm:flex items-center gap-1.5 text-xs">
              <span className="text-text-dimmed">Day</span>
              <span className="font-semibold text-text-primary">{dayProgress.current}</span>
              <span className="text-text-dimmed">of {dayProgress.total}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 text-xs text-text-secondary">
              <DollarSign className="h-3.5 w-3.5 text-text-dimmed" />
              <span className="font-medium">{formatCurrency(test.totalSpend)}</span>
            </div>
          </div>
        </button>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-border">
            {/* Items table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50 bg-surface/50">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      Creative
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      Spend
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      ROAS
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      CPA
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      CTR
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      Purchases
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-text-dimmed">
                      AI Rec
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {test.items.map((item) => (
                    <TestItemRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI Recommendation Panel */}
            <div className="px-5 pb-4">
              <AIRecommendationPanel
                items={test.items}
                adCopy={test.adCopy}
                onApplyAll={handleApplyAll}
                onEditActions={handleEditActions}
                onDismiss={handleDismiss}
              />
            </div>

            {/* Manual actions bar */}
            <div className="flex items-center gap-2.5 border-t border-border px-5 py-3 bg-surface/30">
              <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                <Pause className="h-3.5 w-3.5" />
                Pause Selected
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                <DollarSign className="h-3.5 w-3.5" />
                Change Budget
              </button>
              <button className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                <Copy className="h-3.5 w-3.5" />
                Duplicate Winner
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm actions modal */}
      <ConfirmActionsModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        items={test.items}
        dailyBudget={test.dailyBudget}
        onExecute={handleExecute}
      />
    </>
  );
}
