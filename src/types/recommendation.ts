import type { EntityStatus } from '@/types/campaign';

export type RecommendationSeverity = 'critical' | 'warning' | 'opportunity';

export type RecommendationCategory = 'budget' | 'creative' | 'targeting' | 'bidStrategy' | 'status' | 'dayparting';

export type RecommendationActionType =
  | 'pause_entity'
  | 'enable_entity'
  | 'increase_budget'
  | 'decrease_budget'
  | 'change_bid_strategy'
  | 'refresh_creative'
  | 'adjust_targeting'
  | 'scale_budget'
  | 'reallocate_budget'
  | 'adjust_dayparting';

export interface RecommendationAction {
  type: RecommendationActionType;
  entityType: 'campaign' | 'adset' | 'ad';
  entityId: string;
  entityName: string;
  // Action-specific payload
  payload: {
    newStatus?: EntityStatus;
    newBudget?: number;
    currentBudget?: number;
    newBidStrategy?: string;
    suggestedBid?: number;
    targetEntityId?: string;
    targetEntityName?: string;
    hours?: number[];           // For dayparting: which hours to adjust
    budgetMultiplier?: number;  // For dayparting: e.g. 1.3 = +30%
  };
}

export interface AIRecommendation {
  id: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  title: string;
  analysis: string;
  recommendedAction: string;
  impactEstimate: string;
  action: RecommendationAction;
  status: 'pending' | 'applied' | 'dismissed';
  createdAt: string;
  /** Summary of the action taken, populated after apply */
  appliedSummary?: string;
}
