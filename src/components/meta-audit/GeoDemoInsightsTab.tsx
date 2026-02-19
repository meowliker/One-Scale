'use client';

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import type { GeoDemoInsightsResult } from '@/services/metaAudit';
import { Globe, MapPin, Users, Languages } from 'lucide-react';

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

const countryFlags: Record<string, string> = {
  US: '\u{1F1FA}\u{1F1F8}',
  GB: '\u{1F1EC}\u{1F1E7}',
  CA: '\u{1F1E8}\u{1F1E6}',
  AU: '\u{1F1E6}\u{1F1FA}',
  DE: '\u{1F1E9}\u{1F1EA}',
  FR: '\u{1F1EB}\u{1F1F7}',
  NL: '\u{1F1F3}\u{1F1F1}',
  IN: '\u{1F1EE}\u{1F1F3}',
  BR: '\u{1F1E7}\u{1F1F7}',
  JP: '\u{1F1EF}\u{1F1F5}',
};

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

interface GeoDemoInsightsTabProps {
  data: GeoDemoInsightsResult;
  filterPreset?: string;
}

export function GeoDemoInsightsTab({ data, filterPreset }: GeoDemoInsightsTabProps) {
  const { countryBreakdown, regionBreakdown, ageBreakdown, genderBreakdown, languageBreakdown } = data;
  const maxSpendPct = Math.max(...countryBreakdown.map((c) => c.spendPct));

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Country Breakdown ───────────────────────────── */}
      <SectionCard title="Country Breakdown" icon={Globe}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 w-28">Spend %</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3 text-right">Impr.</th>
                <th className="px-4 py-3 text-right">CTR</th>
                <th className="px-4 py-3 text-right">CPM</th>
              </tr>
            </thead>
            <tbody>
              {countryBreakdown.map((c, idx) => (
                <tr key={`${c.countryCode}_${c.country}_${idx}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{countryFlags[c.countryCode] || ''}</span>
                      <span className="text-sm font-medium text-text-primary">{c.country}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(c.spend)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-border">
                        <div className="h-full rounded-full bg-chart-blue transition-all duration-500" style={{ width: `${(c.spendPct / maxSpendPct) * 100}%` }} />
                      </div>
                      <span className="text-xs text-text-muted w-10 text-right">{c.spendPct}%</span>
                    </div>
                  </td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(c.roas))}>{formatRoas(c.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(c.cpa)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(c.conversions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(c.impressions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(c.ctr)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatCurrency(c.cpm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Top Regions ─────────────────────────────────── */}
      <SectionCard title="Top Regions" icon={MapPin}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {regionBreakdown.map((r, idx) => (
                <tr key={`${r.region}_${r.country}_${idx}`}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.region}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{r.country}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(r.spend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(r.roas))}>{formatRoas(r.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(r.cpa)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(r.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Age Demographics ────────────────────────────── */}
        <SectionCard title="Age Demographics" icon={Users}>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageBreakdown} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#232740" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="ageRange" type="category" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={50} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                        <p className="text-xs text-text-muted mb-1">{d.ageRange}</p>
                        <p className="text-sm font-medium text-text-primary">Spend: {formatCurrency(d.spend)}</p>
                        <p className="text-xs text-text-secondary">ROAS: {formatRoas(d.roas)} | CPA: {formatCurrency(d.cpa)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
                  {ageBreakdown.map((entry) => (
                    <Cell key={entry.ageRange} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="dark-table w-full text-left">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-xs">Age</th>
                  <th className="px-3 py-2 text-right text-xs">Spend</th>
                  <th className="px-3 py-2 text-right text-xs">ROAS</th>
                  <th className="px-3 py-2 text-right text-xs">CPA</th>
                  <th className="px-3 py-2 text-right text-xs">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {ageBreakdown.map((a) => (
                  <tr key={a.ageRange}>
                    <td className="px-3 py-2 text-sm font-medium text-text-primary">{a.ageRange}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(a.spend)}</td>
                    <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(a.roas))}>{formatRoas(a.roas)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(a.cpa)}</td>
                    <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatNumber(a.conversions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        {/* ── Gender Split ────────────────────────────────── */}
        <SectionCard title="Gender Split" icon={Users}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={genderBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="spend"
                    nameKey="gender"
                    stroke="none"
                  >
                    {genderBreakdown.map((entry) => (
                      <Cell key={entry.gender} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-xl">
                          <p className="text-xs text-text-muted mb-1">{d.gender}</p>
                          <p className="text-sm font-medium text-text-primary">{formatCurrency(d.spend)} ({d.spendPct}%)</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full">
              <table className="dark-table w-full text-left">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-xs">Gender</th>
                    <th className="px-3 py-2 text-right text-xs">Spend</th>
                    <th className="px-3 py-2 text-right text-xs">%</th>
                    <th className="px-3 py-2 text-right text-xs">ROAS</th>
                    <th className="px-3 py-2 text-right text-xs">CPA</th>
                    <th className="px-3 py-2 text-right text-xs">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {genderBreakdown.map((g) => (
                    <tr key={g.gender}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: g.color }} />
                          <span className="text-sm font-medium text-text-primary">{g.gender}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(g.spend)}</td>
                      <td className="px-3 py-2 text-right text-sm text-text-secondary">{g.spendPct}%</td>
                      <td className={cn('px-3 py-2 text-right text-sm font-semibold', roasClass(g.roas))}>{formatRoas(g.roas)}</td>
                      <td className="px-3 py-2 text-right text-sm text-text-primary">{formatCurrency(g.cpa)}</td>
                      <td className="px-3 py-2 text-right text-sm text-text-secondary">{formatNumber(g.conversions)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* ── Language Breakdown ───────────────────────────── */}
      <SectionCard title="Language Breakdown" icon={Languages}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Language</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {languageBreakdown.map((l, idx) => (
                <tr key={`${l.language}_${idx}`}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{l.language}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(l.spend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(l.roas))}>{formatRoas(l.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(l.cpa)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(l.conversions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
