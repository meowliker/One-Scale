import { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export function SectionCard({
  title,
  action,
  children,
  className,
  headerClassName,
  bodyClassName,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_22px_60px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(8,16,30,0.92)_0%,rgba(7,14,26,0.98)_100%)] dark:shadow-[0_24px_56px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center justify-between border-b border-slate-200/80 px-5 py-3.5 dark:border-white/10',
          headerClassName,
        )}
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {title}
        </h3>
        {action}
      </div>
      <div className={cn('p-5', bodyClassName)}>{children}</div>
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
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all',
        active
          ? 'border-sky-600 bg-sky-600 text-white shadow-[0_14px_26px_rgba(14,165,233,0.22)]'
          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200 dark:hover:bg-white/[0.06]',
      )}
    >
      <span
        className={cn(
          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
          active
            ? 'bg-white/15 text-white'
            : completed
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200'
              : 'bg-slate-100 text-slate-500 dark:bg-white/[0.05] dark:text-slate-400',
        )}
      >
        {completed ? <Check className="h-3.5 w-3.5" /> : null}
      </span>
      {label}
    </button>
  );
}

export function StepSummaryCard({
  eyebrow,
  title,
  description,
  actionLabel,
  onAction,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-[22px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] p-3.5 shadow-[0_18px_42px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(8,16,30,0.92)_0%,rgba(7,14,26,0.98)_100%)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </p>
          <h3 className="mt-1 text-[15px] font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
          <p className="mt-1 line-clamp-4 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        {actionLabel && onAction ? (
          <button
            onClick={onAction}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200 dark:hover:bg-white/[0.08]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children ? <div className="mt-2.5">{children}</div> : null}
    </section>
  );
}
