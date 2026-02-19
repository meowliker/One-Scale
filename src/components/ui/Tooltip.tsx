'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  children: React.ReactNode;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const positionClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export function Tooltip({ children, content, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50 whitespace-nowrap rounded-md bg-surface-elevated px-2.5 py-1.5 text-xs font-medium text-text-primary shadow-lg shadow-black/20 pointer-events-none border border-border',
            positionClasses[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
