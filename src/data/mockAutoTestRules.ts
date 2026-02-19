// ---------------------------------------------------------------------------
// Auto-Test Configuration Types
// ---------------------------------------------------------------------------

export interface AutoTestConfig {
  id: string;
  defaultCampaignName: string;
  defaultAudience: string;
  minBudgetPerTest: number;
  maxBudgetPerTest: number;
  maxConcurrentTests: number;
  testDurationDays: number;
  autoKillCPA: number;
  autoKillROAS: number;
  autoScaleCPA: number;
  autoScaleROAS: number;
  autoScaleBudget: number;
  launchDay: string;
  launchCount: number;
  fatigueThreshold: number;
  isEnabled: boolean;
}

export interface AutoTestStat {
  testsThisWeek: number;
  testsThisMonth: number;
  winnersFound: number;
  budgetSaved: number;
  roasImprovement: number;
  creativesKilled: number;
  creativesScaled: number;
}

export interface AutoTestLogEntry {
  id: string;
  timestamp: string;
  action: 'launched' | 'killed' | 'scaled' | 'replaced' | 'paused';
  creativeName: string;
  campaignName: string;
  reason: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

// ---------------------------------------------------------------------------
// Mock Auto-Test Configuration
// ---------------------------------------------------------------------------

export const mockAutoTestConfig: AutoTestConfig = {
  id: 'auto-test-config-001',
  defaultCampaignName: 'Creative Test Campaign',
  defaultAudience: 'Broad - Skincare Enthusiasts 25-54',
  minBudgetPerTest: 20,
  maxBudgetPerTest: 50,
  maxConcurrentTests: 6,
  testDurationDays: 3,
  autoKillCPA: 25,
  autoKillROAS: 1.5,
  autoScaleCPA: 15,
  autoScaleROAS: 3.0,
  autoScaleBudget: 100,
  launchDay: 'Monday',
  launchCount: 3,
  fatigueThreshold: 70,
  isEnabled: true,
};

// ---------------------------------------------------------------------------
// Mock Auto-Test Stats
// ---------------------------------------------------------------------------

export const mockAutoTestStats: AutoTestStat = {
  testsThisWeek: 12,
  testsThisMonth: 38,
  winnersFound: 8,
  budgetSaved: 2340,
  roasImprovement: 23,
  creativesKilled: 15,
  creativesScaled: 8,
};

// ---------------------------------------------------------------------------
// Mock Auto-Test Activity Log
// ---------------------------------------------------------------------------

export const mockAutoTestLog: AutoTestLogEntry[] = [
  {
    id: 'atlog-001',
    timestamp: '2025-02-11T09:00:00Z',
    action: 'launched',
    creativeName: 'UGC Testimonial - Vitamin C v3',
    campaignName: 'Creative Test Campaign',
    reason: 'Scheduled Monday launch (3 of 3)',
    metric: undefined,
    value: undefined,
    threshold: undefined,
  },
  {
    id: 'atlog-002',
    timestamp: '2025-02-11T09:00:00Z',
    action: 'launched',
    creativeName: 'Carousel - Skincare Routine 5-Step',
    campaignName: 'Creative Test Campaign',
    reason: 'Scheduled Monday launch (2 of 3)',
  },
  {
    id: 'atlog-003',
    timestamp: '2025-02-11T09:00:00Z',
    action: 'launched',
    creativeName: 'Static - Before/After Retinol',
    campaignName: 'Creative Test Campaign',
    reason: 'Scheduled Monday launch (1 of 3)',
  },
  {
    id: 'atlog-004',
    timestamp: '2025-02-10T14:30:00Z',
    action: 'killed',
    creativeName: 'Video - Moisturizer Demo v2',
    campaignName: 'Creative Test Campaign',
    reason: 'CPA exceeded kill threshold after 3-day test',
    metric: 'CPA',
    value: 31.42,
    threshold: 25,
  },
  {
    id: 'atlog-005',
    timestamp: '2025-02-10T14:30:00Z',
    action: 'scaled',
    creativeName: 'UGC Review - Eye Cream Results',
    campaignName: 'Scaling - Winners',
    reason: 'ROAS exceeded scale threshold after 3-day test',
    metric: 'ROAS',
    value: 4.12,
    threshold: 3.0,
  },
  {
    id: 'atlog-006',
    timestamp: '2025-02-09T11:15:00Z',
    action: 'replaced',
    creativeName: 'Static - Summer Glow Collection',
    campaignName: 'Creative Test Campaign',
    reason: 'Fatigue score exceeded threshold, replaced from queue',
    metric: 'Fatigue',
    value: 78,
    threshold: 70,
  },
  {
    id: 'atlog-007',
    timestamp: '2025-02-08T14:30:00Z',
    action: 'killed',
    creativeName: 'Carousel - Anti-Aging Bundle',
    campaignName: 'Creative Test Campaign',
    reason: 'ROAS below kill threshold after 3-day test',
    metric: 'ROAS',
    value: 1.1,
    threshold: 1.5,
  },
  {
    id: 'atlog-008',
    timestamp: '2025-02-07T14:30:00Z',
    action: 'scaled',
    creativeName: 'Video - 60s SPF Tutorial',
    campaignName: 'Scaling - Winners',
    reason: 'CPA below scale threshold after 3-day test',
    metric: 'CPA',
    value: 12.30,
    threshold: 15,
  },
  {
    id: 'atlog-009',
    timestamp: '2025-02-06T09:00:00Z',
    action: 'paused',
    creativeName: 'UGC Unboxing - Starter Kit',
    campaignName: 'Creative Test Campaign',
    reason: 'Max concurrent test limit reached, pausing oldest test',
  },
  {
    id: 'atlog-010',
    timestamp: '2025-02-04T09:00:00Z',
    action: 'launched',
    creativeName: 'Static - New Year Sale Banner',
    campaignName: 'Creative Test Campaign',
    reason: 'Scheduled Monday launch (3 of 3)',
  },
  {
    id: 'atlog-011',
    timestamp: '2025-02-03T14:30:00Z',
    action: 'killed',
    creativeName: 'Video - Pore Minimizer Demo',
    campaignName: 'Creative Test Campaign',
    reason: 'CPA exceeded kill threshold after 3-day test',
    metric: 'CPA',
    value: 28.90,
    threshold: 25,
  },
  {
    id: 'atlog-012',
    timestamp: '2025-02-01T11:00:00Z',
    action: 'replaced',
    creativeName: 'Carousel - Winter Hydration Pack',
    campaignName: 'Creative Test Campaign',
    reason: 'Fatigue score exceeded threshold, replaced from queue',
    metric: 'Fatigue',
    value: 82,
    threshold: 70,
  },
];
