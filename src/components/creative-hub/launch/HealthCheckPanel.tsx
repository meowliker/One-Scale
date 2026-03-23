'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthCheck, PreLaunchReport } from '@/types/creativeHub';

interface HealthCheckPanelProps {
  report: PreLaunchReport;
}

const STATUS_ICON = {
  ok: CheckCircle,
  warn: AlertTriangle,
  fail: XCircle,
};

const STATUS_COLOR = {
  ok: 'text-emerald-500',
  warn: 'text-amber-500',
  fail: 'text-red-500',
};

const STATUS_BG = {
  ok: 'bg-emerald-50 border-emerald-200',
  warn: 'bg-amber-50 border-amber-200',
  fail: 'bg-red-50 border-red-200',
};

export function HealthCheckPanel({ report }: HealthCheckPanelProps) {
  const hasIssues = report.warnings > 0 || report.failures > 0;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        report.failures > 0
          ? 'border-red-200 bg-red-50/50'
          : report.warnings > 0
            ? 'border-amber-200 bg-amber-50/50'
            : 'border-emerald-200 bg-emerald-50/50'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Pre-Launch Health Check</h3>
        <div className="flex items-center gap-3">
          {report.failures > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-red-600">
              <XCircle className="h-3.5 w-3.5" />
              {report.failures} error{report.failures !== 1 ? 's' : ''}
            </span>
          )}
          {report.warnings > 0 && (
            <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              {report.warnings} warning{report.warnings !== 1 ? 's' : ''}
            </span>
          )}
          {!hasIssues && (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckCircle className="h-3.5 w-3.5" />
              All checks passed
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {report.checks.map((check, idx) => (
          <HealthCheckRow key={idx} check={check} />
        ))}
      </div>
    </div>
  );
}

function HealthCheckRow({ check }: { check: HealthCheck }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = STATUS_ICON[check.status];
  const hasExpandable = check.details || (check.options && check.options.length > 0);

  return (
    <div className={cn('rounded-xl border px-3 py-2', STATUS_BG[check.status])}>
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4 flex-shrink-0', STATUS_COLOR[check.status])} />
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-800">{check.check}</p>
          <p className="text-xs text-slate-600">{check.message}</p>
        </div>
        {hasExpandable && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex-shrink-0 rounded p-1 text-slate-400 transition-colors hover:text-slate-600"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {expanded && hasExpandable && (
        <div className="ml-7 mt-2 space-y-1">
          {check.details && <p className="text-xs text-slate-600">{check.details}</p>}
          {check.options && check.options.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {check.options.map((opt) => (
                <button
                  key={opt.value}
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 transition-colors hover:border-blue-400 hover:text-blue-700"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
