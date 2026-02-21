'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchInput } from '@/components/ui/SearchInput';
import { useColumnPresetStore } from '@/stores/columnPresetStore';
import { allMetrics, metricsByCategory, defaultColumnPresets } from '@/data/metricDefinitions';
import { ColumnPickerCategory } from '@/components/columns/ColumnPickerCategory';
import { SavePresetDialog } from '@/components/columns/SavePresetDialog';
import type { MetricKey, MetricCategory } from '@/types/metrics';

export interface ColumnPickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const categoryOrder: { key: MetricCategory; label: string }[] = [
  { key: 'performance', label: 'Performance' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'financial', label: 'Financial' },
];

export function ColumnPicker({ isOpen, onClose }: ColumnPickerProps) {
  const [search, setSearch] = useState('');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    visibleColumns,
    activePresetId,
    customPresets,
    addColumn,
    removeColumn,
    setPreset,
  } = useColumnPresetStore();

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }

    // Delay adding listener so the opening click doesn't immediately close
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const filteredMetricsByCategory = useMemo(() => {
    const query = search.toLowerCase().trim();
    if (!query) return metricsByCategory;

    const filtered: Record<string, typeof allMetrics> = {};
    for (const [category, metrics] of Object.entries(metricsByCategory)) {
      const matching = metrics.filter(
        (m) =>
          m.label.toLowerCase().includes(query) ||
          m.shortLabel.toLowerCase().includes(query) ||
          m.description.toLowerCase().includes(query)
      );
      if (matching.length > 0) {
        filtered[category] = matching;
      }
    }
    return filtered;
  }, [search]);

  function handleToggle(key: MetricKey) {
    if (visibleColumns.includes(key)) {
      removeColumn(key);
    } else {
      addColumn(key);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div
        ref={panelRef}
        className="absolute right-0 top-full z-40 mt-1 w-80 rounded-lg border border-border bg-surface-elevated shadow-lg"
      >
        {/* Search */}
        <div className="p-3 border-b border-border">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search metrics..."
          />
        </div>

        {/* Preset tabs */}
        <div className="flex gap-1 overflow-x-auto px-3 py-2 border-b border-border">
          {[...defaultColumnPresets, ...customPresets].map((preset) => (
            <button
              key={preset.id}
              onClick={() => setPreset(preset.id)}
              className={cn(
                'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                activePresetId === preset.id
                  ? 'bg-primary/10 text-primary-light'
                  : 'text-text-secondary hover:bg-surface-hover'
              )}
            >
              {preset.name}
            </button>
          ))}
        </div>

        {/* Metric categories */}
        <div className="max-h-96 overflow-y-auto">
          {categoryOrder.map(({ key, label }) => {
            const metrics = filteredMetricsByCategory[key];
            if (!metrics || metrics.length === 0) return null;
            return (
              <ColumnPickerCategory
                key={key}
                title={label}
                metrics={metrics}
                visibleColumns={visibleColumns}
                onToggle={handleToggle}
              />
            );
          })}

          {Object.keys(filteredMetricsByCategory).length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-text-dimmed">
              No metrics match your search.
            </div>
          )}
        </div>

        {/* Save as Preset */}
        <div className="border-t border-border p-3">
          <button
            onClick={() => setSaveDialogOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border-light bg-surface-elevated px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <Save className="h-4 w-4" />
            Save as Preset
          </button>
        </div>
      </div>

      <SavePresetDialog
        isOpen={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
      />
    </>
  );
}
