import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md';
}

const variantClasses: Record<BadgeProps['variant'], string> = {
  success: 'border-emerald-300/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warning: 'border-amber-300/50 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  danger: 'border-red-300/50 bg-red-500/10 text-red-700 dark:text-red-300',
  info: 'border-blue-300/50 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  default: 'border-border bg-surface-hover text-text-secondary',
};

export function Badge({ children, variant, size = 'md' }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px] tracking-wide',
        variantClasses[variant]
      )}
    >
      {children}
    </span>
  );
}
