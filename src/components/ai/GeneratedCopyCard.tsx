'use client';

import { ClipboardCopy, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import type { GeneratedCopy } from '@/data/mockAICopy';

interface GeneratedCopyCardProps {
  copy: GeneratedCopy;
}

const frameworkVariant: Record<GeneratedCopy['framework'], 'info' | 'warning' | 'danger' | 'success' | 'default'> = {
  AIDA: 'info',
  FOMO: 'danger',
  PAS: 'warning',
  BAB: 'success',
  FAB: 'default',
};

const toneVariant: Record<GeneratedCopy['tone'], 'info' | 'warning' | 'danger' | 'success' | 'default'> = {
  professional: 'info',
  casual: 'success',
  urgent: 'danger',
  emotional: 'warning',
  humorous: 'default',
};

function getScoreColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getScoreTextColor(score: number): string {
  if (score >= 70) return 'text-green-700';
  if (score >= 40) return 'text-yellow-700';
  return 'text-red-700';
}

export function GeneratedCopyCard({ copy }: GeneratedCopyCardProps) {
  async function handleCopyToClipboard() {
    const fullText = `${copy.primaryText}\n\nHeadline: ${copy.headline}\nDescription: ${copy.description}\nCTA: ${copy.cta}`;
    try {
      await navigator.clipboard.writeText(fullText);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  }

  function handleUseInAd() {
    toast.success('Copy added to ad builder');
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Badge variant={frameworkVariant[copy.framework]}>{copy.framework}</Badge>
          <Badge variant={toneVariant[copy.tone]}>
            {copy.tone.charAt(0).toUpperCase() + copy.tone.slice(1)}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn('text-xs font-semibold', getScoreTextColor(copy.score))}>
            {copy.score}
          </span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>

      {/* Confidence Score Bar */}
      <div className="px-4 pb-3">
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className={cn('h-1.5 rounded-full transition-all', getScoreColor(copy.score))}
            style={{ width: `${copy.score}%` }}
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4 space-y-3">
        {/* Primary Text */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Primary Text
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">{copy.primaryText}</p>
        </div>

        {/* Headline */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Headline
          </p>
          <p className="text-sm font-bold text-gray-900">{copy.headline}</p>
        </div>

        {/* Description */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
            Description
          </p>
          <p className="text-sm text-gray-600">{copy.description}</p>
        </div>

        {/* CTA */}
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">CTA</p>
          <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {copy.cta}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-3 mt-2 border-t border-gray-100">
        <button
          onClick={handleCopyToClipboard}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          Copy
        </button>
        <button
          onClick={handleUseInAd}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <Zap className="h-3.5 w-3.5" />
          Use in Ad
        </button>
      </div>
    </div>
  );
}
