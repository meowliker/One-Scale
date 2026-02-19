'use client';

import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Anomaly } from '@/data/mockAnomalies';

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    bg: 'bg-red-50',
    border: 'border-red-200',
    iconColor: 'text-red-600',
    badge: 'bg-red-100 text-red-700',
    label: 'Critical',
  },
  warning: {
    icon: AlertCircle,
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    iconColor: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Warning',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    iconColor: 'text-blue-600',
    badge: 'bg-blue-100 text-blue-700',
    label: 'Info',
  },
};

interface AnomalyCardProps {
  anomaly: Anomaly;
  onDismiss: (id: string) => void;
}

export function AnomalyCard({ anomaly, onDismiss }: AnomalyCardProps) {
  const config = severityConfig[anomaly.severity];
  const SeverityIcon = config.icon;

  const timeAgo = getTimeAgo(anomaly.detectedAt);

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        config.bg,
        config.border
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <SeverityIcon
            className={cn('mt-0.5 h-5 w-5 shrink-0', config.iconColor)}
          />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  config.badge
                )}
              >
                {config.label}
              </span>
              <span className="text-xs text-text-muted">{timeAgo}</span>
            </div>
            <p className="text-sm font-semibold text-text-primary">
              {anomaly.metric} {anomaly.deviation > 0 ? 'spike' : 'drop'}{' '}
              {anomaly.deviation > 0 ? '+' : ''}
              {anomaly.deviation}% on {anomaly.entityName}
            </p>
            <div className="mt-2 flex gap-4 text-xs text-text-secondary">
              <span>
                Expected:{' '}
                <span className="font-medium">{anomaly.expectedValue}</span>
              </span>
              <span>
                Actual:{' '}
                <span className="font-medium">{anomaly.actualValue}</span>
              </span>
            </div>
            <p className="mt-2 text-xs text-text-secondary">
              {anomaly.recommendation}
            </p>
          </div>
        </div>
        <button
          onClick={() => onDismiss(anomaly.id)}
          className="shrink-0 rounded p-1 text-text-dimmed hover:bg-surface-hover hover:text-text-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
