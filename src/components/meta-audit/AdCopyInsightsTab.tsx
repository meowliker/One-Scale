'use client';

import { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import type { AdCopyInsightsResult } from '@/services/metaAudit';
import { Type, MousePointerClick, Smile, Trophy, AlignLeft, Brain, Sparkles, Zap, TrendingUp, Beaker, RotateCcw } from 'lucide-react';

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

const medalColors = ['#fbbf24', '#94a3b8', '#cd7f32'];

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

interface AdCopyInsightsTabProps {
  data: AdCopyInsightsResult | null;
  filterPreset?: string;
  loading?: boolean;
}

export function AdCopyInsightsTab({ data, filterPreset, loading = false }: AdCopyInsightsTabProps) {
  const [showBrief, setShowBrief] = useState(false);
  if (!data) {
    return (
      <div className="space-y-4">
        <FilterBadge filterPreset={filterPreset} />
        <div className="rounded-xl border border-border bg-surface-elevated p-8 text-center">
          <p className="text-sm text-text-secondary">
            {loading ? 'Loading Ad Copy insights...' : 'Ad Copy insights are not loaded yet.'}
          </p>
        </div>
      </div>
    );
  }

  const headlineLengthPerformance = data.headlineLengthPerformance ?? [];
  const ctaPerformance = data.ctaPerformance ?? [];
  const emojiUsage = data.emojiUsage ?? {
    withEmoji: { ads: 0, spend: 0, ctr: 0, cpa: 0, roas: 0 },
    withoutEmoji: { ads: 0, spend: 0, ctr: 0, cpa: 0, roas: 0 },
  };
  const topPerformingHeadlines = data.topPerformingHeadlines ?? [];
  const primaryTextLength = data.primaryTextLength ?? [];
  const sentimentAnalysis = data.sentimentAnalysis ?? [];
  const copyAnglePerformance = data.copyAnglePerformance ?? [];
  const headlinePatternPerformance = data.headlinePatternPerformance ?? [];
  const topPerformingPrimaryTexts = data.topPerformingPrimaryTexts ?? [];
  const copyActionBrief = data.copyActionBrief ?? {
    generatedAt: new Date().toISOString(),
    bestHeadlineExamples: [],
    bestPrimaryTextExamples: [],
    winningAngles: [],
    scaleNow: [],
    testNext: [],
    refreshNow: [],
  };

  // Transform headline length data for bar chart
  const headlineBarData = headlineLengthPerformance.map((h) => ({
    ...h,
    name: h.range.replace(/\(.*\)/, '').trim(),
  }));

  // Transform sentiment for radar chart
  const radarData = sentimentAnalysis.map((s) => ({
    sentiment: s.sentiment,
    roas: s.roas,
    ctr: s.ctr,
  }));

  const emojiCtrLift = emojiUsage.withoutEmoji.ctr > 0
    ? ((emojiUsage.withEmoji.ctr - emojiUsage.withoutEmoji.ctr) / emojiUsage.withoutEmoji.ctr) * 100
    : 0;

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Headline Length Performance ──────────────────── */}
      <SectionCard title="Headline Length Performance" icon={Type}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={headlineBarData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232740" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => formatRoas(v)} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={65} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-text-muted mb-1">{d.range}</p>
                        <p className="text-sm font-medium text-text-primary">ROAS: {formatRoas(d.roas)}</p>
                        <p className="text-xs text-text-secondary">CTR: {formatPercentage(d.ctr)} | CPA: {formatCurrency(d.cpa)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="roas" fill="#7c5cfc" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="dark-table w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs">Range</th>
                  <th className="px-3 py-2 text-right text-xs">Ads</th>
                  <th className="px-3 py-2 text-right text-xs">Spend</th>
                  <th className="px-3 py-2 text-right text-xs">CTR</th>
                  <th className="px-3 py-2 text-right text-xs">CPA</th>
                  <th className="px-3 py-2 text-right text-xs">ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {headlineLengthPerformance.map((h) => (
                  <tr key={h.range}>
                    <td className="px-3 py-2 text-sm font-medium text-text-primary">{h.range}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{h.ads}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(h.spend)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(h.ctr)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(h.cpa)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(h.roas))}>{formatRoas(h.roas)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatNumber(h.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      {/* ── CTA Button Performance ──────────────────────── */}
      <SectionCard title="CTA Button Performance" icon={MousePointerClick}>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {ctaPerformance.map((c) => (
            <div key={c.cta} className="rounded-lg border border-border p-3 text-center hover:border-border-light transition-colors">
              <div className="inline-block px-2 py-1 rounded text-xs font-bold text-white mb-2" style={{ background: c.color }}>
                {c.cta}
              </div>
              <p className="text-[10px] text-text-muted">ROAS</p>
              <p className={cn('text-lg font-bold', roasClass(c.roas))}>{formatRoas(c.roas)}</p>
              <p className="text-[10px] text-text-muted mt-1">{c.ads} ads</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs">CTA</th>
                <th className="px-3 py-2 text-right text-xs">Ads</th>
                <th className="px-3 py-2 text-right text-xs">Spend</th>
                <th className="px-3 py-2 text-right text-xs">CTR</th>
                <th className="px-3 py-2 text-right text-xs">CPA</th>
                <th className="px-3 py-2 text-right text-xs">ROAS</th>
                <th className="px-3 py-2 text-right text-xs">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {ctaPerformance.map((c) => (
                <tr key={c.cta}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-sm font-medium text-text-primary">{c.cta}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{c.ads}</td>
                  <td className="px-3 py-2 text-right text-sm font-medium text-text-primary">{formatCurrency(c.spend)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(c.ctr)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(c.cpa)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(c.roas))}>{formatRoas(c.roas)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatNumber(c.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Emoji Impact ────────────────────────────────── */}
      <SectionCard title="Emoji Impact Analysis" icon={Smile}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* With Emoji */}
          <div className="rounded-lg border border-success/20 bg-success/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">&#128640;</span>
              <h4 className="text-sm font-semibold text-text-primary">With Emoji</h4>
              <span className="text-xs text-text-muted ml-auto">{emojiUsage.withEmoji.ads} ads</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-text-muted uppercase">Spend</p>
                <p className="text-sm font-medium text-text-primary">{formatCurrency(emojiUsage.withEmoji.spend)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">ROAS</p>
                <p className={cn('text-sm font-semibold', roasClass(emojiUsage.withEmoji.roas))}>{formatRoas(emojiUsage.withEmoji.roas)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">CTR</p>
                <p className="text-sm font-medium text-text-primary">{formatPercentage(emojiUsage.withEmoji.ctr)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">CPA</p>
                <p className="text-sm font-medium text-text-primary">{formatCurrency(emojiUsage.withEmoji.cpa)}</p>
              </div>
            </div>
          </div>

          {/* Without Emoji */}
          <div className="rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">Aa</span>
              <h4 className="text-sm font-semibold text-text-primary">Without Emoji</h4>
              <span className="text-xs text-text-muted ml-auto">{emojiUsage.withoutEmoji.ads} ads</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] text-text-muted uppercase">Spend</p>
                <p className="text-sm font-medium text-text-primary">{formatCurrency(emojiUsage.withoutEmoji.spend)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">ROAS</p>
                <p className={cn('text-sm font-semibold', roasClass(emojiUsage.withoutEmoji.roas))}>{formatRoas(emojiUsage.withoutEmoji.roas)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">CTR</p>
                <p className="text-sm font-medium text-text-primary">{formatPercentage(emojiUsage.withoutEmoji.ctr)}</p>
              </div>
              <div>
                <p className="text-[10px] text-text-muted uppercase">CPA</p>
                <p className="text-sm font-medium text-text-primary">{formatCurrency(emojiUsage.withoutEmoji.cpa)}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 p-3 rounded-lg bg-info/10 border border-info/20">
          <p className="text-xs text-text-secondary">
            Ads with emoji show <span className="font-semibold text-success">+{emojiCtrLift.toFixed(1)}% higher CTR</span> and{' '}
            <span className="font-semibold text-success">{formatRoas(emojiUsage.withEmoji.roas - emojiUsage.withoutEmoji.roas)} higher ROAS</span> compared to ads without emoji.
          </p>
        </div>
      </SectionCard>

      {/* ── Top Performing Headlines ─────────────────────── */}
      <SectionCard title="Top Performing Headlines" icon={Trophy}>
        <div className="space-y-2">
          {topPerformingHeadlines.map((h, idx) => (
            <div
              key={h.adId}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:border-border-light transition-colors"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{
                  background: idx < 3 ? `${medalColors[idx]}22` : 'transparent',
                  color: idx < 3 ? medalColors[idx] : '#64748b',
                  border: idx >= 3 ? '1px solid #232740' : 'none',
                }}
              >
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary truncate">{h.headline}</p>
                <p className="text-xs text-text-muted">{formatNumber(h.impressions)} impressions</p>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <p className="text-[10px] text-text-muted">CTR</p>
                  <p className="text-sm font-medium text-text-primary">{formatPercentage(h.ctr)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted">ROAS</p>
                  <p className={cn('text-sm font-semibold', roasClass(h.roas))}>{formatRoas(h.roas)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted">CPA</p>
                  <p className="text-sm font-medium text-text-primary">{formatCurrency(h.cpa)}</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-text-muted">Spend</p>
                  <p className="text-sm font-medium text-text-primary">{formatCurrency(h.spend)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Primary Text Length ──────────────────────────── */}
      <SectionCard title="Primary Text Length Performance" icon={AlignLeft}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Range</th>
                <th className="px-4 py-3 text-right">Ads</th>
                <th className="px-4 py-3 text-right">CTR</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {primaryTextLength.map((p) => (
                <tr key={p.range}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{p.range}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{p.ads}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(p.ctr)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(p.cpa)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(p.roas))}>{formatRoas(p.roas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Sentiment / Messaging Angle Analysis ────────── */}
      <SectionCard title="Messaging Angle (Sentiment) Analysis" icon={Brain}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#232740" />
                <PolarAngleAxis dataKey="sentiment" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <PolarRadiusAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} />
                <Radar name="ROAS" dataKey="roas" stroke="#7c5cfc" fill="#7c5cfc" fillOpacity={0.2} strokeWidth={2} />
                <Radar name="CTR" dataKey="ctr" stroke="#10b981" fill="#10b981" fillOpacity={0.1} strokeWidth={2} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-text-muted mb-1">{d.sentiment}</p>
                        <p className="text-sm text-chart-purple">ROAS: {formatRoas(d.roas)}</p>
                        <p className="text-sm text-success">CTR: {formatPercentage(d.ctr)}</p>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="dark-table w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs">Sentiment</th>
                  <th className="px-3 py-2 text-right text-xs">Ads</th>
                  <th className="px-3 py-2 text-right text-xs">Spend</th>
                  <th className="px-3 py-2 text-right text-xs">CTR</th>
                  <th className="px-3 py-2 text-right text-xs">ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">CPA</th>
                </tr>
              </thead>
              <tbody>
                {sentimentAnalysis.map((s) => (
                  <tr key={s.sentiment}>
                    <td className="px-3 py-2 text-sm font-medium text-text-primary">{s.sentiment}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{s.ads}</td>
                    <td className="px-3 py-2 text-right text-sm font-medium text-text-primary">{formatCurrency(s.spend)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(s.ctr)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(s.roas))}>{formatRoas(s.roas)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(s.cpa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Copy Angle Performance" icon={Sparkles}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs">Angle</th>
                <th className="px-3 py-2 text-right text-xs">Ads</th>
                <th className="px-3 py-2 text-right text-xs">Spend</th>
                <th className="px-3 py-2 text-right text-xs">ROAS</th>
                <th className="px-3 py-2 text-right text-xs">CTR</th>
                <th className="px-3 py-2 text-right text-xs">CPA</th>
                <th className="px-3 py-2 text-right text-xs">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {copyAnglePerformance.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-text-muted text-center" colSpan={7}>
                    No angle-level data available yet.
                  </td>
                </tr>
              ) : copyAnglePerformance.map((row) => (
                <tr key={row.angle}>
                  <td className="px-3 py-2 text-sm font-medium text-text-primary">{row.angle}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{row.ads}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(row.spend)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(row.ctr)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(row.cpa)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(row.winRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Headline Pattern Intelligence" icon={Type}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-3 py-2 text-xs">Pattern</th>
                <th className="px-3 py-2 text-right text-xs">Ads</th>
                <th className="px-3 py-2 text-right text-xs">Spend</th>
                <th className="px-3 py-2 text-right text-xs">ROAS</th>
                <th className="px-3 py-2 text-right text-xs">CTR</th>
                <th className="px-3 py-2 text-right text-xs">Win Rate</th>
                <th className="px-3 py-2 text-xs">Best Example</th>
              </tr>
            </thead>
            <tbody>
              {headlinePatternPerformance.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-sm text-text-muted text-center" colSpan={7}>
                    No headline pattern data available yet.
                  </td>
                </tr>
              ) : headlinePatternPerformance.map((row) => (
                <tr key={row.pattern}>
                  <td className="px-3 py-2 text-sm font-medium text-text-primary">{row.pattern}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{row.ads}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(row.spend)}</td>
                  <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(row.ctr)}</td>
                  <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatPercentage(row.winRate)}</td>
                  <td className="px-3 py-2 text-xs text-text-muted max-w-[380px] truncate" title={row.example}>{row.example || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Top Primary Texts" icon={AlignLeft}>
        <div className="space-y-2">
          {topPerformingPrimaryTexts.length === 0 ? (
            <div className="rounded-lg border border-border px-4 py-5 text-sm text-text-muted text-center">
              No primary-text winners yet.
            </div>
          ) : topPerformingPrimaryTexts.slice(0, 10).map((row, idx) => (
            <div key={`${row.adId}_${idx}`} className="rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-text-primary line-clamp-2">{row.primaryText}</p>
                <div className="text-right shrink-0">
                  <p className={cn('text-sm font-semibold', roasClass(row.roas))}>{formatRoas(row.roas)}</p>
                  <p className="text-[11px] text-text-muted">{formatCurrency(row.spend)}</p>
                </div>
              </div>
              <div className="mt-1 text-[11px] text-text-secondary">
                {row.angle} | {row.chars} chars | CTR {formatPercentage(row.ctr)} | CPA {formatCurrency(row.cpa)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Media Buyer Copy Brief" icon={Zap}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-sm text-text-secondary">
            One-click brief: best headlines, best primary texts, winning angles, and action buckets.
          </p>
          <button
            onClick={() => setShowBrief((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary-light hover:bg-primary/20 transition-colors"
          >
            {showBrief ? 'Hide Brief' : 'Generate Brief'}
          </button>
        </div>

        {showBrief ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-3">
                <h4 className="text-xs font-semibold text-text-primary mb-2">Best Headlines</h4>
                <div className="space-y-1">
                  {copyActionBrief.bestHeadlineExamples.length === 0 ? (
                    <p className="text-xs text-text-muted">No strong headline examples yet.</p>
                  ) : copyActionBrief.bestHeadlineExamples.map((x, i) => (
                    <p key={`${i}_${x}`} className="text-xs text-text-secondary">{i + 1}. {x}</p>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border p-3">
                <h4 className="text-xs font-semibold text-text-primary mb-2">Best Primary Texts</h4>
                <div className="space-y-1">
                  {copyActionBrief.bestPrimaryTextExamples.length === 0 ? (
                    <p className="text-xs text-text-muted">No strong primary-text examples yet.</p>
                  ) : copyActionBrief.bestPrimaryTextExamples.map((x, i) => (
                    <p key={`${i}_${x.slice(0, 24)}`} className="text-xs text-text-secondary line-clamp-2">{i + 1}. {x}</p>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <h4 className="text-xs font-semibold text-text-primary mb-2">Winning Angles</h4>
              <div className="flex flex-wrap gap-2">
                {copyActionBrief.winningAngles.length === 0 ? (
                  <p className="text-xs text-text-muted">No clear winning angle yet.</p>
                ) : copyActionBrief.winningAngles.map((angle) => (
                  <span key={angle.angle} className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2 py-1 text-[11px] text-success">
                    {angle.angle} ({formatRoas(angle.roas)}, {formatPercentage(angle.winRate)} wins)
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-lg border border-success/25 bg-success/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-success" />
                  <h4 className="text-xs font-semibold text-success">Scale Now</h4>
                </div>
                <div className="space-y-2">
                  {copyActionBrief.scaleNow.length === 0 ? (
                    <p className="text-xs text-text-muted">No scale candidates yet.</p>
                  ) : copyActionBrief.scaleNow.slice(0, 8).map((item) => (
                    <div key={item.adId} className="rounded border border-success/20 bg-success/5 px-2 py-1.5">
                      <p className="text-xs text-text-primary truncate" title={item.headline}>{item.headline}</p>
                      <p className="text-[11px] text-text-secondary">{formatRoas(item.roas)} | {formatCurrency(item.spend)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-info/25 bg-info/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Beaker className="h-4 w-4 text-info" />
                  <h4 className="text-xs font-semibold text-info">Test Next</h4>
                </div>
                <div className="space-y-2">
                  {copyActionBrief.testNext.length === 0 ? (
                    <p className="text-xs text-text-muted">No test candidates yet.</p>
                  ) : copyActionBrief.testNext.slice(0, 8).map((item) => (
                    <div key={item.adId} className="rounded border border-info/20 bg-info/5 px-2 py-1.5">
                      <p className="text-xs text-text-primary truncate" title={item.headline}>{item.headline}</p>
                      <p className="text-[11px] text-text-secondary">{formatRoas(item.roas)} | {formatCurrency(item.spend)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-danger/25 bg-danger/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <RotateCcw className="h-4 w-4 text-danger" />
                  <h4 className="text-xs font-semibold text-danger">Refresh Copy</h4>
                </div>
                <div className="space-y-2">
                  {copyActionBrief.refreshNow.length === 0 ? (
                    <p className="text-xs text-text-muted">No urgent refresh needed.</p>
                  ) : copyActionBrief.refreshNow.slice(0, 8).map((item) => (
                    <div key={item.adId} className="rounded border border-danger/20 bg-danger/5 px-2 py-1.5">
                      <p className="text-xs text-text-primary truncate" title={item.headline}>{item.headline}</p>
                      <p className="text-[11px] text-text-secondary">{formatRoas(item.roas)} | {formatCurrency(item.spend)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted">Click “Generate Brief” to see best copy patterns and action buckets.</p>
        )}
      </SectionCard>
    </div>
  );
}
