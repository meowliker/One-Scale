'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayPartingCell } from '@/data/mockDayParting';
import { hourLabels, dayLabels } from '@/data/mockDayParting';

interface DayPartingRecommendationsProps {
  data: DayPartingCell[];
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  type: 'increase' | 'decrease' | 'opportunity' | 'warning';
  impact: 'high' | 'medium' | 'low';
}

const typeConfig = {
  increase: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  decrease: {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  opportunity: {
    icon: Zap,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
};

const impactColors = {
  high: 'bg-red-500/20 text-red-400',
  medium: 'bg-amber-500/20 text-amber-400',
  low: 'bg-surface-hover text-text-muted',
};

function formatHourRange(hours: number[]): string {
  if (hours.length === 0) return '';
  const sorted = [...hours].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(
        start === end
          ? hourLabels[start]
          : `${hourLabels[start]}-${hourLabels[end]}`
      );
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(
    start === end
      ? hourLabels[start]
      : `${hourLabels[start]}-${hourLabels[end]}`
  );
  return ranges.join(', ');
}

function generateRecommendations(data: DayPartingCell[]): Recommendation[] {
  if (data.length === 0) return [];

  const recommendations: Recommendation[] = [];

  // Compute average ROAS per hour (across all days)
  const hourlyRoas: Record<number, number[]> = {};
  const dailyRoas: Record<string, number[]> = {};
  const hourlyCpa: Record<number, number[]> = {};

  for (let h = 0; h < 24; h++) {
    hourlyRoas[h] = [];
    hourlyCpa[h] = [];
  }
  for (const day of dayLabels) {
    dailyRoas[day] = [];
  }

  for (const cell of data) {
    hourlyRoas[cell.hour].push(cell.roas);
    hourlyCpa[cell.hour].push(cell.cpa);
    if (dailyRoas[cell.day]) {
      dailyRoas[cell.day].push(cell.roas);
    }
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const hourAvgRoas = Object.entries(hourlyRoas).map(([h, vals]) => ({
    hour: Number(h),
    avgRoas: avg(vals),
  }));

  const overallAvgRoas = avg(data.map((c) => c.roas));

  // Best hours: ROAS > 1.5x overall average
  const bestHours = hourAvgRoas
    .filter((h) => h.avgRoas > overallAvgRoas * 1.5)
    .map((h) => h.hour);

  if (bestHours.length > 0) {
    const bestAvg = avg(bestHours.map((h) => hourAvgRoas.find((x) => x.hour === h)!.avgRoas));
    const pctAbove = Math.round(((bestAvg - overallAvgRoas) / overallAvgRoas) * 100);
    recommendations.push({
      id: 'rec-best-hours',
      title: `Best performing hours: ${formatHourRange(bestHours)}`,
      description: `Average ROAS of ${bestAvg.toFixed(1)}x during these hours. This is ${pctAbove}% higher than the daily average. Consider concentrating more budget during this window.`,
      type: 'increase',
      impact: 'high',
    });
  }

  // Worst hours: ROAS < 0.5x overall average
  const worstHours = hourAvgRoas
    .filter((h) => h.avgRoas < overallAvgRoas * 0.5)
    .map((h) => h.hour);

  if (worstHours.length > 0) {
    const worstAvg = avg(worstHours.map((h) => hourAvgRoas.find((x) => x.hour === h)!.avgRoas));
    recommendations.push({
      id: 'rec-worst-hours',
      title: `Worst performing hours: ${formatHourRange(worstHours)}`,
      description: `Average ROAS of ${worstAvg.toFixed(1)}x during these hours. These hours are consistently below the break-even threshold. Budget spent here yields minimal returns.`,
      type: 'decrease',
      impact: 'high',
    });
  }

  // Bid increase recommendation for best hours
  if (bestHours.length > 0) {
    recommendations.push({
      id: 'rec-bid-increase',
      title: `Increase bid +20% during ${formatHourRange(bestHours)}`,
      description: `Based on historical performance, increasing bids during peak hours could capture an estimated 15-20% more conversions at a profitable CPA.`,
      type: 'increase',
      impact: 'high',
    });
  }

  // Bid decrease recommendation for worst hours
  if (worstHours.length > 0) {
    const worstSpend = data
      .filter((c) => worstHours.includes(c.hour))
      .reduce((sum, c) => sum + c.spend, 0);
    const weeklySavings = Math.round((worstSpend * 0.3) / 4);
    recommendations.push({
      id: 'rec-bid-decrease',
      title: `Decrease bid -30% during ${formatHourRange(worstHours)}`,
      description: `Reducing bids during off-peak hours would save approximately $${weeklySavings}/week while only sacrificing a few low-quality conversions.`,
      type: 'decrease',
      impact: 'medium',
    });
  }

  // Best days by ROAS
  const dayAvgRoas = Object.entries(dailyRoas)
    .map(([day, vals]) => ({ day, avgRoas: avg(vals) }))
    .sort((a, b) => b.avgRoas - a.avgRoas);

  const topDays = dayAvgRoas.filter((d) => d.avgRoas > overallAvgRoas * 1.1);
  if (topDays.length > 0 && topDays.length <= 4) {
    const topDayNames = topDays.map((d) => d.day).join(' and ');
    const pctAbove = Math.round(
      ((avg(topDays.map((d) => d.avgRoas)) - overallAvgRoas) / overallAvgRoas) * 100
    );
    recommendations.push({
      id: 'rec-best-days',
      title: `${topDayNames} show highest ROAS`,
      description: `These days perform ${pctAbove}% above average. Consider front-loading weekly budgets for these days to maximize returns.`,
      type: 'opportunity',
      impact: 'medium',
    });
  }

  // Weekend evening opportunity
  const weekendEvenings = data.filter(
    (c) => (c.day === 'Sat' || c.day === 'Sun') && c.hour >= 19 && c.hour <= 21
  );
  if (weekendEvenings.length > 0) {
    const weAvgRoas = avg(weekendEvenings.map((c) => c.roas));
    if (weAvgRoas > overallAvgRoas * 0.9) {
      recommendations.push({
        id: 'rec-weekend-evenings',
        title: 'Weekend evenings (7pm-9pm) show potential',
        description: `Saturday and Sunday evenings have a ROAS of ${weAvgRoas.toFixed(1)}x. Monitor for 2 more weeks before increasing investment.`,
        type: 'opportunity',
        impact: 'low',
      });
    }
  }

  // High CPA warning
  const hourAvgCpa = Object.entries(hourlyCpa).map(([h, vals]) => ({
    hour: Number(h),
    avgCpa: avg(vals),
  }));
  const overallAvgCpa = avg(data.map((c) => c.cpa));
  const highCpaHours = hourAvgCpa.filter((h) => h.avgCpa > overallAvgCpa * 1.3);
  if (highCpaHours.length > 0) {
    const spikeHours = highCpaHours.map((h) => h.hour);
    const pctAbove = Math.round(
      ((avg(highCpaHours.map((h) => h.avgCpa)) - overallAvgCpa) / overallAvgCpa) * 100
    );
    recommendations.push({
      id: 'rec-cpa-spike',
      title: `CPA spike detected during ${formatHourRange(spikeHours)}`,
      description: `CPA during these hours is ${pctAbove}% higher than average. Competition likely increases during these time slots.`,
      type: 'warning',
      impact: 'medium',
    });
  }

  return recommendations;
}

export function DayPartingRecommendations({ data }: DayPartingRecommendationsProps) {
  const recommendations = useMemo(() => generateRecommendations(data), [data]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleRecs = recommendations.filter((r) => !dismissed.has(r.id));

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-brand" />
        <h3 className="text-sm font-semibold text-text-primary">
          AI-Powered Recommendations
        </h3>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
          {visibleRecs.length} suggestions
        </span>
      </div>

      <div className="space-y-3">
        {visibleRecs.map((rec) => {
          const config = typeConfig[rec.type];
          const Icon = config.icon;

          return (
            <div
              key={rec.id}
              className={cn(
                'rounded-lg border p-4',
                config.bg,
                config.border
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-elevated shadow-sm"
                >
                  <Icon className={cn('h-4 w-4', config.color)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-text-primary">
                      {rec.title}
                    </h4>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase',
                        impactColors[rec.impact]
                      )}
                    >
                      {rec.impact} impact
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">{rec.description}</p>
                  <div className="mt-2 flex gap-2">
                    <button className="rounded-md bg-surface-elevated px-3 py-1 text-xs font-medium text-text-secondary shadow-sm hover:bg-surface-hover">
                      Apply
                    </button>
                    <button
                      onClick={() =>
                        setDismissed((prev) => new Set([...prev, rec.id]))
                      }
                      className="rounded-md px-3 py-1 text-xs font-medium text-text-muted hover:text-text-secondary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
