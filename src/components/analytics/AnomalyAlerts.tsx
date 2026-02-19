'use client';

import { useState } from 'react';
import { Bell, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockAnomalies } from '@/data/mockAnomalies';
import { AnomalyCard } from './AnomalyCard';

export function AnomalyAlerts() {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);

  const activeAnomalies = mockAnomalies.filter(
    (a) => !dismissedIds.has(a.id)
  );

  const criticalCount = activeAnomalies.filter(
    (a) => a.severity === 'critical'
  ).length;
  const warningCount = activeAnomalies.filter(
    (a) => a.severity === 'warning'
  ).length;
  const infoCount = activeAnomalies.filter(
    (a) => a.severity === 'info'
  ).length;

  const displayLimit = 3;
  const visibleAnomalies = isExpanded
    ? activeAnomalies
    : activeAnomalies.slice(0, displayLimit);

  const handleDismiss = (id: string) => {
    setDismissedIds((prev) => new Set(prev).add(id));
  };

  if (activeAnomalies.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
            <Bell className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-text-primary">
              Anomaly Alerts
            </h2>
            <p className="text-xs text-text-muted">
              {activeAnomalies.length} active alert
              {activeAnomalies.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {criticalCount} Critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {warningCount} Warning
            </span>
          )}
          {infoCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {infoCount} Info
            </span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {visibleAnomalies.map((anomaly) => (
          <AnomalyCard
            key={anomaly.id}
            anomaly={anomaly}
            onDismiss={handleDismiss}
          />
        ))}
      </div>

      {activeAnomalies.length > displayLimit && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover'
          )}
        >
          {isExpanded ? (
            <>
              Show Less <ChevronUp className="h-4 w-4" />
            </>
          ) : (
            <>
              View All ({activeAnomalies.length}){' '}
              <ChevronDown className="h-4 w-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
