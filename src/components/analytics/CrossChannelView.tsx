'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { Facebook } from 'lucide-react';

export interface CrossChannelViewProps {
  metrics: Record<string, number>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomBarTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-text-primary">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="font-semibold text-text-primary">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CrossChannelView({ metrics }: CrossChannelViewProps) {
  const totalSpend = metrics.totalSpend ?? 0;
  const totalRevenue = metrics.totalRevenue ?? 0;
  const totalConversions = metrics.totalConversions ?? 0;
  const roas = metrics.blendedRoas ?? 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  // Currently only Meta data — show as single channel
  const channels = [
    {
      channel: 'Meta Ads',
      spend: totalSpend,
      revenue: totalRevenue,
      roas,
      conversions: totalConversions,
      cpa,
      color: '#3b82f6',
      icon: <Facebook className="h-4 w-4 text-blue-600" />,
    },
  ];

  const chartData = channels.map((ch) => ({
    name: ch.channel,
    Revenue: ch.revenue,
    Spend: ch.spend,
  }));

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-base font-semibold text-text-primary">Cross-Channel Performance</h3>
        <p className="mt-0.5 text-xs text-text-muted">
          Blended ROAS: {roas.toFixed(2)}x | {formatNumber(totalConversions)} total conversions
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 p-5 xl:grid-cols-2">
        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-2 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">Channel</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Spend</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Revenue</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">ROAS</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">Conv.</th>
                <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-text-muted">CPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {channels.map((ch) => (
                <tr key={ch.channel} className="transition-colors hover:bg-surface-hover">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      {ch.icon}
                      <span className="font-medium text-text-primary">{ch.channel}</span>
                      <span className="text-xs text-text-dimmed">(100%)</span>
                    </div>
                  </td>
                  <td className="py-3 text-right font-medium text-text-primary">{formatCurrency(ch.spend)}</td>
                  <td className="py-3 text-right font-medium text-text-primary">{formatCurrency(ch.revenue)}</td>
                  <td className="py-3 text-right">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold',
                        ch.roas >= 4
                          ? 'bg-green-50 text-green-700'
                          : ch.roas >= 2
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-red-50 text-red-700'
                      )}
                    >
                      {ch.roas.toFixed(2)}x
                    </span>
                  </td>
                  <td className="py-3 text-right font-medium text-text-primary">{formatNumber(ch.conversions)}</td>
                  <td className="py-3 text-right font-medium text-text-primary">{formatCurrency(ch.cpa)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Stacked Bar Chart */}
        <div className="flex flex-col">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Revenue vs Spend by Channel</p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomBarTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Spend" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
