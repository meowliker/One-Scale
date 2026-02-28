'use client';

import { cn } from '@/lib/utils';

export type QuickFilter = 'all' | 'highRoas' | 'lowRoas' | 'learning' | 'fatigue';

interface QuickFilterBarProps {
  value: QuickFilter;
  onChange: (filter: QuickFilter) => void;
}

const filters: { id: QuickFilter; label: string }[] = [
  { id: 'all', label: 'All Active' },
  { id: 'highRoas', label: 'High ROAS (>2x)' },
  { id: 'lowRoas', label: 'Low ROAS (<1x)' },
  { id: 'learning', label: 'Learning' },
  { id: 'fatigue', label: 'Fatigue Risk' },
];

export function QuickFilterBar({ value, onChange }: QuickFilterBarProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => onChange(f.id)}
          className={cn(
            'rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
            value === f.id
              ? 'bg-[#0071e3] text-white shadow-sm'
              : 'bg-[#f0f0f5] text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#1d1d1f]'
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
