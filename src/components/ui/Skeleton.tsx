import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'full';
}

export function Skeleton({ className, width, height, rounded = 'md' }: SkeletonProps) {
  const roundedClass = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }[rounded];

  return (
    <div
      className={cn('animate-pulse bg-surface-hover', roundedClass, className)}
      style={{ width: width ?? undefined, height: height ?? undefined }}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('apple-card p-3 space-y-2', className)}>
      <Skeleton width="60%" height="10px" rounded="sm" />
      <Skeleton width="40%" height="20px" rounded="sm" />
      <Skeleton width="100%" height="24px" rounded="sm" />
    </div>
  );
}

export function SkeletonTableRow({ columns = 6 }: { columns?: number }) {
  return (
    <tr className="border-b border-border-light">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Skeleton width={i === 0 ? '70%' : '50%'} height="12px" rounded="sm" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonChart({ className }: { className?: string }) {
  return (
    <div className={cn('apple-card p-4 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Skeleton width="120px" height="12px" rounded="sm" />
        <Skeleton width="80px" height="10px" rounded="sm" />
      </div>
      <Skeleton width="100%" height="160px" rounded="md" />
    </div>
  );
}
