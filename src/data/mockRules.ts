import type {
  AutomationRule,
  RulePreset,
  RuleLogEntry,
} from '@/types/automation';

// ---------------------------------------------------------------------------
// Automation Rules
// ---------------------------------------------------------------------------

export const mockRules: AutomationRule[] = [
  {
    id: 'rule-001',
    name: 'Stop Loss - High CPA',
    description: 'Pause ad sets when CPA exceeds $30 over the last 3 days to prevent overspend.',
    status: 'active',
    conditions: [
      {
        metric: 'cpa',
        operator: '>',
        value: 30,
        timeWindow: 'last3days',
      },
    ],
    action: {
      type: 'pause',
      params: {},
    },
    frequency: 'every6h',
    appliesTo: 'adsets',
    lastTriggered: '2025-02-10T14:22:00Z',
    triggerCount: 7,
    createdAt: '2025-01-05T10:00:00Z',
  },
  {
    id: 'rule-002',
    name: 'Scale Winners - High ROAS',
    description: 'Increase budget by 20% for campaigns with ROAS above 3.0 over the last 7 days.',
    status: 'active',
    conditions: [
      {
        metric: 'roas',
        operator: '>',
        value: 3.0,
        timeWindow: 'last7days',
      },
    ],
    action: {
      type: 'adjustBudgetUp',
      params: { percentage: 20 },
    },
    frequency: 'daily',
    appliesTo: 'campaigns',
    lastTriggered: '2025-02-11T08:00:00Z',
    triggerCount: 12,
    createdAt: '2025-01-03T09:30:00Z',
  },
  {
    id: 'rule-003',
    name: 'Low CTR Alert',
    description: 'Send notification when CTR drops below 1.0% over the last 7 days.',
    status: 'active',
    conditions: [
      {
        metric: 'ctr',
        operator: '<',
        value: 1.0,
        timeWindow: 'last7days',
      },
    ],
    action: {
      type: 'notify',
      params: { notifyEmail: 'team@towardscalm.com' },
    },
    frequency: 'daily',
    appliesTo: 'ads',
    lastTriggered: '2025-02-09T08:00:00Z',
    triggerCount: 3,
    createdAt: '2025-01-10T11:00:00Z',
  },
  {
    id: 'rule-004',
    name: 'Budget Guard - Overspend',
    description: 'Reduce budget by 15% when daily spend exceeds $1,100 today.',
    status: 'active',
    conditions: [
      {
        metric: 'spend',
        operator: '>',
        value: 1100,
        timeWindow: 'today',
      },
    ],
    action: {
      type: 'adjustBudgetDown',
      params: { percentage: 15 },
    },
    frequency: 'hourly',
    appliesTo: 'campaigns',
    lastTriggered: '2025-02-11T16:45:00Z',
    triggerCount: 5,
    createdAt: '2025-01-08T13:00:00Z',
  },
  {
    id: 'rule-005',
    name: 'Revive Underperformers',
    description: 'Re-enable paused ad sets that previously had a ROAS above 2.0 over the last 14 days.',
    status: 'paused',
    conditions: [
      {
        metric: 'roas',
        operator: '>=',
        value: 2.0,
        timeWindow: 'last14days',
      },
    ],
    action: {
      type: 'enable',
      params: {},
    },
    frequency: 'weekly',
    appliesTo: 'adsets',
    lastTriggered: null,
    triggerCount: 0,
    createdAt: '2025-01-15T09:00:00Z',
  },
  {
    id: 'rule-006',
    name: 'Conversion Drop Pause',
    description: 'Pause campaigns with fewer than 5 conversions over the last 7 days.',
    status: 'active',
    conditions: [
      {
        metric: 'conversions',
        operator: '<',
        value: 5,
        timeWindow: 'last7days',
      },
    ],
    action: {
      type: 'pause',
      params: {},
    },
    frequency: 'daily',
    appliesTo: 'campaigns',
    lastTriggered: '2025-02-10T08:00:00Z',
    triggerCount: 2,
    createdAt: '2025-01-20T14:30:00Z',
  },
];

// ---------------------------------------------------------------------------
// Rule Presets
// ---------------------------------------------------------------------------

export const mockRulePresets: RulePreset[] = [
  {
    id: 'preset-stop-loss',
    name: 'Stop Loss',
    description: 'Automatically pause underperforming ad sets when CPA is too high.',
    icon: 'ShieldAlert',
    conditions: [
      {
        metric: 'cpa',
        operator: '>',
        value: 30,
        timeWindow: 'last3days',
      },
    ],
    action: {
      type: 'pause',
      params: {},
    },
    frequency: 'every6h',
    appliesTo: 'adsets',
  },
  {
    id: 'preset-scale-winners',
    name: 'Scale Winners',
    description: 'Increase budget for high-performing campaigns with strong ROAS.',
    icon: 'TrendingUp',
    conditions: [
      {
        metric: 'roas',
        operator: '>',
        value: 3.0,
        timeWindow: 'last7days',
      },
    ],
    action: {
      type: 'adjustBudgetUp',
      params: { percentage: 20 },
    },
    frequency: 'daily',
    appliesTo: 'campaigns',
  },
  {
    id: 'preset-revive',
    name: 'Revive',
    description: 'Re-enable previously paused ad sets that show recovery potential.',
    icon: 'RefreshCw',
    conditions: [
      {
        metric: 'roas',
        operator: '>=',
        value: 2.0,
        timeWindow: 'last14days',
      },
    ],
    action: {
      type: 'enable',
      params: {},
    },
    frequency: 'weekly',
    appliesTo: 'adsets',
  },
  {
    id: 'preset-budget-guard',
    name: 'Budget Guard',
    description: 'Prevent overspending by reducing budget when daily spend is too high.',
    icon: 'ShieldCheck',
    conditions: [
      {
        metric: 'spend',
        operator: '>',
        value: 1100,
        timeWindow: 'today',
      },
    ],
    action: {
      type: 'adjustBudgetDown',
      params: { percentage: 15 },
    },
    frequency: 'hourly',
    appliesTo: 'campaigns',
  },
];

