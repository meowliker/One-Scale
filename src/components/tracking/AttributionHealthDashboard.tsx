'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Activity, Eye, Server, Smartphone, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useStoreStore } from '@/stores/storeStore';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface AttributionBreakdown {
  method: string;
  count: number;
  percentage: number;
}

interface CampaignConfidence {
  campaignId: string;
  campaignName: string;
  method: string;
  confidence: number;
}

interface AttributionStats {
  emqScore: number;
  pixelCoverage: number;
  capiCoverage: number;
  iosRecoveryRate: number;
  attributionBreakdown: AttributionBreakdown[];
  campaignConfidence: CampaignConfidence[];
}

interface SurveyResponse {
  channel: string;
  count: number;
  percentage: number;
}

interface SurveyData {
  responses: SurveyResponse[];
  totalResponses: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  fbclid_match: '#22c55e',
  utm_match: '#3b82f6',
  session_match: '#eab308',
  proportional: '#6b7280',
  survey_calibrated: '#a855f7',
  unknown: '#475569',
};

const METHOD_LABELS: Record<string, string> = {
  fbclid_match: 'Facebook Click ID',
  utm_match: 'UTM Parameters',
  session_match: 'Session Match',
  proportional: 'Proportional',
  survey_calibrated: 'Survey Calibrated',
  unknown: 'Unknown',
};

const SURVEY_BAR_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#6b7280',
];

// ── Helper Components ────────────────────────────────────────────────────────

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'green' | 'yellow' | 'red' | 'blue';
}) {
  const colorMap = {
    green: 'text-emerald-400 bg-emerald-400/10',
    yellow: 'text-amber-400 bg-amber-400/10',
    red: 'text-red-400 bg-red-400/10',
    blue: 'text-sky-400 bg-sky-400/10',
  };
  const valueColorMap = {
    green: 'text-emerald-400',
    yellow: 'text-amber-400',
    red: 'text-red-400',
    blue: 'text-sky-400',
  };

  return (
    <div className="apple-card rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          {title}
        </span>
        <div className={cn('rounded-lg p-2', colorMap[color])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn('text-3xl font-bold', valueColorMap[color])}>
        {value}
      </div>
      <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
    </div>
  );
}

function EmqGauge({ score }: { score: number }) {
  const percentage = Math.min((score / 10) * 100, 100);
  const color = score >= 7 ? '#22c55e' : score >= 5 ? '#eab308' : '#ef4444';
  const label = score >= 7 ? 'Excellent' : score >= 5 ? 'Fair' : 'Poor';

  return (
    <div className="apple-card rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
          EMQ Score
        </span>
        <div className="rounded-lg p-2 bg-surface-hover">
          <Activity className="h-4 w-4 text-text-secondary" />
        </div>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold" style={{ color }}>{score.toFixed(1)}</span>
        <span className="text-sm font-medium mb-1" style={{ color }}>{label}</span>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">Target: 7.0+ for optimal data quality</p>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const color = METHOD_COLORS[method] || METHOD_COLORS.unknown;
  const label = METHOD_LABELS[method] || method;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{
        backgroundColor: `${color}15`,
        color,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 80 ? 'text-emerald-400' : value >= 50 ? 'text-amber-400' : 'text-red-400';
  const bg = value >= 80 ? 'bg-emerald-400/10' : value >= 50 ? 'bg-amber-400/10' : 'bg-red-400/10';

  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold', color, bg)}>
      {value}%
    </span>
  );
}

// Custom tooltip for the pie chart
function PieTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percentage: number } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
      <p className="text-xs font-medium text-text-primary">{item.name}</p>
      <p className="text-xs text-text-muted">{item.value} orders ({item.payload.percentage}%)</p>
    </div>
  );
}

