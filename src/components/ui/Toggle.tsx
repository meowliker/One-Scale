'use client';

import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, disabled = false, loading = false, size = 'md' }: ToggleProps) {
  const isSm = size === 'sm';
  const trackSize = isSm ? 'w-8 h-[18px]' : 'w-11 h-6';
  const thumbSize = isSm ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const thumbTranslate = isSm ? 'translate-x-3.5' : 'translate-x-5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled || loading}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        'transition-all duration-200 ease-in-out',
        trackSize,
        checked ? 'bg-[#34c759]' : 'bg-[#aeaeb2]',
        (disabled || loading) && 'cursor-not-allowed opacity-60'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block transform rounded-full bg-white shadow-sm ring-0',
          'transition-all duration-200 ease-in-out',
          thumbSize,
          checked ? thumbTranslate : 'translate-x-0'
        )}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className={cn(
              'rounded-full border-[1.5px] border-transparent animate-spin',
              checked ? 'border-t-[#34c759]' : 'border-t-[#aeaeb2]',
              isSm ? 'h-2 w-2' : 'h-3 w-3'
            )} />
          </span>
        )}
      </span>
    </button>
  );
}
