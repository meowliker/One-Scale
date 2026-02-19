'use client';

import { cn } from '@/lib/utils';
import { formatCurrency, formatRoas, formatPercentage, formatNumber } from '@/lib/utils';
import type { TargetingInsightsResult } from '@/services/metaAudit';
import { Users, Target, Copy, Grid3x3 } from 'lucide-react';

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

function ProgressBar({ value, max, color }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-border">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color || '#7c5cfc' }} />
    </div>
  );
}

function roasClass(roas: number) {
  return roas >= 3.0 ? 'text-success' : roas >= 1.5 ? 'text-warning' : 'text-danger';
}

function cpaClass(cpa: number, avg: number) {
  return cpa <= avg * 0.8 ? 'text-success' : cpa >= avg * 1.3 ? 'text-danger' : 'text-text-primary';
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

interface TargetingInsightsTabProps {
  data: TargetingInsightsResult;
  filterPreset?: string;
}

export function TargetingInsightsTab({ data, filterPreset }: TargetingInsightsTabProps) {
  const { audienceTypeBreakdown, interestTargeting, lookalikeBreakdown, ageGenderBreakdown } = data;
  const avgCpa = audienceTypeBreakdown.length > 0
    ? audienceTypeBreakdown.reduce((s, a) => s + a.cpa, 0) / audienceTypeBreakdown.length
    : 0;
  const maxSpendPct = audienceTypeBreakdown.length > 0
    ? Math.max(...audienceTypeBreakdown.map((a) => a.spendPct))
    : 0;

  return (
    <div className="space-y-6">
      <FilterBadge filterPreset={filterPreset} />
      {/* ── Audience Type Breakdown ──────────────────────── */}
      <SectionCard title="Audience Type Breakdown" icon={Users}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Ad Sets</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 w-32">Spend %</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3 text-right">CTR</th>
                <th className="px-4 py-3 text-right">CPM</th>
              </tr>
            </thead>
            <tbody>
              {audienceTypeBreakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={9}>
                    No audience targeting data for the selected date/filter.
                  </td>
                </tr>
              ) : audienceTypeBreakdown.map((a) => (
                <tr key={a.type}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ background: a.color }}>
                        {a.type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{a.adSets}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(a.spend)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={a.spendPct} max={maxSpendPct} color={a.color} />
                      <span className="text-xs text-text-muted w-10 text-right">{a.spendPct}%</span>
                    </div>
                  </td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(a.roas))}>{formatRoas(a.roas)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-medium', cpaClass(a.cpa, avgCpa))}>{formatCurrency(a.cpa)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(a.conversions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(a.ctr)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatCurrency(a.cpm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Interest Targeting ───────────────────────────── */}
      <SectionCard title="Interest Targeting Performance" icon={Target}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Interest</th>
                <th className="px-4 py-3 text-right">Ad Sets</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
                <th className="px-4 py-3 text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {interestTargeting.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={7}>
                    No interest-level targeting data for the selected date/filter.
                  </td>
                </tr>
              ) : [...interestTargeting].sort((a, b) => b.roas - a.roas).map((i) => (
                <tr key={i.interest}>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{i.interest}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{i.adSets}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary">{formatCurrency(i.spend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(i.roas))}>{formatRoas(i.roas)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-primary">{formatCurrency(i.cpa)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatNumber(i.conversions)}</td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{formatPercentage(i.ctr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Lookalike Audience Performance ───────────────── */}
      <SectionCard title="Lookalike Audience Performance" icon={Copy}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-right">Ad Sets</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">CPA</th>
                <th className="px-4 py-3 text-right">Conv.</th>
              </tr>
            </thead>
            <tbody>
              {lookalikeBreakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={7}>
                    No lookalike audiences found for the selected date/filter.
                  </td>
                </tr>
              ) : lookalikeBreakdown.map((l, idx) => (
                <tr key={idx}>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{l.source}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-block px-2 py-0.5 rounded bg-primary/15 text-primary-light text-xs font-semibold">{l.percentage}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-text-secondary">{l.adSets}</td>
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

      {/* ── Age x Gender Heatmap ─────────────────────────── */}
      <SectionCard title="Age x Gender Heatmap" icon={Grid3x3}>
        <div className="overflow-x-auto">
          <table className="dark-table w-full text-left">
            <thead>
              <tr>
                <th className="px-4 py-3" rowSpan={2}>Age Range</th>
                <th className="px-4 py-3 text-center border-l border-border" colSpan={3}>Male</th>
                <th className="px-4 py-3 text-center border-l border-border" colSpan={3}>Female</th>
                <th className="px-4 py-3 text-right border-l border-border">Total Spend</th>
              </tr>
              <tr>
                <th className="px-4 py-2 text-right text-[10px] border-l border-border">Spend</th>
                <th className="px-4 py-2 text-right text-[10px]">CPA</th>
                <th className="px-4 py-2 text-right text-[10px]">ROAS</th>
                <th className="px-4 py-2 text-right text-[10px] border-l border-border">Spend</th>
                <th className="px-4 py-2 text-right text-[10px]">CPA</th>
                <th className="px-4 py-2 text-right text-[10px]">ROAS</th>
                <th className="px-4 py-2 text-right text-[10px] border-l border-border"></th>
              </tr>
            </thead>
            <tbody>
              {ageGenderBreakdown.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-text-muted text-center" colSpan={8}>
                    No age/gender targeting data for the selected date/filter.
                  </td>
                </tr>
              ) : ageGenderBreakdown.map((row) => (
                <tr key={row.ageRange}>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.ageRange}</td>
                  {/* Male */}
                  <td className="px-4 py-3 text-right text-sm text-text-secondary border-l border-border">{formatCurrency(row.maleSpend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm', cpaClass(row.maleCpa, avgCpa))}>{formatCurrency(row.maleCpa)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(row.maleRoas))}>{formatRoas(row.maleRoas)}</td>
                  {/* Female */}
                  <td className="px-4 py-3 text-right text-sm text-text-secondary border-l border-border">{formatCurrency(row.femaleSpend)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm', cpaClass(row.femaleCpa, avgCpa))}>{formatCurrency(row.femaleCpa)}</td>
                  <td className={cn('px-4 py-3 text-right text-sm font-semibold', roasClass(row.femaleRoas))}>{formatRoas(row.femaleRoas)}</td>
                  {/* Total */}
                  <td className="px-4 py-3 text-right text-sm font-medium text-text-primary border-l border-border">{formatCurrency(row.totalSpend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
