'use client';

import { cn } from '@/lib/utils';

export interface TabsProps {
  tabs: { id: string; label: string }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex flex-wrap gap-x-6 gap-y-1" aria-label="Tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'border-primary text-text-primary'
                : 'border-transparent text-text-muted hover:border-border-light hover:text-text-primary'
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
