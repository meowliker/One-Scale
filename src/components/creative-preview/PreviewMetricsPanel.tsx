import type { PerformanceMetrics } from '@/types/campaign';
import type { MetricKey } from '@/types/metrics';
import { formatMetric } from '@/lib/metrics';
import { cn } from '@/lib/utils';

interface PreviewMetricsPanelProps {
  metrics: PerformanceMetrics;
}

interface MetricRow {
  key: MetricKey;
  label: string;
}

const metricGroups: MetricRow[][] = [
  [
    { key: 'spend', label: 'Spend' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'roas', label: 'ROAS' },
  ],
  [
    { key: 'cpc', label: 'CPC' },
    { key: 'cpm', label: 'CPM' },
    { key: 'ctr', label: 'CTR' },
  ],
  [
    { key: 'impressions', label: 'Impressions' },
    { key: 'reach', label: 'Reach' },
    { key: 'clicks', label: 'Clicks' },
  ],
  [
    { key: 'conversions', label: 'Conversions' },
    { key: 'aov', label: 'AOV' },
    { key: 'cpa', label: 'CPA' },
    { key: 'cvr', label: 'CVR' },
  ],
];

function getRoasColor(value: number): string {
  if (value >= 2) return 'text-green-600';
  if (value >= 1) return 'text-orange-500';
  return 'text-red-500';
}

export function PreviewMetricsPanel({ metrics }: PreviewMetricsPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Performance Metrics</h3>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {metricGroups.map((group, groupIndex) => (
          <div key={groupIndex}>
            {groupIndex > 0 && <div className="my-2 border-t border-gray-100" />}
            {group.map((row) => {
              const value = metrics[row.key as keyof PerformanceMetrics] as number;
              const isRoas = row.key === 'roas';

              return (
                <div
                  key={row.key}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50"
                >
                  <span className="text-sm text-gray-600">{row.label}</span>
                  <span
                    className={cn(
                      'text-sm font-medium',
                      isRoas ? getRoasColor(value) : 'text-gray-900'
                    )}
                  >
                    {formatMetric(row.key, value)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
