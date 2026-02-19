import type { PnLEntry, PnLSummary, HourlyPnLEntry } from '@/types/pnl';
import { daysAgoInTimezone } from '@/lib/timezone';

// Helper to generate a date string N days ago in store timezone (YYYY-MM-DD)
function daysAgo(n: number): string {
  return daysAgoInTimezone(n);
}

// Seeded pseudo-random for reproducible data
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const rand = seededRandom(99);

function generatePnLEntry(date: string): PnLEntry {
  const revenue = round2(lerp(2000, 6000, rand()));
  const cogs = round2(revenue * lerp(0.32, 0.38, rand()));         // ~35% of revenue
  const adSpend = round2(lerp(500, 1200, rand()));
  const shipping = round2(revenue * lerp(0.06, 0.10, rand()));     // ~8% of revenue
  const fees = round2(revenue * lerp(0.02, 0.04, rand()));         // ~3% of revenue
  const refunds = round2(revenue * lerp(0.01, 0.03, rand()));      // ~2% of revenue
  const netProfit = round2(revenue - cogs - adSpend - shipping - fees - refunds);
  const margin = round2((netProfit / revenue) * 100);

  return {
    date,
    revenue,
    cogs,
    adSpend,
    shipping,
    fees,
    refunds,
    netProfit,
    margin,
  };
}

// Generate 30 days of daily P&L data
export const mockDailyPnL: PnLEntry[] = Array.from({ length: 30 }, (_, i) => {
  const dayIndex = 29 - i;
  return generatePnLEntry(daysAgo(dayIndex));
});

// Aggregate entries over a slice of days into a single PnLEntry
function aggregateEntries(entries: PnLEntry[], label: string): PnLEntry {
  const agg = entries.reduce(
    (acc, e) => {
      acc.revenue += e.revenue;
      acc.cogs += e.cogs;
      acc.adSpend += e.adSpend;
      acc.shipping += e.shipping;
      acc.fees += e.fees;
      acc.refunds += e.refunds;
      return acc;
    },
    { revenue: 0, cogs: 0, adSpend: 0, shipping: 0, fees: 0, refunds: 0 },
  );

  const netProfit = round2(
    agg.revenue - agg.cogs - agg.adSpend - agg.shipping - agg.fees - agg.refunds,
  );

  return {
    date: label,
    revenue: round2(agg.revenue),
    cogs: round2(agg.cogs),
    adSpend: round2(agg.adSpend),
    shipping: round2(agg.shipping),
    fees: round2(agg.fees),
    refunds: round2(agg.refunds),
    netProfit,
    margin: round2((netProfit / agg.revenue) * 100),
  };
}

const todayEntry = mockDailyPnL[mockDailyPnL.length - 1];
const thisWeekEntries = mockDailyPnL.slice(-7);
const thisMonthEntries = mockDailyPnL;
// allTime uses the full 30-day window as a proxy
const allTimeEntries = mockDailyPnL;

export const mockPnLSummary: PnLSummary = {
  today: { ...todayEntry },
  thisWeek: aggregateEntries(thisWeekEntries, 'thisWeek'),
  thisMonth: aggregateEntries(thisMonthEntries, 'thisMonth'),
  allTime: aggregateEntries(allTimeEntries, 'allTime'),
};

// ---- Hourly P&L mock data ----

const hourlyRand = seededRandom(555);

function hourlyLerp(min: number, max: number): number {
  return min + (max - min) * hourlyRand();
}

/** Performance multiplier: mornings 8-11 best, 1am-5am worst */
function hourPerformanceMultiplier(hour: number): number {
  if (hour >= 8 && hour <= 11) return 1.4 + hourlyRand() * 0.3;
  if (hour >= 12 && hour <= 14) return 1.1 + hourlyRand() * 0.2;
  if (hour >= 15 && hour <= 18) return 1.0 + hourlyRand() * 0.2;
  if (hour >= 19 && hour <= 21) return 1.2 + hourlyRand() * 0.2;
  if (hour >= 1 && hour <= 5) return 0.4 + hourlyRand() * 0.2;
  return 0.7 + hourlyRand() * 0.3;
}

/** Day-of-week multiplier (0=Sun, 1=Mon, ..., 6=Sat) */
function dayOfWeekMultiplier(dow: number): number {
  if (dow === 0 || dow === 6) return 0.8 + hourlyRand() * 0.1;
  if (dow === 1) return 1.1 + hourlyRand() * 0.1;
  if (dow === 2 || dow === 3) return 1.15 + hourlyRand() * 0.1;
  return 1.0 + hourlyRand() * 0.1;
}

const HOUR_LABEL_MAP = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12am';
  if (i < 12) return `${i}am`;
  if (i === 12) return '12pm';
  return `${i - 12}pm`;
});

/** Generate 30 days × 24 hours of hourly P&L data */
export const mockHourlyPnL: HourlyPnLEntry[] = (() => {
  const entries: HourlyPnLEntry[] = [];
  for (let dayIdx = 29; dayIdx >= 0; dayIdx--) {
    const dateStr = daysAgo(dayIdx);
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    const dm = dayOfWeekMultiplier(dow);

    for (let hour = 0; hour < 24; hour++) {
      const hm = hourPerformanceMultiplier(hour);
      const baseSpend = hourlyLerp(20, 60);
      const spend = round2(baseSpend * dm);
      const roas = round2((1.2 + hourlyRand() * 2.8) * hm);
      const revenue = round2(spend * roas);
      const impressions = Math.round(hourlyLerp(800, 3000) * hm * dm);
      const ctr = round2(hourlyLerp(1.5, 4.5) * hm);
      const clicks = Math.round(impressions * (ctr / 100));
      const conversions = Math.max(0, Math.round(hourlyLerp(0.5, 5) * hm * dm));
      const cpa = conversions > 0 ? round2(spend / conversions) : 0;
      const cpc = clicks > 0 ? round2(spend / clicks) : 0;
      const cpm = impressions > 0 ? round2((spend / impressions) * 1000) : 0;

      entries.push({
        date: dateStr,
        hour,
        hourLabel: HOUR_LABEL_MAP[hour],
        spend,
        revenue,
        roas,
        impressions,
        clicks,
        conversions,
        cpa,
        ctr,
        cpc,
        cpm,
      });
    }
  }
  return entries;
})();
