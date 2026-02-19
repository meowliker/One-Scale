'use client';

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Zap,
  Eye,
  DollarSign,
  Target,
  BarChart3,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Campaign } from '@/types/campaign';

type Severity = 'critical' | 'warning' | 'info' | 'success';

interface AuditItem {
  id: string;
  severity: Severity;
  title: string;
  description: string;
  metricDetail: string;
  recommendedAction: string;
  icon: React.ReactNode;
}

export interface AccountAuditProps {
  metrics: Record<string, number>;
  topCampaigns?: Campaign[];
}

const severityConfig: Record<Severity, { badge: string; border: string; bg: string; icon: React.ReactNode }> = {
  critical: {
    badge: 'bg-red-500/15 text-red-400 border-red-500/20',
    border: 'border-l-red-500',
    bg: 'bg-red-500/5',
    icon: <AlertCircle className="h-4 w-4 text-red-400" />,
  },
  warning: {
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    border: 'border-l-amber-500',
    bg: 'bg-amber-500/5',
    icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  },
  info: {
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    border: 'border-l-blue-500',
    bg: 'bg-blue-500/5',
    icon: <Info className="h-4 w-4 text-blue-400" />,
  },
  success: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-500/5',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  },
};

// --- Thresholds for audit rules ---
const THRESHOLDS = {
  roas: { critical: 1.0, warning: 2.0, good: 3.0 },
  ctr: { critical: 0.5, warning: 1.0, good: 2.0 },
  cpc: { warning: 3.0, critical: 5.0 },
  cpm: { warning: 20, critical: 40 },
  frequency: { warning: 2.5, critical: 4.0 },
  cvr: { critical: 0.5, warning: 1.5 },
  cpa: { warning: 50, critical: 100 },
};

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function fmtCur(n: number): string {
  return `$${n.toFixed(2)}`;
}