// Custom tooltip for bar chart
function BarTooltipContent({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { percentage: number } }> }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-lg">
      <p className="text-xs font-medium text-text-primary">{item.payload.percentage != null ? `${item.value} responses (${item.payload.percentage}%)` : `${item.value} responses`}</p>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function AttributionHealthDashboard() {
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const [stats, setStats] = useState<AttributionStats | null>(null);
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!activeStoreId) return;
    setLoading(true);
    setError(null);

    try {
      const [statsRes, surveyRes] = await Promise.all([
        fetch(`/api/tracking/attribution-stats?storeId=${encodeURIComponent(activeStoreId)}`),
        fetch(`/api/tracking/survey?storeId=${encodeURIComponent(activeStoreId)}`),
      ]);

      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        setStats(statsJson.data ?? statsJson);
      }

      if (surveyRes.ok) {
        const surveyJson = await surveyRes.json();
        setSurvey(surveyJson);
      }
    } catch (err) {
      console.error('[AttributionHealthDashboard]', err);
      setError(err instanceof Error ? err.message : 'Failed to load attribution data');
    } finally {
      setLoading(false);
    }
  }, [activeStoreId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-text-muted" />
        <span className="ml-3 text-sm text-text-muted">Loading attribution health...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchData}
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-surface px-4 py-2 text-xs font-medium text-text-primary hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  const emqScore = stats?.emqScore ?? 0;
  const pixelCoverage = stats?.pixelCoverage ?? 0;
  const capiCoverage = stats?.capiCoverage ?? 0;
  const iosRecoveryRate = stats?.iosRecoveryRate ?? 0;
  const breakdown = stats?.attributionBreakdown ?? [];
  const campaigns = stats?.campaignConfidence ?? [];
  const surveyResponses = survey?.responses ?? [];

  // Prepare pie chart data
  const pieData = breakdown.map((b) => ({
    name: METHOD_LABELS[b.method] || b.method,
    value: b.count,
    percentage: b.percentage,
    fill: METHOD_COLORS[b.method] || METHOD_COLORS.unknown,
  }));

  // Prepare bar chart data for surveys
  const barData = surveyResponses.map((s, i) => ({
    channel: s.channel,
    count: s.count,
    percentage: s.percentage,
    fill: SURVEY_BAR_COLORS[i % SURVEY_BAR_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">Last 30 days of attribution data</p>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary border border-border hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Top-level metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EmqGauge score={emqScore} />
        <MetricCard
          title="Pixel Coverage"
          value={`${pixelCoverage}%`}
          subtitle="Orders with pixel events matched"
          icon={Eye}
          color={pixelCoverage >= 80 ? 'green' : pixelCoverage >= 50 ? 'yellow' : 'red'}
        />
        <MetricCard
          title="CAPI Coverage"
          value={`${capiCoverage}%`}
          subtitle="Orders sent to CAPI successfully"
          icon={Server}
          color={capiCoverage >= 80 ? 'green' : capiCoverage >= 50 ? 'yellow' : 'red'}
        />
        <MetricCard
          title="iOS 14 Recovery"
          value={`${iosRecoveryRate}%`}
          subtitle="Conversions recovered vs browser-only"
          icon={Smartphone}
          color={iosRecoveryRate >= 30 ? 'green' : iosRecoveryRate >= 15 ? 'yellow' : 'blue'}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Attribution Breakdown Pie Chart */}
        <div className="apple-card rounded-xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">
            Attribution Breakdown
          </h3>
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="w-full sm:w-1/2" style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltipContent />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col gap-2 w-full sm:w-1/2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.fill }}
                      />
                      <span className="text-xs text-text-secondary">{item.name}</span>
                    </div>
                    <span className="text-xs font-medium text-text-primary">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-text-muted">No attribution data yet</p>
            </div>
          )}
        </div>

        {/* Survey Response Distribution */}
        <div className="apple-card rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Survey Responses
            </h3>
            {survey && (
              <span className="text-xs text-text-muted">
                {survey.totalResponses} total
              </span>
            )}
          </div>
          {barData.length > 0 ? (
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  layout="vertical"
                  margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="channel"
                    width={120}
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<BarTooltipContent />}
                    cursor={{ fill: 'var(--surface-hover)', opacity: 0.5 }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
                    {barData.map((entry, index) => (
                      <Cell key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <p className="text-xs text-text-muted">No survey responses yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Campaign Confidence Table */}
      <div className="apple-card rounded-xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text-primary mb-4">
          Per-Campaign Confidence Scores
        </h3>
        {campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Campaign
                  </th>
                  <th className="py-2 px-3 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Attribution Method
                  </th>
                  <th className="py-2 px-3 text-right text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr
                    key={c.campaignId}
                    className="border-b border-border/50 hover:bg-surface-hover transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <span className="text-sm text-text-primary">{c.campaignName}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <MethodBadge method={c.method} />
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <ConfidenceBadge value={c.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <p className="text-xs text-text-muted">No campaign data available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
