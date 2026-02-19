'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  indeterminate?: boolean;
}

export function Checkbox({ checked, onChange, indeterminate = false }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className={cn(
        'h-4 w-4 cursor-pointer rounded border-border-light text-primary-light focus:ring-2 focus:ring-primary focus:ring-offset-1',
        indeterminate && 'indeterminate:bg-primary'
      )}
    />
  );
}
