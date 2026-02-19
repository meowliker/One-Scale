export type ActionType =
  | 'budget_increase'
  | 'budget_decrease'
  | 'status_pause'
  | 'status_enable'
  | 'bid_change'
  | 'creative_update'
  | 'duplicate'
  | 'ai_optimization'
  | 'audience_change'
  | 'schedule_change';

export interface EntityAction {
  id: string;
  entityId: string;
  type: ActionType;
  description: string;
  details: string;
  timestamp: string; // ISO string
  performedBy: 'user' | 'ai' | 'rule';
  performedByName?: string; // actual name like "John Smith" or "Automated Rule: Budget Cap"
  objectName?: string; // item changed, e.g. campaign/adset/ad name from Meta
  oldValue?: string;
  newValue?: string;
}
