'use client';

import { useAIChatStore } from '@/stores/aiChatStore';
import { AIRecommendationCard } from '@/components/ai/AIRecommendationCard';
import { ListFilter } from 'lucide-react';

export function AIRecommendationsList() {
  const { recommendations, applyRecommendation, dismissRecommendation } = useAIChatStore();

  const active = recommendations.filter((r) => !r.isApplied);
  const applied = recommendations.filter((r) => r.isApplied);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Active Recommendations ({active.length})
          </h3>
        </div>
      </div>

      {/* Active recommendations */}
      {active.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          All recommendations have been addressed. Nice work!
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((rec) => (
            <AIRecommendationCard
              key={rec.id}
              recommendation={rec}
              onApply={applyRecommendation}
              onDismiss={dismissRecommendation}
            />
          ))}
        </div>
      )}

      {/* Applied section */}
      {applied.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-gray-200">
          <h3 className="text-sm font-medium text-gray-500">
            Applied ({applied.length})
          </h3>
          {applied.map((rec) => (
            <AIRecommendationCard
              key={rec.id}
              recommendation={rec}
              onApply={applyRecommendation}
              onDismiss={dismissRecommendation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
