export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type RecommendationPriority = 'high' | 'medium' | 'low';
export type RecommendationType = 'scale' | 'pause' | 'test' | 'budget' | 'creative' | 'audience';

export interface AIRecommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  impact: string;
  priority: RecommendationPriority;
  confidence: number; // 0-100
  entityName: string;
  entityType: 'campaign' | 'adset' | 'ad';
  suggestedAction: string;
  metrics?: Record<string, number>;
  createdAt: string;
  isApplied: boolean;
}

export interface AIInsight {
  id: string;
  title: string;
  summary: string;
  category: 'performance' | 'creative' | 'audience' | 'budget' | 'trend';
  severity: 'positive' | 'warning' | 'critical' | 'info';
  timestamp: string;
}

export interface AIDailyAudit {
  date: string;
  totalSpend: number;
  totalRevenue: number;
  overallROAS: number;
  keyChanges: string[];
  topRecommendations: AIRecommendation[];
  insights: AIInsight[];
}
