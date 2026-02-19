import type { TrackingHealth, HealthStatus } from '@/types/tracking';
import { cn } from '@/lib/utils';
import { Check, AlertTriangle, X, Activity } from 'lucide-react';

interface TrackingHealthDashboardProps {
  health: TrackingHealth;
}

const overallConfig: Record<
  HealthStatus,
  { label: string; bg: string; text: string; border: string; icon: React.ComponentType<{ className?: string }> }
> = {
  healthy: {
    label: 'System Healthy',
    bg: 'bg-green-50',
    text: 'text-green-800',
    border: 'border-green-200',
    icon: Check,
  },
  warning: {
    label: 'Warnings',
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: AlertTriangle,
  },
  error: {
    label: 'Issues Detected',
    bg: 'bg-red-50',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: X,
  },
};

const checkStatusConfig: Record<
  HealthStatus,
  { icon: React.ComponentType<{ className?: string }>; iconClass: string; bg: string }
> = {
  healthy: {
    icon: Check,
    iconClass: 'text-green-600',
    bg: 'bg-green-100',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'text-yellow-600',
    bg: 'bg-yellow-100',
  },
  error: {
    icon: X,
    iconClass: 'text-red-600',
    bg: 'bg-red-100',
  },
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function TrackingHealthDashboard({
  health,
}: TrackingHealthDashboardProps) {
  const overall = overallConfig[health.overall];
  const OverallIcon = overall.icon;

  return (
    <div className="space-y-6">
      {/* Overall health badge */}
      <div
        className={cn(
          'flex items-center gap-4 rounded-lg border-2 p-6',
          overall.bg,
          overall.border
        )}
      >
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full',
            health.overall === 'healthy'
              ? 'bg-green-100'
              : health.overall === 'warning'
                ? 'bg-yellow-100'
                : 'bg-red-100'
          )}
        >
          <OverallIcon
            className={cn(
              'h-6 w-6',
              health.overall === 'healthy'
                ? 'text-green-600'
                : health.overall === 'warning'
                  ? 'text-yellow-600'
                  : 'text-red-600'
            )}
          />
        </div>
        <div>
          <h3 className={cn('text-lg font-bold', overall.text)}>
            {overall.label}
          </h3>
          <p className="text-sm text-gray-500">
            {health.checks.length} checks monitored
          </p>
        </div>
      </div>

      {/* Health check cards */}
      <div className="space-y-3">
        {health.checks.map((check) => {
          const cfg = checkStatusConfig[check.status];
          const StatusIcon = cfg.icon;

          return (
            <div
              key={check.name}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    cfg.bg
                  )}
                >
                  <StatusIcon className={cn('h-4 w-4', cfg.iconClass)} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-gray-900">
                      {check.name}
                    </h4>
                    <span className="text-xs text-gray-400">
                      Checked {formatTimestamp(check.lastChecked)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{check.message}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Last updated */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <Activity className="h-3.5 w-3.5" />
        <span>Last Updated: {formatTimestamp(health.lastUpdated)}</span>
      </div>
    </div>
  );
}
