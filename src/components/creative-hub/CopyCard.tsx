'use client';

import { useState } from 'react';
import { Copy, Check, FlaskConical, Sparkles } from 'lucide-react';
import { cn, formatCurrency, formatRoas, formatPercentage } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { WinningCopy } from '@/types/creativeHub';

interface CopyCardProps {
  copy: WinningCopy;
  onUseInTest?: (copyId: string) => void;
}

export function CopyCard({ copy, onUseInTest }: CopyCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = [copy.primaryText, copy.headline, copy.description]
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const sourceDate = new Date(copy.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="rounded-xl border border-border bg-surface-elevated shadow-sm overflow-hidden">
      {/* Performance banner */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-surface border-b border-border">
        <span className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
          ROAS {formatRoas(copy.roas)}
        </span>
        <span className="text-xs text-text-secondary">
          {formatCurrency(copy.totalRevenue)} rev
        </span>
        <span className="text-xs text-text-secondary">
          {copy.totalPurchases} purchases
        </span>
        {copy.ctr != null && (
          <span className="text-xs text-text-secondary">
            {formatPercentage(copy.ctr)} CTR
          </span>
        )}
        {copy.isAiGenerated && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:text-purple-300">
            <Sparkles className="h-3 w-3" />
            AI Generated
          </span>
        )}
      </div>

      {/* Copy content */}
      <div className="px-4 py-4 space-y-3">
        {/* Primary text */}
        <div className="border-l-4 border-blue-300 dark:border-blue-500 pl-4">
          <p className="text-sm italic text-text-primary leading-relaxed whitespace-pre-wrap">
            {copy.primaryText}
          </p>
        </div>

        {/* Headline */}
        {copy.headline && (
          <p className="text-sm font-medium text-text-primary">{copy.headline}</p>
        )}

        {/* Description */}
        {copy.description && (
          <p className="text-sm text-text-secondary">{copy.description}</p>
        )}

        {/* CTA badge */}
        {copy.cta && (
          <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-0.5 text-[10px] font-medium text-text-muted">
            {copy.cta}
          </span>
        )}

        {/* Source info */}
        <p className="text-xs text-text-dimmed">
          Saved: {sourceDate}
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-text-secondary hover:bg-surface-hover'
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        <button
          onClick={() => onUseInTest?.(copy.id)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          Use in New Test
        </button>
      </div>
    </div>
  );
}
