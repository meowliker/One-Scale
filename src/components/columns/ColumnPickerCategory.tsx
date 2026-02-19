'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/Checkbox';
import type { MetricDefinition, MetricKey } from '@/types/metrics';

export interface ColumnPickerCategoryProps {
  title: string;
  metrics: MetricDefinition[];
  visibleColumns: MetricKey[];
  onToggle: (key: MetricKey) => void;
}

export function ColumnPickerCategory({
  title,
  metrics,
  visibleColumns,
  onToggle,
}: ColumnPickerCategoryProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const visibleCount = metrics.filter((m) => visibleColumns.includes(m.key)).length;

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-text-dimmed" />
          ) : (
            <ChevronRight className="h-4 w-4 text-text-dimmed" />
          )}
          <span>{title}</span>
        </div>
        <span className="text-xs text-text-dimmed">
          {visibleCount}/{metrics.length}
        </span>
      </button>

      {isExpanded && (
        <div className="pb-1">
          {metrics.map((metric) => {
            const isChecked = visibleColumns.includes(metric.key);
            return (
              <label
                key={metric.key}
                className={cn(
                  'flex cursor-pointer items-center gap-3 px-4 py-1.5 text-sm hover:bg-surface-hover transition-colors',
                  isChecked && 'text-text-primary',
                  !isChecked && 'text-text-muted'
                )}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={() => onToggle(metric.key)}
                />
                <div className="flex flex-col">
                  <span className="leading-tight">{metric.label}</span>
                  <span className="text-xs text-text-dimmed leading-tight">
                    {metric.description}
                  </span>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
