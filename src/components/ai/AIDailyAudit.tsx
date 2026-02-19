'use client';

import { useEffect, useState } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas } from '@/lib/utils';
import { getDailyAudit } from '@/services/ai';
import { AIRecommendationCard } from '@/components/ai/AIRecommendationCard';
import { AIInsightCard } from '@/components/ai/AIInsightCard';
import { useAIChatStore } from '@/stores/aiChatStore';
import type { AIDailyAudit as AIDailyAuditType } from '@/types/ai';

export function AIDailyAudit() {
  const [audit, setAudit] = useState<AIDailyAuditType | null>(null);
  const { applyRecommendation, dismissRecommendation } = useAIChatStore();

  useEffect(() => {
    getDailyAudit().then(setAudit);
  }, []);

  if (!audit) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        Loading daily audit...
      </div>
    );
  }

  const stats = [
    {
      label: 'Total Spend',
      value: formatCurrency(audit.totalSpend),
      icon: DollarSign,
      color: 'bg-red-50 text-red-600',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(audit.totalRevenue),
      icon: ShoppingCart,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Overall ROAS',
      value: formatRoas(audit.overallROAS),
      icon: TrendingUp,
      color: 'bg-blue-50 text-blue-600',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Date header */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Morning Briefing</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Performance summary for {new Date(audit.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2 mb-1">
                <div className={cn('w-6 h-6 rounded flex items-center justify-center', stat.color)}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <span className="text-[10px] text-gray-500 font-medium">{stat.label}</span>
              </div>
              <p className="text-lg font-bold text-gray-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Key changes */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Changes</h4>
        <ul className="space-y-2">
          {audit.keyChanges.map((change, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <ArrowUpRight className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
              <span>{change}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Top recommendations */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">
          Top 3 Recommendations
        </h4>
        <div className="space-y-3">
          {audit.topRecommendations.map((rec) => (
            <AIRecommendationCard
              key={rec.id}
              recommendation={rec}
              onApply={applyRecommendation}
              onDismiss={dismissRecommendation}
            />
          ))}
        </div>
      </div>

      {/* Insights */}
      {audit.insights.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Insights</h4>
          <div className="space-y-3">
            {audit.insights.map((insight) => (
              <AIInsightCard key={insight.id} insight={insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
