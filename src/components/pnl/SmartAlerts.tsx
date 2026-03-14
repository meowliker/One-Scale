'use client';

import type { Anomaly } from '@/lib/prism/anomalyDetector';

interface SmartAlertsProps {
  anomalies: Anomaly[];
}

export function SmartAlerts({ anomalies }: SmartAlertsProps) {
  if (anomalies.length === 0) return null;

  const critical = anomalies.filter(a => a.severity === 'critical');
  const warnings = anomalies.filter(a => a.severity === 'warning');
  const info = anomalies.filter(a => a.severity === 'info');

  return (
    <div className="space-y-2 mb-6">
      {critical.map((anomaly, i) => (
        <div key={`c-${i}`} className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <span className="text-red-500 text-sm mt-0.5">⚠</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">{anomaly.message}</p>
            {anomaly.action && <p className="text-xs text-red-600 dark:text-red-400 mt-1">→ {anomaly.action}</p>}
          </div>
        </div>
      ))}
      {warnings.map((anomaly, i) => (
        <div key={`w-${i}`} className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
          <span className="text-amber-500 text-sm mt-0.5">!</span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{anomaly.message}</p>
            {anomaly.action && <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">→ {anomaly.action}</p>}
          </div>
        </div>
      ))}
      {info.map((anomaly, i) => (
        <div key={`i-${i}`} className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <span className="text-emerald-500 text-sm mt-0.5">↑</span>
          <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{anomaly.message}</p>
        </div>
      ))}
    </div>
  );
}
