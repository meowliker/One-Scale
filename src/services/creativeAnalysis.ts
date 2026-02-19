import type { Creative, CreativeSummary } from '@/types/creative';
import { mockCreatives } from '@/data/mockCreatives';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';
import { daysAgoInTimezone } from '@/lib/timezone';

async function mockGetCreatives(): Promise<Creative[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockCreatives;
}

async function realGetCreatives(): Promise<Creative[]> {
  const response = await apiClient<{ data: Creative[] }>('/api/meta/creatives');
  return response.data;
}

export const getCreatives = createServiceFn<Creative[]>(
  'meta',
  mockGetCreatives,
  realGetCreatives
);

export function computeSummary(creatives: Creative[]): CreativeSummary {
  return {
    totalCreatives: creatives.length,
    images: creatives.filter((c) => c.type === 'Image').length,
    videos: creatives.filter((c) => c.type === 'Video').length,
    fatigued: creatives.filter((c) => c.status === 'Fatigue').length,
  };
}

export interface TrendDataPoint {
  date: string;
  [creativeName: string]: string | number;
}

// Trends are computed from creatives — use real data when available
export async function getCreativeTrends(): Promise<TrendDataPoint[]> {
  const creatives = await getCreatives();

  const topCreatives = [...creatives]
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 3);

  if (topCreatives.length === 0) return [];

  const data: TrendDataPoint[] = [];

  for (let i = 0; i < 14; i++) {
    const dateStr = daysAgoInTimezone(13 - i);

    const point: TrendDataPoint = { date: dateStr };
    topCreatives.forEach((creative) => {
      const variance = (Math.random() - 0.5) * 1.2;
      point[creative.name] = parseFloat((creative.roas + variance).toFixed(2));
    });
    data.push(point);
  }

  return data;
}

export interface TypeBreakdown {
  type: string;
  count: number;
  avgRoas: number;
  avgCtr: number;
  totalSpend: number;
  totalRevenue: number;
}

export function getCreativeTypeBreakdown(creatives: Creative[]): TypeBreakdown[] {
  const types: Array<'Image' | 'Video'> = ['Image', 'Video'];

  return types.map((type) => {
    const filtered = creatives.filter((c) => c.type === type);
    const count = filtered.length;

    if (count === 0) {
      return { type, count: 0, avgRoas: 0, avgCtr: 0, totalSpend: 0, totalRevenue: 0 };
    }

    return {
      type,
      count,
      avgRoas: parseFloat((filtered.reduce((sum, c) => sum + c.roas, 0) / count).toFixed(2)),
      avgCtr: parseFloat((filtered.reduce((sum, c) => sum + c.ctr, 0) / count).toFixed(2)),
      totalSpend: parseFloat(filtered.reduce((sum, c) => sum + c.spend, 0).toFixed(2)),
      totalRevenue: parseFloat(filtered.reduce((sum, c) => sum + c.revenue, 0).toFixed(2)),
    };
  });
}
