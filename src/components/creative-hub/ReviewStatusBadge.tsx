'use client';

import { cn } from '@/lib/utils';
import type { ReviewStatus } from '@/types/creativeHub';

interface ReviewStatusBadgeProps {
  status: ReviewStatus;
  reason?: string;
}

const statusConfig: Record<ReviewStatus, { label: string; bg: string; text: string }> = {
  IN_REVIEW: { label: 'Under Review', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
  ACTIVE: { label: 'Active', bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400' },
  DISAPPROVED: { label: 'Rejected', bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400' },
  WITH_ISSUES: { label: 'Issues', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400' },
};

export function ReviewStatusBadge({ status, reason }: ReviewStatusBadgeProps) {
  const config = statusConfig[status];
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
        config.bg,
        config.text
      )}
      title={status === 'DISAPPROVED' && reason ? reason : undefined}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          status === 'ACTIVE' && 'bg-emerald-500',
          status === 'IN_REVIEW' && 'bg-amber-500',
          status === 'DISAPPROVED' && 'bg-red-500',
          status === 'WITH_ISSUES' && 'bg-amber-500'
        )}
      />
      {config.label}
    </span>
  );
}
