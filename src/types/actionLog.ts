export type ActionActor = 'user' | 'automation' | 'ai';
export type ActionType = 'status_change' | 'budget_change' | 'bid_change' | 'creative_swap' | 'audience_change' | 'rule_triggered';

export interface ActionLogEntry {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'campaign' | 'adset' | 'ad';
  action: ActionType;
  actor: ActionActor;
  timestamp: string;
  details: string;
  previousValue?: string;
  newValue?: string;
}
