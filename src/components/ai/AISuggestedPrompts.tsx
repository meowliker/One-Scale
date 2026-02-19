'use client';

import { cn } from '@/lib/utils';
import {
  TrendingDown,
  DollarSign,
  Palette,
  Rocket,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';

interface AISuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const suggestions = [
  { label: 'Why did ROAS drop?', icon: TrendingDown, color: 'text-red-500' },
  { label: 'Budget recommendations', icon: DollarSign, color: 'text-green-500' },
  { label: 'Which creatives to test?', icon: Palette, color: 'text-purple-500' },
  { label: 'Scale strategy', icon: Rocket, color: 'text-blue-500' },
  { label: 'Daily audit', icon: ClipboardList, color: 'text-orange-500' },
  { label: 'Creative fatigue check', icon: AlertTriangle, color: 'text-yellow-600' },
];

export function AISuggestedPrompts({ onSelect }: AISuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {suggestions.map((s) => {
        const Icon = s.icon;
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onSelect(s.label)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
              'bg-white border border-gray-200 text-gray-700',
              'hover:border-gray-300 hover:bg-gray-50 transition-colors cursor-pointer'
            )}
          >
            <Icon className={cn('w-3.5 h-3.5', s.color)} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
