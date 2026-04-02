'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BatchStrategy } from '@/types/creativeHub';

export type AiTab = 'brief' | 'chat';

export interface SelectionDiagnostics {
  title: string;
  reason: string;
  recommendedStrategy: BatchStrategy;
  recommendedSize: number;
  laneCount: number;
  totalDailyBudget: number;
  uniqueAngles: number;
  uniqueHooks: number;
  uniqueCreators: number;
  uniqueFolders: number;
  uniqueFormats: number;
  warnings: string[];
  strengths: string[];
}

export function truncate(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function getStrategyLabel(strategy: BatchStrategy): string {
  switch (strategy) {
    case 'smart_mix':
      return 'Control vs challengers';
    case 'one_per_adset':
      return 'One per ad set';
    case 'by_format':
      return 'Format split';
    case 'by_folder':
      return 'Folder split';
    case 'shuffle':
      return 'Shuffle';
    case 'sequential':
      return 'Sequential';
    default:
      return 'Manual';
  }
}

export function getAiModeLabel(mode?: string): string {
  switch (mode) {
    case 'history-plus-selection':
      return 'History + selection';
    case 'product-history':
      return 'Product history';
    case 'selection-only':
      return 'Selection brief';
    case 'meta-plus-creative':
      return 'Claude + Meta';
    case 'creative-only':
      return 'Claude planning';
    case 'meta-disabled-fallback':
    case 'creative-fallback':
    case 'meta-fallback-after-error':
    case 'creative-fallback-after-error':
    case 'meta-fallback-after-timeout':
    case 'creative-fallback-after-timeout':
      return 'Fallback planning';
    default:
      return 'Planning';
  }
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-slate-800 bg-[#11192c] shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StudioStepButton({
  label,
  active,
  completed,
  onClick,
}: {
  label: string;
  active: boolean;
  completed?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
        active
          ? 'bg-[#7c6cff] text-white shadow-[0_16px_28px_rgba(124,108,255,0.28)]'
          : 'bg-[#0d1527] text-slate-300 ring-1 ring-slate-700 hover:bg-slate-800',
      )}
    >
      <span
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
          active
            ? 'bg-white/15 text-white'
            : completed
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-slate-800 text-slate-500',
        )}
      >
        {completed ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      {label}
    </button>
  );
}
