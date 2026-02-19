'use client';

import {
  TrendingUp,
  Pause,
  FlaskConical,
  DollarSign,
  Palette,
  Users,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AIRecommendation } from '@/types/ai';

interface AIRecommendationCardProps {
  recommendation: AIRecommendation;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}

const typeIcons: Record<AIRecommendation['type'], typeof TrendingUp> = {
  scale: TrendingUp,
  pause: Pause,
  test: FlaskConical,
  budget: DollarSign,
  creative: Palette,
  audience: Users,
};

const typeLabels: Record<AIRecommendation['type'], string> = {
  scale: 'Scale',
  pause: 'Pause',
  test: 'Test',
  budget: 'Budget',
  creative: 'Creative',
  audience: 'Audience',
};

const priorityStyles: Record<AIRecommendation['priority'], string> = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-green-500',
};

const priorityBadge: Record<AIRecommendation['priority'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-green-100 text-green-700',
};

export function AIRecommendationCard({
  recommendation,
  onApply,
  onDismiss,
}: AIRecommendationCardProps) {
  const Icon = typeIcons[recommendation.type];

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-gray-200 border-l-4 p-4',
        priorityStyles[recommendation.priority],
        recommendation.isApplied && 'opacity-60'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Icon className="w-4 h-4 text-gray-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{recommendation.title}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded font-medium',
                  priorityBadge[recommendation.priority]
                )}
              >
                {recommendation.priority.toUpperCase()}
              </span>
              <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                {typeLabels[recommendation.type]}
              </span>
              <span className="text-[10px] text-gray-400">
                {recommendation.entityType}: {recommendation.entityName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 mb-3 leading-relaxed">{recommendation.description}</p>

      {/* Confidence bar */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] text-gray-500 font-medium">Confidence</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              recommendation.confidence >= 80
                ? 'bg-green-500'
                : recommendation.confidence >= 60
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            )}
            style={{ width: `${recommendation.confidence}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-medium">
          {recommendation.confidence}%
        </span>
      </div>

      {/* Impact */}
      <div className="bg-blue-50 rounded-md px-3 py-2 mb-3">
        <p className="text-xs text-blue-700 font-medium">{recommendation.impact}</p>
      </div>

      {/* Actions */}
      {recommendation.isApplied ? (
        <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
          <Check className="w-3.5 h-3.5" />
          Applied
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onApply(recommendation.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Apply
          </button>
          <button
            type="button"
            onClick={() => onDismiss(recommendation.id)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
