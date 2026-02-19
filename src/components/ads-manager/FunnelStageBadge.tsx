'use client';

import { cn } from '@/lib/utils';
import { funnelStages, objectiveToFunnel } from '@/data/mockFunnelStages';
import type { FunnelStage } from '@/data/mockFunnelStages';

interface FunnelStageBadgeProps {
  /** Pass either a funnel stage directly or a campaign objective string */
  stage?: FunnelStage;
  objective?: string;
  className?: string;
}

export function FunnelStageBadge({ stage, objective, className }: FunnelStageBadgeProps) {
  const resolvedStage = stage ?? (objective ? objectiveToFunnel[objective] : undefined);

  if (!resolvedStage) return null;

  const config = funnelStages.find((f) => f.stage === resolvedStage);
  if (!config) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        config.bgColor,
        config.color,
        config.borderColor,
        className
      )}
    >
      {config.label}
    </span>
  );
}
