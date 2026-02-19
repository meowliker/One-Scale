export interface BenchmarkData {
  metric: string;
  yourValue: number;
  industryAvg: number;
  top25: number;
  format: 'currency' | 'percentage' | 'number' | 'roas';
}

export interface IndustryBenchmarks {
  industry: string;
  benchmarks: BenchmarkData[];
}

export const mockIndustryBenchmarks: IndustryBenchmarks[] = [
  {
    industry: 'E-commerce Fashion',
    benchmarks: [
      { metric: 'CPA', yourValue: 28.50, industryAvg: 35.20, top25: 22.10, format: 'currency' },
      { metric: 'CPM', yourValue: 12.80, industryAvg: 14.50, top25: 9.20, format: 'currency' },
      { metric: 'CTR', yourValue: 2.10, industryAvg: 1.80, top25: 2.90, format: 'percentage' },
      { metric: 'ROAS', yourValue: 3.40, industryAvg: 2.80, top25: 4.50, format: 'roas' },
      { metric: 'AOV', yourValue: 85.00, industryAvg: 72.00, top25: 98.00, format: 'currency' },
      { metric: 'CVR', yourValue: 2.80, industryAvg: 2.20, top25: 3.60, format: 'percentage' },
      { metric: 'CPC', yourValue: 1.05, industryAvg: 1.35, top25: 0.82, format: 'currency' },
      { metric: 'Frequency', yourValue: 2.10, industryAvg: 2.50, top25: 1.80, format: 'number' },
    ],
  },
  {
    industry: 'Health & Wellness',
    benchmarks: [
      { metric: 'CPA', yourValue: 42.00, industryAvg: 38.90, top25: 26.50, format: 'currency' },
      { metric: 'CPM', yourValue: 16.20, industryAvg: 15.80, top25: 11.40, format: 'currency' },
      { metric: 'CTR', yourValue: 1.60, industryAvg: 1.90, top25: 2.70, format: 'percentage' },
      { metric: 'ROAS', yourValue: 2.90, industryAvg: 3.10, top25: 4.80, format: 'roas' },
      { metric: 'AOV', yourValue: 65.00, industryAvg: 58.00, top25: 82.00, format: 'currency' },
      { metric: 'CVR', yourValue: 1.90, industryAvg: 2.40, top25: 3.40, format: 'percentage' },
      { metric: 'CPC', yourValue: 1.55, industryAvg: 1.28, top25: 0.95, format: 'currency' },
      { metric: 'Frequency', yourValue: 2.80, industryAvg: 2.30, top25: 1.70, format: 'number' },
    ],
  },
  {
    industry: 'Home & Garden',
    benchmarks: [
      { metric: 'CPA', yourValue: 52.30, industryAvg: 48.60, top25: 32.80, format: 'currency' },
      { metric: 'CPM', yourValue: 10.50, industryAvg: 11.20, top25: 7.80, format: 'currency' },
      { metric: 'CTR', yourValue: 1.40, industryAvg: 1.50, top25: 2.20, format: 'percentage' },
      { metric: 'ROAS', yourValue: 3.80, industryAvg: 3.20, top25: 5.10, format: 'roas' },
      { metric: 'AOV', yourValue: 120.00, industryAvg: 105.00, top25: 145.00, format: 'currency' },
      { metric: 'CVR', yourValue: 1.70, industryAvg: 1.50, top25: 2.80, format: 'percentage' },
      { metric: 'CPC', yourValue: 0.92, industryAvg: 1.10, top25: 0.68, format: 'currency' },
      { metric: 'Frequency', yourValue: 1.90, industryAvg: 2.10, top25: 1.50, format: 'number' },
    ],
  },
  {
    industry: 'Beauty & Skincare',
    benchmarks: [
      { metric: 'CPA', yourValue: 31.20, industryAvg: 29.80, top25: 19.50, format: 'currency' },
      { metric: 'CPM', yourValue: 18.90, industryAvg: 17.20, top25: 12.60, format: 'currency' },
      { metric: 'CTR', yourValue: 2.50, industryAvg: 2.30, top25: 3.40, format: 'percentage' },
      { metric: 'ROAS', yourValue: 4.10, industryAvg: 3.50, top25: 5.60, format: 'roas' },
      { metric: 'AOV', yourValue: 55.00, industryAvg: 48.00, top25: 68.00, format: 'currency' },
      { metric: 'CVR', yourValue: 3.20, industryAvg: 2.80, top25: 4.10, format: 'percentage' },
      { metric: 'CPC', yourValue: 1.20, industryAvg: 1.15, top25: 0.78, format: 'currency' },
      { metric: 'Frequency', yourValue: 2.40, industryAvg: 2.60, top25: 1.90, format: 'number' },
    ],
  },
];
