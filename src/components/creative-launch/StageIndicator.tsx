'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LaunchStage } from '@/types/creativeLaunch';

interface StageIndicatorProps {
  currentStage: LaunchStage;
  onStageClick?: (stage: LaunchStage) => void;
}

const STAGES: { stage: LaunchStage; label: string }[] = [
  { stage: 1, label: 'Discover' },
  { stage: 2, label: 'Select' },
  { stage: 3, label: 'Configure' },
  { stage: 4, label: 'Review' },
  { stage: 5, label: 'Monitor' },
];

export function StageIndicator({ currentStage, onStageClick }: StageIndicatorProps) {
  return (
    <div className="rounded-xl border border-border bg-surface px-6 py-5 shadow-sm">
      <div className="relative flex items-start justify-between">
        {/* Connecting lines — rendered behind circles */}
        <div className="pointer-events-none absolute left-0 right-0 top-[18px] flex items-center px-[calc(10%/2)]">
          {STAGES.slice(0, -1).map((_, i) => {
            const isCompleted = currentStage > i + 1;
            return (
              <div
                key={i}
                className="relative mx-1 h-[2px] flex-1 overflow-hidden rounded-full bg-border"
              >
                <motion.div
                  className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-blue-500 to-purple-600"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: isCompleted ? 1 : 0 }}
                  transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.08 }}
                />
              </div>
            );
          })}
        </div>

        {/* Stage circles + labels */}
        {STAGES.map(({ stage, label }) => {
          const isCompleted = currentStage > stage;
          const isCurrent = currentStage === stage;
          const isFuture = currentStage < stage;
          const isClickable = !!onStageClick && !isFuture;

          return (
            <div
              key={stage}
              className="relative z-10 flex flex-col items-center gap-2"
            >
              {/* Ping ring — current stage only */}
              {isCurrent && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2">
                  <span className="relative flex h-9 w-9 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500/30 dark:bg-purple-500/30" />
                  </span>
                </span>
              )}

              <motion.button
                onClick={isClickable ? () => onStageClick(stage) : undefined}
                disabled={!isClickable}
                whileHover={isClickable ? { scale: 1.08 } : undefined}
                whileTap={isClickable ? { scale: 0.95 } : undefined}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold transition-all duration-300',
                  isCompleted && 'border-transparent bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/20 dark:shadow-purple-600/25',
                  isCurrent && 'border-blue-500 bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-lg shadow-blue-500/30 dark:border-purple-500 dark:shadow-purple-600/30',
                  isFuture && 'border-border bg-surface text-text-muted'
                )}
              >
                {isCompleted ? (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </motion.span>
                ) : (
                  <span className={cn(isFuture && 'opacity-40')}>{stage}</span>
                )}
              </motion.button>

              <span
                className={cn(
                  'text-[11px] font-medium transition-colors duration-300',
                  isCompleted && 'text-blue-600 dark:text-purple-400',
                  isCurrent && 'text-blue-600 dark:text-purple-300',
                  isFuture && 'text-text-muted opacity-50'
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
