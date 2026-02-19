'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useColumnPresetStore } from '@/stores/columnPresetStore';
import { defaultColumnPresets } from '@/data/metricDefinitions';

export function ColumnPresetSelector() {
  const {
    activePresetId,
    customPresets,
    setPreset,
    deletePreset,
  } = useColumnPresetStore();

  const allPresets = [...defaultColumnPresets, ...customPresets];

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {allPresets.map((preset) => {
        const isActive = activePresetId === preset.id;

        return (
          <button
            key={preset.id}
            onClick={() => setPreset(preset.id)}
            className={cn(
              'group flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary-light'
                : 'bg-surface-hover text-text-secondary hover:bg-surface-active'
            )}
          >
            <span>{preset.name}</span>
            {preset.isCustom && (
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePreset(preset.id);
                }}
                className={cn(
                  'ml-0.5 inline-flex items-center rounded-full p-0.5 transition-colors',
                  isActive
                    ? 'hover:bg-primary/20 text-primary-light'
                    : 'hover:bg-surface-active text-text-dimmed opacity-0 group-hover:opacity-100'
                )}
              >
                <X className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