function generateAuditItems(
  metrics: Record<string, number>,
  campaigns: Campaign[]
): AuditItem[] {
  const items: AuditItem[] = [];

  // --- Raw metrics (extract first, needed for derived computations) ---
  const spend = metrics.totalSpend ?? metrics.spend ?? 0;
  const revenue = metrics.totalRevenue ?? metrics.revenue ?? 0;
  const impressions = metrics.totalImpressions ?? metrics.impressions ?? 0;
  const clicks = metrics.totalClicks ?? metrics.clicks ?? 0;
  const conversions = metrics.totalConversions ?? metrics.conversions ?? 0;
  const reach = metrics.totalReach ?? metrics.reach ?? Math.round(impressions * 0.6);

  // --- Derived metrics (check all key variants, then compute from raw values) ---
  const roas = metrics.blendedRoas ?? metrics.avgRoas ?? metrics.roas ?? (spend > 0 ? revenue / spend : 0);
  const ctr = metrics.avgCtr ?? metrics.blendedCtr ?? metrics.ctr ?? (impressions > 0 ? (clicks / impressions) * 100 : 0);
  const cpc = metrics.avgCpc ?? metrics.blendedCpc ?? metrics.cpc ?? (clicks > 0 ? spend / clicks : 0);
  const cpm = metrics.avgCpm ?? metrics.blendedCpm ?? metrics.cpm ?? (impressions > 0 ? (spend / impressions) * 1000 : 0);
  const cvr = metrics.avgCvr ?? metrics.blendedCvr ?? metrics.cvr ?? (clicks > 0 ? (conversions / clicks) * 100 : 0);
  const cpa = metrics.avgCpa ?? metrics.blendedCpa ?? metrics.cpa ?? (conversions > 0 ? spend / conversions : 0);
  const frequency = metrics.avgFrequency ?? metrics.blendedFrequency ?? metrics.frequency ?? (reach > 0 ? impressions / reach : 0);

  // --- ROAS Audit ---
  if (spend > 0) {
    if (roas < THRESHOLDS.roas.critical) {
      items.push({
        id: 'roas-critical',
        severity: 'critical',
        title: 'ROAS below breakeven',
        description:
          `Your blended ROAS is ${fmt(roas)}x, which means you're spending more on ads than you're making in revenue. This is unsustainable and needs immediate attention.`,
        metricDetail: `ROAS ${fmt(roas)}x | Spend ${fmtCur(spend)} | Revenue ${fmtCur(revenue)}`,
        recommendedAction:
          'Pause underperforming campaigns, review targeting and creatives, and focus budget on your highest-converting audiences.',
        icon: <TrendingDown className="h-4 w-4" />,
      });
    } else if (roas < THRESHOLDS.roas.warning) {
      items.push({
        id: 'roas-warning',
        severity: 'warning',
        title: 'ROAS below target',
        description:
          `Your blended ROAS is ${fmt(roas)}x. While you're above breakeven, there's room for improvement to reach the recommended 2x+ target.`,
        metricDetail: `ROAS ${fmt(roas)}x | Spend ${fmtCur(spend)} | Revenue ${fmtCur(revenue)}`,
        recommendedAction:
          'Optimize ad creatives, tighten targeting to higher-intent audiences, and consider testing new campaign objectives.',
        icon: <BarChart3 className="h-4 w-4" />,
      });
    } else if (roas >= THRESHOLDS.roas.good) {
      items.push({
        id: 'roas-good',
        severity: 'success',
        title: 'Strong ROAS performance',
        description:
          `Your blended ROAS is ${fmt(roas)}x which is above the ${fmt(THRESHOLDS.roas.good)}x target. Consider scaling budget to capture more volume.`,
        metricDetail: `ROAS ${fmt(roas)}x | Spend ${fmtCur(spend)} | Revenue ${fmtCur(revenue)}`,
        recommendedAction:
          'Gradually increase budget by 20-30% every 3-5 days while monitoring ROAS stability.',
        icon: <TrendingUp className="h-4 w-4" />,
      });
    }
  }

  // --- CTR Audit ---
  if (impressions > 0) {
    if (ctr < THRESHOLDS.ctr.critical) {
      items.push({
        id: 'ctr-critical',
        severity: 'critical',
        title: 'Very low click-through rate',
        description:
          `Your CTR is only ${fmt(ctr)}%, well below the ${fmt(THRESHOLDS.ctr.critical)}% minimum. Your ads are not resonating with your audience.`,
        metricDetail: `CTR ${fmt(ctr)}% | ${impressions.toLocaleString()} impressions | ${clicks.toLocaleString()} clicks`,
        recommendedAction:
          'Refresh ad creatives urgently. Test new headlines, images/videos, and ad copy. Consider narrowing your audience targeting.',
        icon: <Zap className="h-4 w-4" />,
      });
    } else if (ctr < THRESHOLDS.ctr.warning) {
      items.push({
        id: 'ctr-warning',
        severity: 'warning',
        title: 'Below-average click-through rate',
        description:
          `Your CTR is ${fmt(ctr)}%, below the industry average of ${fmt(THRESHOLDS.ctr.warning)}%. Improving engagement could reduce your CPC.`,
        metricDetail: `CTR ${fmt(ctr)}% | ${impressions.toLocaleString()} impressions | ${clicks.toLocaleString()} clicks`,
        recommendedAction:
          'A/B test different creative formats (video vs. image), try stronger hooks, and test different audience segments.',
        icon: <Eye className="h-4 w-4" />,
      });
    }
  }

  // --- CPC Audit ---
  if (clicks > 0) {
    if (cpc > THRESHOLDS.cpc.critical) {
      items.push({
        id: 'cpc-critical',
        severity: 'critical',
        title: 'Very high cost per click',
        description:
          `Your CPC is ${fmtCur(cpc)}, which is above the ${fmtCur(THRESHOLDS.cpc.critical)} threshold. You're paying a premium for traffic that may not convert.`,
        metricDetail: `CPC ${fmtCur(cpc)} | ${clicks.toLocaleString()} clicks | Spend ${fmtCur(spend)}`,
        recommendedAction:
          'Improve ad relevance score by refining targeting, testing new creatives, and ensuring landing page alignment with ad messaging.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    } else if (cpc > THRESHOLDS.cpc.warning) {
      items.push({
        id: 'cpc-warning',
        severity: 'warning',
        title: 'Elevated cost per click',
        description:
          `Your CPC of ${fmtCur(cpc)} is higher than the ${fmtCur(THRESHOLDS.cpc.warning)} benchmark. Consider optimizing for lower-cost clicks.`,
        metricDetail: `CPC ${fmtCur(cpc)} | ${clicks.toLocaleString()} clicks | Spend ${fmtCur(spend)}`,
        recommendedAction:
          'Try broader audiences to find cheaper traffic, test different ad placements, and improve ad relevance.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    }
  }

  // --- Frequency Audit ---
  if (frequency > 0) {
    if (frequency >= THRESHOLDS.frequency.critical) {
      items.push({
        id: 'frequency-critical',
        severity: 'critical',
        title: 'Ad fatigue — high frequency',
        description:
          `Users are seeing your ads ${fmt(frequency, 1)}x on average. This level of repetition causes ad fatigue and banner blindness.`,
        metricDetail: `Frequency ${fmt(frequency, 1)}x | Reach ${reach.toLocaleString()} | Impressions ${impressions.toLocaleString()}`,
        recommendedAction:
          'Immediately rotate in new creatives, expand your audience size, or set frequency caps in your campaign settings.',
        icon: <Eye className="h-4 w-4" />,
      });
    } else if (frequency >= THRESHOLDS.frequency.warning) {
      items.push({
        id: 'frequency-warning',
        severity: 'warning',
        title: 'Rising ad frequency',
        description:
          `Users are seeing your ads ${fmt(frequency, 1)}x on average. This is approaching the fatigue threshold of ${fmt(THRESHOLDS.frequency.critical, 1)}x.`,
        metricDetail: `Frequency ${fmt(frequency, 1)}x | Reach ${reach.toLocaleString()} | Impressions ${impressions.toLocaleString()}`,
        recommendedAction:
          'Plan new creative variations to rotate in soon. Consider broadening your targeting or adding exclusions to reduce overlap.',
        icon: <Eye className="h-4 w-4" />,
      });
    }
  }

  // --- Conversion Rate Audit ---
  if (clicks > 0) {
    if (cvr < THRESHOLDS.cvr.critical) {
      items.push({
        id: 'cvr-critical',
        severity: 'critical',
        title: 'Very low conversion rate',
        description:
          `Your conversion rate is ${fmt(cvr)}%, which is extremely low. You're paying for clicks that aren't converting into customers.`,
        metricDetail: `CVR ${fmt(cvr)}% | ${conversions.toLocaleString()} conversions | ${clicks.toLocaleString()} clicks`,
        recommendedAction:
          'Review your landing pages for friction points. Ensure messaging consistency between ads and landing pages. Test different offers.',
        icon: <Target className="h-4 w-4" />,
      });
    } else if (cvr < THRESHOLDS.cvr.warning) {
      items.push({
        id: 'cvr-warning',
        severity: 'warning',
        title: 'Below-average conversion rate',
        description:
          `Your conversion rate of ${fmt(cvr)}% could be improved. Higher CVR would directly improve your ROAS and CPA.`,
        metricDetail: `CVR ${fmt(cvr)}% | ${conversions.toLocaleString()} conversions | ${clicks.toLocaleString()} clicks`,
        recommendedAction:
          'Optimize landing pages for mobile, test different CTAs, and consider adding social proof or urgency elements.',
        icon: <Target className="h-4 w-4" />,
      });
    }
  }

  // --- CPA Audit ---
  if (conversions > 0) {
    if (cpa > THRESHOLDS.cpa.critical) {
      items.push({
        id: 'cpa-critical',
        severity: 'critical',
        title: 'Very high cost per acquisition',
        description:
          `Your CPA is ${fmtCur(cpa)}, which may be unsustainable depending on your average order value and margins.`,
        metricDetail: `CPA ${fmtCur(cpa)} | ${conversions.toLocaleString()} conversions | Spend ${fmtCur(spend)}`,
        recommendedAction:
          'Focus on higher-intent audiences, optimize for purchase events, and review your funnel for drop-off points.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    } else if (cpa > THRESHOLDS.cpa.warning) {
      items.push({
        id: 'cpa-warning',
        severity: 'warning',
        title: 'Elevated cost per acquisition',
        description:
          `Your CPA of ${fmtCur(cpa)} is above the ${fmtCur(THRESHOLDS.cpa.warning)} target. There's room to optimize your acquisition cost.`,
        metricDetail: `CPA ${fmtCur(cpa)} | ${conversions.toLocaleString()} conversions | Spend ${fmtCur(spend)}`,
        recommendedAction:
          'Test lookalike audiences based on your best customers, optimize ad delivery for value, and improve landing page conversion rate.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    }
  }

  // --- CPM Audit ---
  if (impressions > 0) {
    if (cpm > THRESHOLDS.cpm.critical) {
      items.push({
        id: 'cpm-critical',
        severity: 'warning',
        title: 'Very high CPM',
        description:
          `Your CPM is ${fmtCur(cpm)}, indicating expensive reach. This could be due to a small audience size or high competition.`,
        metricDetail: `CPM ${fmtCur(cpm)} | ${impressions.toLocaleString()} impressions | Spend ${fmtCur(spend)}`,
        recommendedAction:
          'Broaden your audience targeting, test different placements (Stories, Reels), and check if audience overlap is inflating costs.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    } else if (cpm > THRESHOLDS.cpm.warning) {
      items.push({
        id: 'cpm-warning',
        severity: 'info',
        title: 'Above-average CPM',
        description:
          `Your CPM of ${fmtCur(cpm)} is above the typical ${fmtCur(THRESHOLDS.cpm.warning)} range. Monitor this alongside your overall efficiency metrics.`,
        metricDetail: `CPM ${fmtCur(cpm)} | ${impressions.toLocaleString()} impressions`,
        recommendedAction:
          'Consider testing automatic placements, expanding audience size, or running during off-peak hours.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    }
  }

  // --- Campaign-Level Insights ---
  if (campaigns.length > 0) {
    // Find campaigns with zero spend (might be stalled)
    const stalledCampaigns = campaigns.filter(
      (c) => c.status === 'ACTIVE' && c.metrics.spend === 0
    );
    if (stalledCampaigns.length > 0) {
      items.push({
        id: 'stalled-campaigns',
        severity: 'warning',
        title: `${stalledCampaigns.length} active campaign${stalledCampaigns.length > 1 ? 's' : ''} with no spend`,
        description:
          `The following campaign${stalledCampaigns.length > 1 ? 's are' : ' is'} active but hasn't spent any budget: ${stalledCampaigns.map((c) => c.name).join(', ')}`,
        metricDetail: `${stalledCampaigns.length} campaign${stalledCampaigns.length > 1 ? 's' : ''} affected`,
        recommendedAction:
          'Check campaign delivery status, review audience sizes, verify budgets, and ensure billing is set up correctly.',
        icon: <AlertTriangle className="h-4 w-4" />,
      });
    }

    // Find campaigns with high spend but zero conversions
    const noConversionCampaigns = campaigns.filter(
      (c) => c.metrics.spend > 10 && c.metrics.conversions === 0
    );
    if (noConversionCampaigns.length > 0) {
      const totalWaste = noConversionCampaigns.reduce((sum, c) => sum + c.metrics.spend, 0);
      items.push({
        id: 'no-conversions',
        severity: 'critical',
        title: `${fmtCur(totalWaste)} spent with zero conversions`,
        description:
          `${noConversionCampaigns.length} campaign${noConversionCampaigns.length > 1 ? 's have' : ' has'} spent money without generating any conversions: ${noConversionCampaigns.map((c) => `${c.name} (${fmtCur(c.metrics.spend)})`).join(', ')}`,
        metricDetail: `${noConversionCampaigns.length} campaign${noConversionCampaigns.length > 1 ? 's' : ''} | Total wasted: ${fmtCur(totalWaste)}`,
        recommendedAction:
          'Review targeting and creative alignment. Consider pausing these campaigns and redistributing budget to converting campaigns.',
        icon: <DollarSign className="h-4 w-4" />,
      });
    }
  }

  // --- No Data State ---
  if (items.length === 0) {
    if (spend === 0 && impressions === 0) {
      items.push({
        id: 'no-data',
        severity: 'info',
        title: 'No ad data available yet',
        description:
          'There\'s no ad performance data for the selected date range. This could mean your campaigns haven\'t started spending yet.',
        metricDetail: 'No metrics to analyze',
        recommendedAction:
          'Ensure your campaigns are active and billing is configured. Check back once your ads have been running for at least 24 hours.',
        icon: <Info className="h-4 w-4" />,
      });
    } else {
      items.push({
        id: 'all-good',
        severity: 'success',
        title: 'All metrics within healthy ranges',
        description:
          'All your key advertising metrics are within acceptable benchmarks. Keep monitoring regularly and continue optimizing.',
        metricDetail: `ROAS ${fmt(roas)}x | CTR ${fmt(ctr)}% | CPC ${fmtCur(cpc)} | CVR ${fmt(cvr)}%`,
        recommendedAction:
          'Maintain current strategy. Consider gradual budget increases and continue A/B testing creatives for improvement.',
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    }
  }

  // Sort: critical first, then warning, then info, then success
  const severityOrder: Record<Severity, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return items;
}

export function AccountAudit({ metrics, topCampaigns = [] }: AccountAuditProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const auditItems = useMemo(
    () => generateAuditItems(metrics, topCampaigns),
    [metrics, topCampaigns]
  );

  const toggleItem = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const criticalCount = auditItems.filter((i) => i.severity === 'critical').length;
  const warningCount = auditItems.filter((i) => i.severity === 'warning').length;
  const infoCount = auditItems.filter((i) => i.severity === 'info').length;
  const successCount = auditItems.filter((i) => i.severity === 'success').length;

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary">Account Audit</h3>
          <p className="mt-0.5 text-xs text-text-muted">{auditItems.length} finding{auditItems.length !== 1 ? 's' : ''} detected</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              {criticalCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
              {warningCount} warning
            </span>
          )}
          {infoCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
              {infoCount} info
            </span>
          )}
          {successCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              {successCount} healthy
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {auditItems.map((item) => {
          const isExpanded = expandedIds.has(item.id);
          const config = severityConfig[item.severity];
          return (
            <div key={item.id} className={cn('border-l-4', config.border)}>
              <button
                onClick={() => toggleItem(item.id)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
              >
                <div className="flex-shrink-0">{config.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{item.title}</span>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        config.badge
                      )}
                    >
                      {item.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">{item.metricDetail}</p>
                </div>
                <div className="flex-shrink-0 text-text-dimmed">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {isExpanded && (
                <div className={cn('px-5 pb-4 pl-12', config.bg)}>
                  <p className="text-sm text-text-secondary">{item.description}</p>
                  <div className="mt-3 rounded-lg border border-border bg-surface-elevated p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recommended Action</p>
                    <p className="mt-1 text-sm text-text-primary">{item.recommendedAction}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
