'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/utils';
import { Users, Target, RefreshCw } from 'lucide-react';
import type { Campaign } from '@/types/campaign';

export interface FunnelStageBreakdownProps {
  metrics: Record<string, number>;
  topCampaigns: Campaign[];
}

interface FunnelStage {
  name: string;
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;
  percentOfTotal: number;
  color: string;
  lightColor: string;
  icon: React.ReactNode;
}

function computeStages(metrics: Record<string, number>, campaigns: Campaign[]): FunnelStage[] {
  const totalSpend = metrics.totalSpend ?? 0;
  const totalRevenue = metrics.totalRevenue ?? 0;
  const totalConversions = metrics.totalConversions ?? 0;

  // If we have campaign data, try to split by objective
  // Acquisition = CONVERSIONS, TRAFFIC campaigns
  // Engagement = ENGAGEMENT, VIDEO_VIEWS, BRAND_AWARENESS
  // Other = everything else
  if (campaigns.length > 0) {
    const acquisition = { spend: 0, revenue: 0, conversions: 0 };
    const engagement = { spend: 0, revenue: 0, conversions: 0 };
    const other = { spend: 0, revenue: 0, conversions: 0 };

    for (const c of campaigns) {
      const m = c.metrics;
      if (['CONVERSIONS', 'TRAFFIC', 'LEAD_GENERATION'].includes(c.objective)) {
        acquisition.spend += m.spend;
        acquisition.revenue += m.revenue;
        acquisition.conversions += m.conversions;
      } else if (['ENGAGEMENT', 'VIDEO_VIEWS', 'BRAND_AWARENESS', 'REACH'].includes(c.objective)) {
        engagement.spend += m.spend;
        engagement.revenue += m.revenue;
        engagement.conversions += m.conversions;
      } else {
        other.spend += m.spend;
        other.revenue += m.revenue;
        other.conversions += m.conversions;
      }
    }

    const total = acquisition.spend + engagement.spend + other.spend;
    const stages: FunnelStage[] = [];

    if (acquisition.spend > 0 || acquisition.revenue > 0) {
      stages.push({
        name: 'Acquisition',
        spend: acquisition.spend,
        revenue: acquisition.revenue,
        roas: acquisition.spend > 0 ? acquisition.revenue / acquisition.spend : 0,
        cpa: acquisition.conversions > 0 ? acquisition.spend / acquisition.conversions : 0,
        percentOfTotal: total > 0 ? Math.round((acquisition.spend / total) * 100) : 0,
        color: '#10b981',
        lightColor: 'bg-emerald-50 border-emerald-200',
        icon: <Users className="h-5 w-5 text-emerald-600" />,
      });
    }

    if (engagement.spend > 0 || engagement.revenue > 0) {
      stages.push({
        name: 'Engagement',
        spend: engagement.spend,
        revenue: engagement.revenue,
        roas: engagement.spend > 0 ? engagement.revenue / engagement.spend : 0,
        cpa: engagement.conversions > 0 ? engagement.spend / engagement.conversions : 0,
        percentOfTotal: total > 0 ? Math.round((engagement.spend / total) * 100) : 0,
        color: '#3b82f6',
        lightColor: 'bg-blue-50 border-blue-200',
        icon: <Target className="h-5 w-5 text-blue-600" />,
      });
    }

    if (other.spend > 0 || other.revenue > 0) {
      stages.push({
        name: 'Other',
        spend: other.spend,
        revenue: other.revenue,
        roas: other.spend > 0 ? other.revenue / other.spend : 0,
        cpa: other.conversions > 0 ? other.spend / other.conversions : 0,
        percentOfTotal: total > 0 ? Math.round((other.spend / total) * 100) : 0,
        color: '#f97316',
        lightColor: 'bg-orange-50 border-orange-200',
        icon: <RefreshCw className="h-5 w-5 text-orange-600" />,
      });
    }

    if (stages.length > 0) return stages;
  }

  // Fallback: show all as single "All Campaigns" stage
  return [
    {
      name: 'All Campaigns',
      spend: totalSpend,
      revenue: totalRevenue,
      roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
      cpa: totalConversions > 0 ? totalSpend / totalConversions : 0,
      percentOfTotal: 100,
      color: '#10b981',
      lightColor: 'bg-emerald-50 border-emerald-200',
      icon: <Users className="h-5 w-5 text-emerald-600" />,
    },
  ];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; payload: { color: string } }>;
}

function CustomPieTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-text-primary">{item.name}</p>
      <p className="text-text-secondary">{formatCurrency(item.value)}</p>
    </div>
  );
}

export function FunnelStageBreakdown({ metrics, topCampaigns }: FunnelStageBreakdownProps) {
  const stages = computeStages(metrics, topCampaigns);
  const totalSpend = stages.reduce((sum, s) => sum + s.spend, 0);
  const totalRevenue = stages.reduce((sum, s) => sum + s.revenue, 0);

  const pieData = stages.map((s) => ({
    name: s.name,
    value: s.spend,
    color: s.color,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-text-primary">Funnel Stage Breakdown</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          Total spend: {formatCurrency(totalSpend)} | Total revenue: {formatCurrency(totalRevenue)}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-4">
        {/* Stage Cards */}
        {stages.map((stage) => (
          <div key={stage.name} className={cn('rounded-xl border p-4', stage.lightColor)}>
            <div className="flex items-center gap-2">
              {stage.icon}
              <h4 className="text-sm font-semibold text-text-primary">{stage.name}</h4>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Spend</span>
                <span className="text-sm font-semibold text-text-primary">{formatCurrency(stage.spend)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Revenue</span>
                <span className="text-sm font-semibold text-text-primary">{formatCurrency(stage.revenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">ROAS</span>
                <span className="text-sm font-semibold text-text-primary">{stage.roas.toFixed(2)}x</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">CPA</span>
                <span className="text-sm font-semibold text-text-primary">{formatCurrency(stage.cpa)}</span>
              </div>
              <div className="pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">% of Total Spend</span>
                  <span className="text-xs font-semibold text-text-secondary">{stage.percentOfTotal}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-active">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${stage.percentOfTotal}%`, backgroundColor: stage.color }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Pie Chart */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Spend Allocation</p>
          <div className="h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={3}
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {stages.map((stage) => (
              <div key={stage.name} className="flex items-center gap-2 text-xs text-text-secondary">
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                <span>{stage.name}</span>
                <span className="font-medium">{stage.percentOfTotal}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