// ---------------------------------------------------------------------------
// Rule Log Entries
// ---------------------------------------------------------------------------

export const mockRuleLog: RuleLogEntry[] = [
  {
    id: 'log-001',
    ruleId: 'rule-001',
    ruleName: 'Stop Loss - High CPA',
    timestamp: '2025-02-11T14:22:00Z',
    conditionMatched: 'CPA > $30 (was $37.42) over last 3 days',
    actionTaken: 'Paused ad set',
    entityName: 'Retinol Serum - Broad Interest',
    entityType: 'adset',
  },
  {
    id: 'log-002',
    ruleId: 'rule-002',
    ruleName: 'Scale Winners - High ROAS',
    timestamp: '2025-02-11T08:00:00Z',
    conditionMatched: 'ROAS > 3.0 (was 4.21) over last 7 days',
    actionTaken: 'Increased budget by 20%',
    entityName: 'Spring Sale - Skincare Bundle',
    entityType: 'campaign',
  },
  {
    id: 'log-003',
    ruleId: 'rule-004',
    ruleName: 'Budget Guard - Overspend',
    timestamp: '2025-02-11T16:45:00Z',
    conditionMatched: 'Spend > $1,100 (was $1,187) today',
    actionTaken: 'Reduced budget by 15%',
    entityName: 'Evergreen - Moisturizer Collection',
    entityType: 'campaign',
  },
  {
    id: 'log-004',
    ruleId: 'rule-002',
    ruleName: 'Scale Winners - High ROAS',
    timestamp: '2025-02-10T08:00:00Z',
    conditionMatched: 'ROAS > 3.0 (was 3.85) over last 7 days',
    actionTaken: 'Increased budget by 20%',
    entityName: 'UGC Video - Vitamin C Serum',
    entityType: 'campaign',
  },
  {
    id: 'log-005',
    ruleId: 'rule-001',
    ruleName: 'Stop Loss - High CPA',
    timestamp: '2025-02-10T14:22:00Z',
    conditionMatched: 'CPA > $30 (was $42.18) over last 3 days',
    actionTaken: 'Paused ad set',
    entityName: 'Eye Cream - Lookalike 1%',
    entityType: 'adset',
  },
  {
    id: 'log-006',
    ruleId: 'rule-006',
    ruleName: 'Conversion Drop Pause',
    timestamp: '2025-02-10T08:00:00Z',
    conditionMatched: 'Conversions < 5 (was 2) over last 7 days',
    actionTaken: 'Paused campaign',
    entityName: 'Test - New Cleanser Creative',
    entityType: 'campaign',
  },
  {
    id: 'log-007',
    ruleId: 'rule-003',
    ruleName: 'Low CTR Alert',
    timestamp: '2025-02-09T08:00:00Z',
    conditionMatched: 'CTR < 1.0% (was 0.72%) over last 7 days',
    actionTaken: 'Notification sent to team@towardscalm.com',
    entityName: 'Static Image - SPF Sunscreen',
    entityType: 'ad',
  },
  {
    id: 'log-008',
    ruleId: 'rule-002',
    ruleName: 'Scale Winners - High ROAS',
    timestamp: '2025-02-09T08:00:00Z',
    conditionMatched: 'ROAS > 3.0 (was 3.64) over last 7 days',
    actionTaken: 'Increased budget by 20%',
    entityName: 'Spring Sale - Skincare Bundle',
    entityType: 'campaign',
  },
  {
    id: 'log-009',
    ruleId: 'rule-004',
    ruleName: 'Budget Guard - Overspend',
    timestamp: '2025-02-08T17:30:00Z',
    conditionMatched: 'Spend > $1,100 (was $1,245) today',
    actionTaken: 'Reduced budget by 15%',
    entityName: 'Retargeting - Cart Abandoners',
    entityType: 'campaign',
  },
  {
    id: 'log-010',
    ruleId: 'rule-001',
    ruleName: 'Stop Loss - High CPA',
    timestamp: '2025-02-08T14:22:00Z',
    conditionMatched: 'CPA > $30 (was $34.90) over last 3 days',
    actionTaken: 'Paused ad set',
    entityName: 'Pore Refiner - Cold Audience',
    entityType: 'adset',
  },
];
