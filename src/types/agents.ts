// ─── Agent Types ────────────────────────────────────────────────────────────

export type AgentType = 'media_buyer' | 'creative_strategist';

export type AgentRunStatus = 'running' | 'completed' | 'failed';

export type AgentActionStatus =
  | 'pending'
  | 'approved'
  | 'executed'
  | 'rejected'
  | 'auto_executed';

export type AgentActionType =
  | 'pause_ad'
  | 'pause_adset'
  | 'pause_campaign'
  | 'enable_ad'
  | 'enable_adset'
  | 'scale_budget'
  | 'reduce_budget'
  | 'change_bid_strategy'
  | 'flag_creative_fatigue'
  | 'flag_learning_limited'
  | 'creative_recommendation'
  | 'audience_recommendation'
  | 'alert_high_performance'
  | 'alert_anomaly'
  | 'experiment_start'
  | 'experiment_result';

export interface AgentRun {
  id: number;
  store_id: string;
  agent_type: AgentType;
  status: AgentRunStatus;
  summary: string | null;
  decisions_count: number;
  tokens_used: number | null;
  started_at: string;
  completed_at: string | null;
}

export interface AgentAction {
  id: number;
  store_id: string;
  run_id: number | null;
  agent_type: AgentType;
  action_type: AgentActionType;
  entity_type: 'campaign' | 'adset' | 'ad' | null;
  entity_id: string | null;
  entity_name: string | null;
  old_value: string | null; // JSON string
  new_value: string | null; // JSON string
  reasoning: string;
  predicted_impact: string | null;
  actual_impact: string | null;
  confidence: number; // 0-100
  status: AgentActionStatus;
  requires_approval: boolean;
  approved_by: string | null;
  executed_at: string | null;
  created_at: string;
}

export interface AgentAccountMemory {
  id: number;
  store_id: string;
  account_id: string;
  pattern_key: string;
  pattern_value: string; // JSON string
  confidence: number; // 0-100
  evidence_count: number;
  last_tested: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentExperiment {
  id: number;
  store_id: string;
  account_id: string;
  agent_type: AgentType;
  hypothesis: string;
  test_type: string;
  control_entity_id: string | null;
  control_entity_name: string | null;
  test_entity_id: string | null;
  test_entity_name: string | null;
  metric: string;
  predicted_outcome: string | null;
  actual_outcome: string | null;
  learning: string | null;
  status: 'running' | 'completed' | 'inconclusive';
  started_at: string;
  completed_at: string | null;
}

export interface AgentKnowledgeUpdate {
  id: number;
  source: 'web_search' | 'observation' | 'manual';
  topic: string;
  content: string;
  key_learnings: string | null; // JSON string (string[])
  applies_to: string;
  created_at: string;
}

// ─── Memory Pattern Types ────────────────────────────────────────────────────

export interface MemoryPattern {
  value: string;
  context: string;
  confidence: number;
  last_updated: string;
}

export interface AccountMemoryMap {
  cbo_vs_abo?: MemoryPattern;
  best_bid_strategy_tofu?: MemoryPattern;
  best_bid_strategy_retargeting?: MemoryPattern;
  optimal_budget_increase_rate?: MemoryPattern;
  creative_lifespan_days?: MemoryPattern;
  broad_vs_interest?: MemoryPattern;
  learning_phase_min_spend?: MemoryPattern;
  best_scaling_frequency?: MemoryPattern;
  best_performing_objectives?: MemoryPattern;
  typical_cpa?: MemoryPattern;
  typical_roas?: MemoryPattern;
  audience_saturation_frequency?: MemoryPattern;
  [key: string]: MemoryPattern | undefined;
}

// ─── Alex Run Request/Response ───────────────────────────────────────────────

export interface AlexRunRequest {
  storeId: string;
  accountId?: string; // if omitted, runs on all accounts for the store
  dryRun?: boolean; // if true, Alex analyzes but doesn't queue real actions
  autoExecuteLowRisk?: boolean; // auto-execute pause/budget-reduce decisions
}

export interface AlexRunResponse {
  runId: number;
  status: AgentRunStatus;
  summary: string;
  decisionsCount: number;
  actions: AgentAction[];
  tokensUsed: number;
}

// ─── Decision Summary (for UI) ───────────────────────────────────────────────

export interface AgentDashboardStats {
  totalRuns: number;
  lastRunAt: string | null;
  pendingApprovals: number;
  actionsToday: number;
  estimatedSavings: number; // estimated $ saved by pausing losers
}
