'use client';

import {
  TrendingUp,
  AlertTriangle,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIInsight } from '@/types/ai';

interface AIInsightCardProps {
  insight: AIInsight;
}

const severityConfig: Record<
  AIInsight['severity'],
  { border: string; bg: string; icon: typeof Info; iconColor: string }
> = {
  positive: {
    border: 'border-l-green-500',
    bg: 'bg-green-50',
    icon: TrendingUp,
    iconColor: 'text-green-600',
  },
  warning: {
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-50',
    icon: AlertTriangle,
    iconColor: 'text-yellow-600',
  },
  critical: {
    border: 'border-l-red-500',
    bg: 'bg-red-50',
    icon: AlertOctagon,
    iconColor: 'text-red-600',
  },
  info: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-50',
    icon: Info,
    iconColor: 'text-blue-600',
  },
};

const categoryLabels: Record<AIInsight['category'], string> = {
  performance: 'Performance',
  creative: 'Creative',
  audience: 'Audience',
  budget: 'Budget',
  trend: 'Trend',
};

export function AIInsightCard({ insight }: AIInsightCardProps) {
  const config = severityConfig[insight.severity];
  const Icon = config.icon;
  const time = new Date(insight.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={cn(
        'border border-gray-200 border-l-4 rounded-lg p-4',
        config.border
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
            config.bg
          )}
        >
          <Icon className={cn('w-4 h-4', config.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-gray-900 truncate">
              {insight.title}
            </h4>
            <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
              {categoryLabels[insight.category]}
            </span>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">{insight.summary}</p>
          <p className="text-[10px] text-gray-400 mt-2">{time}</p>
        </div>
      </div>
    </div>
  );
}
