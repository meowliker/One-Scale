export type ScheduleStatus = 'queued' | 'scheduled' | 'active' | 'completed' | 'cancelled';
export type TestStatus = 'running' | 'winner_found' | 'no_winner' | 'stopped';

export interface ScheduledCreative {
  id: string;
  name: string;
  creativeName: string;
  creativeType: 'image' | 'video' | 'carousel';
  thumbnailUrl: string;
  targetCampaignId: string;
  targetCampaignName: string;
  isNewCampaign: boolean;
  launchDate: string;
  dailyBudget: number;
  testDuration: number; // days
  status: ScheduleStatus;
  primaryText: string;
  headline: string;
  description: string;
  createdAt: string;
}

export interface CreativeTest {
  id: string;
  name: string;
  campaignName: string;
  variants: TestVariant[];
  startDate: string;
  endDate: string;
  dailyBudget: number;
  status: TestStatus;
  winnerId: string | null;
  winnerMetric: 'cpa' | 'roas' | 'ctr';
}

export interface TestVariant {
  id: string;
  name: string;
  creativeType: 'image' | 'video' | 'carousel';
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  conversions: number;
  impressions: number;
  isWinner: boolean;
}

export interface TestRule {
  id: string;
  name: string;
  isActive: boolean;
  condition: string;
  action: string;
  metric: string;
  threshold: number;
  description: string;
}
