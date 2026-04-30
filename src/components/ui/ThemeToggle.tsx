'use client';

import { useRef, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Use click coordinates directly for more accurate ripple origin
    const x = e.clientX;
    const y = e.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );
    document.documentElement.style.setProperty('--toggle-x', `${x}px`);
    document.documentElement.style.setProperty('--toggle-y', `${y}px`);
    document.documentElement.style.setProperty('--toggle-end-radius', `${endRadius}px`);

    // Use View Transition API if supported for ripple effect
    if (typeof document !== 'undefined' && 'startViewTransition' in document) {
      (document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(() => {
        toggleTheme();
      });
    } else {
      toggleTheme();
    }
  }, [toggleTheme]);

  return (
    <button
      ref={buttonRef}
      onClick={handleToggle}
      className={cn(
        'relative flex h-8 w-14 items-center rounded-full border p-1 transition-colors duration-300',
        isDark ? 'border-border bg-surface-hover' : 'border-border bg-surface',
        className
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300',
          isDark
            ? 'translate-x-0 bg-surface-elevated'
            : 'translate-x-6 bg-surface-elevated shadow-sm'
        )}
      >
        <div key={theme} className="theme-icon-enter">
          {isDark ? (
            <Moon className="h-3.5 w-3.5 text-primary-light" />
          ) : (
            <Sun className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
      </div>
    </button>
  );
}
