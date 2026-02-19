'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, DollarSign, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { TestResultCard } from '@/components/creative-testing/TestResultCard';
import type { CreativeTest, TestStatus } from '@/types/creativeSchedule';

interface ActiveTestsProps {
  tests: CreativeTest[];
}

const statusConfig: Record<TestStatus, { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }> = {
  running: { label: 'Running', variant: 'info' },
  winner_found: { label: 'Winner Found', variant: 'success' },
  no_winner: { label: 'No Winner', variant: 'warning' },
  stopped: { label: 'Stopped', variant: 'danger' },
};

export function ActiveTests({ tests }: ActiveTestsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  if (tests.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <FlaskConical className="mx-auto h-12 w-12 text-gray-300" />
        <p className="mt-4 text-sm text-gray-500">No active tests</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tests.map((test) => {
        const isExpanded = expandedIds.has(test.id);
        const status = statusConfig[test.status];
        const totalSpend = test.variants.reduce((sum, v) => sum + v.spend, 0);

        return (
          <div
            key={test.id}
            className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggleExpand(test.id)}
              className="flex w-full items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                )}
                <div className="text-left">
                  <h3 className="text-sm font-semibold text-gray-900">{test.name}</h3>
                  <p className="text-xs text-gray-500">{test.campaignName}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    {new Date(test.startDate).toLocaleDateString()} - {new Date(test.endDate).toLocaleDateString()}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>{formatCurrency(totalSpend)} spent</span>
                </div>
                <span className="text-xs text-gray-500">
                  {test.variants.length} variants
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            </button>

            {/* Expanded content */}
            {isExpanded && (
              <div className="border-t border-gray-100 px-5 py-4">
                <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
                  <span>Budget: {formatCurrency(test.dailyBudget)}/day</span>
                  <span>Metric: {test.winnerMetric.toUpperCase()}</span>
                </div>

                {/* Variant comparison */}
                <TestResultCard variants={test.variants} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
