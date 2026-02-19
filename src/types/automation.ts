import type { MetricKey } from './metrics';
import type { EntityStatus } from './campaign';

export type RuleOperator = '>' | '<' | '>=' | '<=' | '==';

export type RuleActionType =
  | 'pause'
  | 'enable'
  | 'adjustBudgetUp'
  | 'adjustBudgetDown'
  | 'notify';

export type RuleFrequency = 'hourly' | 'every6h' | 'daily' | 'weekly';

export type RuleStatus = 'active' | 'paused';

export interface RuleCondition {
  metric: MetricKey;
  operator: RuleOperator;
  value: number;
  timeWindow: 'today' | 'last3days' | 'last7days' | 'last14days' | 'last30days';
}

export interface RuleAction {
  type: RuleActionType;
  params: {
    percentage?: number;
    amount?: number;
    notifyEmail?: string;
  };
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  status: RuleStatus;
  conditions: RuleCondition[];
  action: RuleAction;
  frequency: RuleFrequency;
  appliesTo: 'campaigns' | 'adsets' | 'ads';
  lastTriggered: string | null;
  triggerCount: number;
  createdAt: string;
}

export interface RulePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: RuleCondition[];
  action: RuleAction;
  frequency: RuleFrequency;
  appliesTo: 'campaigns' | 'adsets' | 'ads';
}

export interface RuleLogEntry {
  id: string;
  ruleId: string;
  ruleName: string;
  timestamp: string;
  conditionMatched: string;
  actionTaken: string;
  entityName: string;
  entityType: 'campaign' | 'adset' | 'ad';
}

// Day-Parting Bot
export interface HourlyBudgetRule {
  hour: number;            // 0-23
  days: string[];           // ['Mon','Tue',...,'Sun'] or ['All']
  action: 'scale_up' | 'scale_down' | 'pause' | 'normal';
  budgetMultiplier: number; // 1.0 = normal, 1.3 = +30%, 0.7 = -30%, 0 = pause
}

export interface DayPartingSchedule {
  id: string;
  name: string;
  description: string;
  status: RuleStatus;
  appliesTo: 'campaigns' | 'adsets';
  schedule: HourlyBudgetRule[];
  createdAt: string;
  lastExecuted: string | null;
  executionCount: number;
}

export interface DayPartingPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  schedule: HourlyBudgetRule[];
  appliesTo: 'campaigns' | 'adsets';
}
