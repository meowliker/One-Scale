'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormulaToken } from '@/types/dashboard';

export interface FormulaInputProps {
  tokens: FormulaToken[];
  onAddToken: (token: FormulaToken) => void;
  onRemoveToken: (index: number) => void;
}

const tokenStyles: Record<FormulaToken['type'], string> = {
  metric: 'bg-blue-100 text-blue-800 border-blue-200',
  operator: 'bg-gray-100 text-gray-800 border-gray-200',
  number: 'bg-green-100 text-green-800 border-green-200',
};

export function FormulaInput({ tokens, onRemoveToken }: FormulaInputProps) {
  if (tokens.length === 0) {
    return (
      <div className="flex min-h-[56px] items-center justify-center rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-sm text-gray-400">
          Click metrics and operators below to build your formula
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[56px] flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      {tokens.map((token, index) => (
        <span
          key={index}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium',
            tokenStyles[token.type]
          )}
        >
          {token.value}
          <button
            onClick={() => onRemoveToken(index)}
            className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-black/10"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
