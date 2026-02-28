'use client';

import { cn } from '@/lib/utils';

export type QuickFilterId = 'all-active' | 'high-roas' | 'low-roas' | 'learning' | 'fatigue-risk';

interface QuickFilterDef {
  id: QuickFilterId;
  label: string;
}

const QUICK_FILTERS: QuickFilterDef[] = [
  { id: 'all-active', label: 'All Active' },
  { id: 'high-roas', label: 'High ROAS (>2x)' },
  { id: 'low-roas', label: 'Low ROAS (<1x)' },
  { id: 'learning', label: 'Learning' },
  { id: 'fatigue-risk', label: 'Fatigue Risk' },
];

interface Props {
  activeFilter: QuickFilterId | null;
  onFilterChange: (filter: QuickFilterId | null) => void;
}

export function QuickFilterBar({ activeFilter, onFilterChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      {QUICK_FILTERS.map((f) => {
        const isActive = activeFilter === f.id;
        return (
          <button
            key={f.id}
            onClick={() => onFilterChange(isActive ? null : f.id)}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-medium transition-all duration-150',
              isActive
                ? 'bg-[#0071e3] text-white shadow-sm'
                : 'bg-[#f5f5f7] text-[#6b7280] hover:bg-[#e8e8ed] hover:text-[#1d1d1f] dark:bg-[#2a2a2e] dark:text-[#9ca3af] dark:hover:bg-[#3a3a3e] dark:hover:text-[#e5e7eb]'
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
