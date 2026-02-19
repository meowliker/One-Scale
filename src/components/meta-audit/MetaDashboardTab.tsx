'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatNumber, formatPercentage } from '@/lib/utils';
import type { AuditOverviewResult } from '@/services/metaAudit';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  BarChart3,
  MousePointerClick,
  Layers,
  Activity,
  Lightbulb,
} from 'lucide-react';

// ── Filter Badge ─────────────────────────────────────────────────────

function FilterBadge({ filterPreset }: { filterPreset?: string }) {
  if (!filterPreset || filterPreset === 'all') return null;
  const label = filterPreset === 'active' ? 'Active campaigns only' : 'Spending campaigns only';
  const color = filterPreset === 'active' ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20';
  return (
    <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium', color)}>
      <div className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
      <span className="text-text-muted font-normal ml-1">(applied in production)</span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────

interface MetaDashboardTabProps {
  data: AuditOverviewResult;
  filterPreset?: string;
}

export function MetaDashboardTab({ data, filterPreset }: MetaDashboardTabProps) {
  const { auditScore, accountOverview: ov, spendByDay, topInsights } = data;

  const metricCards = [
    { label: 'Total Spend', value: formatCurrency(ov.totalSpend), icon: DollarSign, color: 'text-chart-purple' },
    { label: 'Total Revenue', value: formatCurrency(ov.totalRevenue), icon: BarChart3, color: 'text-success' },
    { label: 'Avg ROAS', value: formatRoas(ov.avgRoas), icon: TrendingUp, color: ov.avgRoas >= 3 ? 'text-success' : 'text-warning' },
    { label: 'Avg CPA', value: formatCurrency(ov.avgCpa), icon: ShoppingCart, color: 'text-info' },
    { label: 'Conversions', value: formatNumber(ov.totalConversions), icon: MousePointerClick, color: 'text-chart-amber' },
    { label: 'Avg CTR', value: formatPercentage(ov.avgCtr), icon: Activity, color: 'text-chart-cyan' },
  ];

  const insightColors = {
    positive: { bg: 'bg-success/10', border: 'border-success/20', dot: 'bg-success', text: 'text-success' },
    negative: { bg: 'bg-danger/10', border: 'border-danger/20', dot: 'bg-danger', text: 'text-danger' },
    neutral: { bg: 'bg-info/10', border: 'border-info/20', dot: 'bg-info', text: 'text-info' },
  };

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Audit Score + Account Overview ──────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Score Ring */}
        <div className="bg-surface-elevated border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Audit Score</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle cx="50" cy="50" r="42" strokeWidth="8" fill="none" className="stroke-border" />
                <circle
                  cx="50" cy="50" r="42" strokeWidth="8" fill="none" strokeLinecap="round"
                  strokeDasharray={`${auditScore.overall * 2.64} ${264 - auditScore.overall * 2.64}`}
                  className="stroke-primary"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-text-primary">{auditScore.overall}</span>
                <span className="text-[10px] uppercase tracking-wide text-text-muted">Score</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 flex-1">
              {([
                { label: 'Structure', score: auditScore.structure },
                { label: 'Targeting', score: auditScore.targeting },
                { label: 'Creatives', score: auditScore.creatives },
                { label: 'Budget', score: auditScore.budget },
              ] as const).map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-text-muted">{item.label}</span>
                    <span className="text-text-primary font-medium">{item.score}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-border">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.score}%`,
                        background: item.score >= 80 ? '#10b981' : item.score >= 60 ? '#f59e0b' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Account Overview KPIs */}
        <div className="lg:col-span-2 bg-surface-elevated border border-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Account Overview</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
            {([
              { label: 'Campaigns', total: ov.totalCampaigns, active: ov.activeCampaigns },
              { label: 'Ad Sets', total: ov.totalAdSets, active: ov.activeAdSets },
              { label: 'Ads', total: ov.totalAds, active: ov.activeAds },
            ] as const).map((item) => (
              <div key={item.label} className="text-center col-span-1 sm:col-span-2">
                <div className="flex items-center gap-2 justify-center">
                  <Layers className="h-4 w-4 text-primary-light" />
                  <p className="text-xs text-text-muted">{item.label}</p>
                </div>
                <p className="text-xl font-bold text-text-primary mt-1">{item.total}</p>
                <p className="text-xs text-success">{item.active} active</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 6 Metric Cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="bg-surface-elevated border border-border rounded-xl p-4 hover:border-border-light transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', m.color)} />
                <p className="text-xs text-text-muted truncate">{m.label}</p>
              </div>
              <p className="text-lg font-bold text-text-primary">{m.value}</p>
            </div>
          );
        })}
      </div>

      {/* ── Spend / Revenue Sparkline (30 Days) ─────────────── */}
      <div className="bg-surface-elevated border border-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">Spend vs Revenue (Last 30 Days)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spendByDay} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <defs>
                <linearGradient id="grad-spend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c5cfc" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#7c5cfc" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-revenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#232740" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                      <p className="text-xs text-text-muted mb-1">{label}</p>
                      {payload.map((p) => (
                        <p key={p.name} className="text-sm font-medium text-text-primary">
                          {p.name}: {formatCurrency(p.value as number)}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Area type="monotone" dataKey="spend" name="Spend" stroke="#7c5cfc" fill="url(#grad-spend)" strokeWidth={2} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fill="url(#grad-revenue)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 rounded-full bg-primary" />
            <span className="text-xs text-text-muted">Spend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 rounded-full bg-success" />
            <span className="text-xs text-text-muted">Revenue</span>
          </div>
        </div>
      </div>

      {/* ── AI Insights ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="h-5 w-5 text-chart-amber" />
          <h3 className="text-lg font-semibold text-text-primary">AI Insights</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {topInsights.map((insight, idx) => {
            const c = insightColors[insight.type];
            return (
              <div
                key={idx}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  c.bg, c.border,
                  'hover:brightness-110'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn('w-2 h-2 rounded-full', c.dot)} />
                  <span className={cn('text-xs font-semibold uppercase tracking-wide', c.text)}>
                    {insight.type}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-text-primary mb-1">{insight.title}</h4>
                <p className="text-xs text-text-secondary leading-relaxed mb-3">{insight.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-muted">{insight.metric}</span>
                  <span className={cn(
                    'text-xs font-semibold flex items-center gap-0.5',
                    insight.change >= 0 ? 'text-success' : 'text-danger'
                  )}>
                    {insight.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {insight.change >= 0 ? '+' : ''}{insight.change.toFixed(1)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
