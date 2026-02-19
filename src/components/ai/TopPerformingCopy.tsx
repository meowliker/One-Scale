'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import type { WinningCopy } from '@/data/mockAICopy';

interface TopPerformingCopyProps {
  copies: WinningCopy[];
}

export function TopPerformingCopy({ copies }: TopPerformingCopyProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Sort by ROAS descending
  const sorted = [...copies].sort((a, b) => b.roas - a.roas);

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
        <Trophy className="h-4 w-4 text-yellow-500" />
        <h3 className="text-sm font-semibold text-gray-900">Top Performing Ad Copies</h3>
      </div>

      <div className="divide-y divide-gray-100">
        {sorted.map((copy) => {
          const isExpanded = expandedId === copy.id;

          return (
            <div key={copy.id}>
              <button
                onClick={() => toggleExpand(copy.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{copy.adName}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{copy.headline}</p>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-gray-400">CTR</p>
                      <p className="text-sm font-semibold text-gray-900">{copy.ctr}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">ROAS</p>
                      <p className="text-sm font-semibold text-green-600">{copy.roas}x</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Conv.</p>
                      <p className="text-sm font-semibold text-gray-900">{copy.conversions}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-gray-50">
                  <div className="rounded-md bg-white border border-gray-200 p-3 space-y-2">
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Primary Text
                      </p>
                      <p className="text-sm text-gray-700 mt-1 leading-relaxed">
                        {copy.primaryText}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Headline
                      </p>
                      <p className="text-sm font-bold text-gray-900 mt-1">{copy.headline}</p>
                    </div>
                    <div className="flex items-center gap-4 pt-1">
                      <span className="text-xs text-gray-500">
                        Spend: <span className="font-medium text-gray-700">{formatCurrency(copy.spend)}</span>
                      </span>
                      <span className="text-xs text-gray-500">
                        Revenue: <span className="font-medium text-green-600">{formatCurrency(copy.spend * copy.roas)}</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
