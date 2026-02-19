'use client';

import type { RulePreset } from '@/types/automation';
import { PresetCard } from '@/components/automation/PresetCard';

interface RulePresetCardsProps {
  presets: RulePreset[];
  onUsePreset: (preset: RulePreset) => void;
}

export function RulePresetCards({ presets, onUsePreset }: RulePresetCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {presets.map((preset) => (
        <PresetCard key={preset.id} preset={preset} onUse={onUsePreset} />
      ))}
    </div>
  );
}
