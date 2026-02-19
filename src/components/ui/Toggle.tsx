'use client';

import { cn } from '@/lib/utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

export function Toggle({ checked, onChange, disabled = false, size = 'md' }: ToggleProps) {
  const trackSize = size === 'sm' ? 'w-8 h-[18px]' : 'w-11 h-6';
  const thumbSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const thumbTranslate = size === 'sm' ? 'translate-x-3.5' : 'translate-x-5';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        trackSize,
        checked ? 'bg-primary' : 'bg-text-dimmed',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
          thumbSize,
          checked ? thumbTranslate : 'translate-x-0'
        )}
      />
    </button>
  );
}
