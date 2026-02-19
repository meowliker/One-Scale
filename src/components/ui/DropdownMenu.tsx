'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface DropdownMenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
}

export function DropdownMenu({ trigger, items, align = 'right' }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={menuRef}>
      <div onClick={() => setOpen((prev) => !prev)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[160px] rounded-lg border border-border bg-surface-elevated py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-text-secondary hover:bg-surface-hover'
              )}
            >
              {item.icon && <span className="h-4 w-4">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
