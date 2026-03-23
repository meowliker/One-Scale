'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface UploadProgressBarProps {
  progress: number;
  status?: 'uploading' | 'ready' | 'failed';
  showLabel?: boolean;
  className?: string;
}

export function UploadProgressBar({
  progress,
  status = 'uploading',
  showLabel = false,
  className,
}: UploadProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  const fillColor =
    status === 'ready'
      ? 'bg-emerald-500'
      : status === 'failed'
        ? 'bg-red-500'
        : 'bg-blue-500';

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <p className="text-xs text-text-secondary mb-1 tabular-nums">
          {status === 'ready'
            ? 'Complete'
            : status === 'failed'
              ? 'Failed'
              : `${Math.round(clampedProgress)}%`}
        </p>
      )}
      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', fillColor)}
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}
