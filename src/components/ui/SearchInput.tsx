'use client';

import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...' }: SearchInputProps) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-dimmed" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border-light bg-surface-elevated py-2 pl-10 pr-9 text-sm text-text-primary placeholder:text-text-dimmed focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-text-dimmed hover:text-text-secondary transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
