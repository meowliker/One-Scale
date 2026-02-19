'use client';

import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import type { AuctionInsightsResult } from '@/services/metaAudit';
import type { BudgetRange } from '@/data/mockAuditData';
import {
  Monitor,
  Smartphone,
  LayoutGrid,
  DollarSign,
  BarChart3,
  Swords,
  TrendingUp as TrendingUpIcon,
  Repeat,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="bg-surface-elevated border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary-light" />
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function roasClass(roas: number) {
  return roas >= 3.0 ? 'text-success' : roas >= 1.5 ? 'text-warning' : 'text-danger';
}

function TrendArrow({ value }: { value: number }) {
  if (value >= 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-success text-xs font-medium">
        <ArrowUpRight className="h-3 w-3" />+{value.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-danger text-xs font-medium">
      <ArrowDownRight className="h-3 w-3" />{value.toFixed(1)}%
    </span>
  );
}

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

interface AuctionInsightsTabProps {
  data: AuctionInsightsResult;
  filterPreset?: string;
}

export function AuctionInsightsTab({ data, filterPreset }: AuctionInsightsTabProps) {
  const {
    deviceBreakdown,
    systemBreakdown,
    placementBreakdown,
    budgetOptComparison,
    cboBudgetRanges,
    aboBudgetRanges,
    auctionOverlap,
    cpmTrend,
    frequencyDistribution,
  } = data;
  const [budgetTab, setBudgetTab] = useState<'CBO' | 'ABO'>('CBO');
  const budgetRanges: BudgetRange[] = budgetTab === 'CBO' ? cboBudgetRanges : aboBudgetRanges;
  const totalSpend = budgetOptComparison.reduce((s, b) => s + b.totalSpend, 0);

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Device Breakdown ────────────────────────────── */}
      <SectionCard title="Device Breakdown" icon={Monitor}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {deviceBreakdown.map((d) => {
            const Icon = d.device === 'Desktop' ? Monitor : Smartphone;
            return (
              <div key={d.device} className="rounded-lg border border-border p-4 hover:border-border-light transition-colors">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-primary-light" />
                    <span className="text-sm font-semibold text-text-primary">{d.device}</span>
                    <span className="text-xs text-text-muted">({d.spendPct}%)</span>
                  </div>
                  <TrendArrow value={d.trend} />
                </div>
                <div className="w-full h-1.5 rounded-full bg-border mb-3">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light transition-all duration-700" style={{ width: `${d.spendPct}%` }} />
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Spend</p>
                    <p className="text-sm font-medium text-text-primary">{formatCurrency(d.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">ROAS</p>
                    <p className={cn('text-sm font-semibold', roasClass(d.roas))}>{formatRoas(d.roas)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">CPA</p>
                    <p className="text-sm font-medium text-text-primary">{formatCurrency(d.cpa)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Conv.</p>
                    <p className="text-sm font-medium text-text-primary">{formatNumber(d.conversions)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── System Breakdown ────────────────────────────── */}
      <SectionCard title="System Breakdown (Mobile)" icon={Smartphone}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">System</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">% Mobile</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">Trend</th>
                <th className="px-4 py-3 text-right">Impressions</th>
                <th className="px-4 py-3 text-right">Clicks</th>
                <th className="px-4 py-3 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {systemBreakdown.map((s) => (
                <tr key={s.system}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{s.system}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(s.spend)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{s.spendPct}%</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(s.roas))}>{formatRoas(s.roas)}</td>
                  <td className="px-4 py-3 text-right"><TrendArrow value={s.trend} /></td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(s.impressions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(s.clicks)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(s.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Placement Breakdown ─────────────────────────── */}
      <SectionCard title="Placement Breakdown" icon={LayoutGrid}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Placement</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-right">FB ROAS</th>
                <th className="px-4 py-3 text-right">IG ROAS</th>
                <th className="px-4 py-3 text-right">Overall ROAS</th>
                <th className="px-4 py-3 text-right">Impressions</th>
                <th className="px-4 py-3 text-right">Clicks</th>
              </tr>
            </thead>
            <tbody>
              {placementBreakdown.map((p) => (
                <tr key={p.placement}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{p.placement}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(p.spend)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{p.spendPct}%</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(p.facebookRoas))}>{formatRoas(p.facebookRoas)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(p.instagramRoas))}>{formatRoas(p.instagramRoas)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(p.overallRoas))}>{formatRoas(p.overallRoas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(p.impressions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(p.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── CPM Trend (14-day line chart) ───────────────── */}
      <SectionCard title="CPM Trend (Last 14 Days)" icon={TrendingUpIcon}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cpmTrend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232740" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `$${v.toFixed(1)}`}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={50}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                      <p className="text-xs text-text-muted mb-1">{label}</p>
                      <p className="text-sm font-medium text-text-primary">CPM: ${(payload[0].value as number).toFixed(2)}</p>
                      <p className="text-xs text-text-secondary">Impressions: {formatNumber(payload[0].payload.impressions)}</p>
                    </div>
                  );
                }}
              />
              <Line type="monotone" dataKey="cpm" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3, fill: '#f59e0b' }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* ── Auction Overlap (Competitors) ───────────────── */}
      <SectionCard title="Auction Overlap (Competitors)" icon={Swords}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Competitor</th>
                <th className="px-4 py-3 text-right">Overlap Rate</th>
                <th className="px-4 py-3 text-right">Position Above</th>
                <th className="px-4 py-3 text-right">Impression Share</th>
                <th className="px-4 py-3 text-right">Outbidding Rate</th>
              </tr>
            </thead>
            <tbody>
              {auctionOverlap.map((a) => (
                <tr key={a.competitor}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{a.competitor}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-border">
                        <div className="h-full rounded-full bg-chart-purple" style={{ width: `${a.overlapRate}%` }} />
                      </div>
                      <span className="text-sm text-text-secondary w-12 text-right">{a.overlapRate}%</span>
                    </div>
                  </td>
                  <td className={cn('px-4 py-3 text-right text-sm', a.positionAboveRate > 40 ? 'text-danger font-semibold' : 'text-text-secondary')}>
                    {a.positionAboveRate}%
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{a.impressionShare}%</td>
                  <td className={cn('px-4 py-3 text-right text-sm', a.outbiddingRate > 30 ? 'text-danger font-semibold' : 'text-text-secondary')}>
                    {a.outbiddingRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Frequency Distribution ──────────────────────── */}
      <SectionCard title="Frequency Distribution" icon={Repeat}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3 w-32">Impressions %</th>
                <th className="px-4 py-3 w-32">Spend %</th>
                <th className="px-4 py-3 text-right">Conv. Rate</th>
                <th className="px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {frequencyDistribution.map((f) => (
                <tr key={f.range}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{f.range}x</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-border">
                        <div className="h-full rounded-full bg-chart-blue" style={{ width: `${f.impressionsPct}%` }} />
                      </div>
                      <span className="text-xs text-text-muted w-10 text-right">{f.impressionsPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-border">
                        <div className="h-full rounded-full bg-chart-purple" style={{ width: `${f.spendPct}%` }} />
                      </div>
                      <span className="text-xs text-text-muted w-10 text-right">{f.spendPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(f.conversionRate)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(f.roas))}>{formatRoas(f.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Budget Optimization Comparison ──────────────── */}
      <SectionCard title="Budget Optimization Comparison" icon={DollarSign}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {budgetOptComparison.map((b) => {
            const isCbo = b.type === 'CBO';
            return (
              <div key={b.type} className={cn('rounded-lg border p-4', isCbo ? 'border-primary/30' : 'border-border')}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded', isCbo ? 'bg-primary/20 text-primary-light' : 'bg-warning/20 text-warning')}>
                    {b.type}
                  </span>
                  <span className="text-sm font-medium text-text-primary">{b.count} campaigns</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Spend</p>
                    <p className="text-sm font-medium text-text-primary">{formatCurrency(b.totalSpend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Avg ROAS</p>
                    <p className={cn('text-sm font-semibold', roasClass(b.avgRoas))}>{formatRoas(b.avgRoas)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Avg CPA</p>
                    <p className="text-sm font-medium text-text-primary">{formatCurrency(b.avgCpa)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase">Conv.</p>
                    <p className="text-sm font-medium text-text-primary">{formatNumber(b.conversions)}</p>
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full bg-border">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${(b.totalSpend / totalSpend) * 100}%`,
                      background: isCbo ? 'linear-gradient(90deg, #7c5cfc, #a78bfa)' : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                    }}
                  />
                </div>
                <p className="text-xs text-text-muted mt-1">{((b.totalSpend / totalSpend) * 100).toFixed(1)}% of total</p>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* ── Budget Range Breakdown ──────────────────────── */}
      <SectionCard title="Budget Range Breakdown" icon={BarChart3}>
        <div className="flex items-center gap-1 mb-4 border-b border-border">
          {(['CBO', 'ABO'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setBudgetTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                budgetTab === tab ? 'border-primary text-primary-light' : 'border-transparent text-text-muted hover:text-text-secondary'
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3 text-right">Count</th>
                <th className="px-4 py-3 text-right">Total Spend</th>
                <th className="px-4 py-3 text-right">Avg ROAS</th>
                <th className="px-4 py-3 text-right">Avg CPA</th>
              </tr>
            </thead>
            <tbody>
              {budgetRanges.map((r) => (
                <tr key={r.range}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.range}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{r.count}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{r.totalSpend > 0 ? formatCurrency(r.totalSpend) : '-'}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', r.avgRoas > 0 ? roasClass(r.avgRoas) : 'text-text-muted')}>
                    {r.avgRoas > 0 ? formatRoas(r.avgRoas) : '-'}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{r.avgCpa > 0 ? formatCurrency(r.avgCpa) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
