export interface Anomaly {
  id: string;
  metric: string;
  entityName: string;
  expectedValue: number;
  actualValue: number;
  deviation: number;
  severity: 'critical' | 'warning' | 'info';
  detectedAt: string;
  recommendation: string;
}

function hoursAgo(h: number): string {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d.toISOString();
}

export const mockAnomalies: Anomaly[] = [
  {
    id: 'anomaly-1',
    metric: 'CPM',
    entityName: 'Campaign 3 - Summer Sale',
    expectedValue: 14.20,
    actualValue: 20.59,
    deviation: 45,
    severity: 'critical',
    detectedAt: hoursAgo(2),
    recommendation:
      'CPM spiked significantly. Check if audience overlap increased or if a competitor launched a competing campaign. Consider narrowing targeting.',
  },
  {
    id: 'anomaly-2',
    metric: 'ROAS',
    entityName: 'US Broad - Prospecting',
    expectedValue: 3.80,
    actualValue: 2.66,
    deviation: -30,
    severity: 'critical',
    detectedAt: hoursAgo(4),
    recommendation:
      'ROAS dropped below the profitable threshold. Pause low-performing ad sets and reallocate budget to top performers.',
  },
  {
    id: 'anomaly-3',
    metric: 'CTR',
    entityName: 'Video Ad 5 - UGC Testimonial',
    expectedValue: 1.80,
    actualValue: 2.88,
    deviation: 60,
    severity: 'info',
    detectedAt: hoursAgo(6),
    recommendation:
      'CTR is significantly above average. Consider scaling this ad by increasing its budget allocation and testing similar creatives.',
  },
  {
    id: 'anomaly-4',
    metric: 'CPA',
    entityName: 'Retargeting - Cart Abandoners',
    expectedValue: 18.50,
    actualValue: 28.68,
    deviation: 55,
    severity: 'critical',
    detectedAt: hoursAgo(1),
    recommendation:
      'CPA spiked above target. Review landing page for issues and check if the retargeting window needs adjustment.',
  },
  {
    id: 'anomaly-5',
    metric: 'Frequency',
    entityName: 'Lookalike 1% - Purchasers',
    expectedValue: 2.00,
    actualValue: 3.50,
    deviation: 75,
    severity: 'warning',
    detectedAt: hoursAgo(8),
    recommendation:
      'Audience is experiencing ad fatigue. Rotate creatives or expand the audience to reduce frequency.',
  },
  {
    id: 'anomaly-6',
    metric: 'Spend',
    entityName: 'Campaign 7 - New Collection',
    expectedValue: 250.00,
    actualValue: 412.50,
    deviation: 65,
    severity: 'warning',
    detectedAt: hoursAgo(3),
    recommendation:
      'Daily spend exceeded the expected budget. Check if campaign budget limits are set correctly and review bid strategy.',
  },
  {
    id: 'anomaly-7',
    metric: 'Conversions',
    entityName: 'Email Subscribers - Warm Audience',
    expectedValue: 45,
    actualValue: 12,
    deviation: -73,
    severity: 'critical',
    detectedAt: hoursAgo(5),
    recommendation:
      'Conversion volume dropped sharply. Verify the tracking pixel is firing correctly and check for checkout page issues.',
  },
  {
    id: 'anomaly-8',
    metric: 'CVR',
    entityName: 'Interest - Yoga & Fitness',
    expectedValue: 2.20,
    actualValue: 3.08,
    deviation: 40,
    severity: 'info',
    detectedAt: hoursAgo(10),
    recommendation:
      'Conversion rate improved significantly. This audience segment is performing well - consider increasing budget.',
  },
];
