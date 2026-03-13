'use client';

import { useMemo } from 'react';
import type { PnLEntry, HourlyPnLEntry } from '@/types/pnl';
import type { DateRange } from '@/types/analytics';
import { formatDateInTimezone } from '@/lib/timezone';
import { PnLTrendChart } from './PnLTrendChart';
import { PnLWaterfallChart } from './PnLWaterfallChart';
import { PnLDayPartChart } from './PnLDayPartChart';
import { PnLHourlyTrend } from './PnLHourlyTrend';

interface PnLChartGridProps {
  dailyPnL: PnLEntry[];
  hourlyPnL: HourlyPnLEntry[];
  dateRange: DateRange;
  activeEntry: PnLEntry;
}

export function PnLChartGrid({
  dailyPnL,
  hourlyPnL,
  dateRange,
  activeEntry,
}: PnLChartGridProps) {
  // Filter daily data for the selected range (for daily chart)
  const filteredDaily = useMemo(() => {
    const startStr = formatDateInTimezone(dateRange.start);
    const endStr = formatDateInTimezone(dateRange.end);
    return dailyPnL
      .filter((d) => d.date >= startStr && d.date <= endStr)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dailyPnL, dateRange]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Top-left: Trend (3/5) */}
      <div className="lg:col-span-3 min-h-[340px]">
        <PnLTrendChart dailyPnL={dailyPnL} dateRange={dateRange} />
      </div>

      {/* Top-right: Waterfall (2/5) */}
      <div className="lg:col-span-2 min-h-[340px]">
        <PnLWaterfallChart entry={activeEntry} dailyPnL={filteredDaily} />
      </div>

      {/* Bottom-left: Daily (3/5) */}
      <div className="lg:col-span-3 min-h-[340px]">
        <PnLDayPartChart dailyPnL={filteredDaily} />
      </div>

      {/* Bottom-right: Hourly Heatmap (2/5) */}
      <div className="lg:col-span-2 min-h-[340px]">
        <PnLHourlyTrend hourlyPnL={hourlyPnL} />
      </div>
    </div>
  );
}
