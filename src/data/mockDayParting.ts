export interface DayPartingCell {
  hour: number;
  day: string;
  spend: number;
  revenue: number;
  roas: number;
  conversions: number;
  cpa: number;
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayLabel = (typeof days)[number];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = seededRandom(777);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Generate performance patterns: mornings 8-11 are best, 1am-5am worst
function hourMultiplier(hour: number): number {
  if (hour >= 8 && hour <= 11) return 1.4 + rand() * 0.3;
  if (hour >= 12 && hour <= 14) return 1.1 + rand() * 0.2;
  if (hour >= 15 && hour <= 18) return 1.0 + rand() * 0.2;
  if (hour >= 19 && hour <= 21) return 1.2 + rand() * 0.2;
  if (hour >= 1 && hour <= 5) return 0.4 + rand() * 0.2;
  return 0.7 + rand() * 0.3;
}

function dayMultiplier(day: string): number {
  if (day === 'Sat' || day === 'Sun') return 0.8 + rand() * 0.1;
  if (day === 'Mon') return 1.1 + rand() * 0.1;
  if (day === 'Tue' || day === 'Wed') return 1.15 + rand() * 0.1;
  return 1.0 + rand() * 0.1;
}

export const mockDayPartingData: DayPartingCell[] = [];

for (const day of days) {
  for (let hour = 0; hour < 24; hour++) {
    const hm = hourMultiplier(hour);
    const dm = dayMultiplier(day);
    const baseSpend = 25 + rand() * 30;
    const spend = round2(baseSpend * dm);
    const roas = round2((1.5 + rand() * 2.5) * hm);
    const revenue = round2(spend * roas);
    const conversions = Math.max(1, Math.round((2 + rand() * 6) * hm * dm));
    const cpa = round2(spend / conversions);

    mockDayPartingData.push({ hour, day, spend, revenue, roas, conversions, cpa });
  }
}

export const dayLabels: string[] = [...days];
export const hourLabels: string[] = Array.from({ length: 24 }, (_, i) => {
  if (i === 0) return '12am';
  if (i < 12) return `${i}am`;
  if (i === 12) return '12pm';
  return `${i - 12}pm`;
});
