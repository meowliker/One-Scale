import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeProps['variant'], string> = {
  success: 'border-emerald-400/40 text-emerald-600 dark:text-emerald-400',
  warning: 'border-amber-400/40 text-amber-600 dark:text-amber-400',
  danger: 'border-red-400/40 text-red-500 dark:text-red-400',
  info: 'border-blue-400/40 text-blue-600 dark:text-blue-400',
  default: 'border-border text-text-muted',
};

export function Badge({ children, variant, size = 'md' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
        variantClasses[variant]
      )}
    >
      {children}
    </span>
  );
}
