'use client';

import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative flex h-8 w-14 items-center rounded-full p-1 transition-colors duration-300',
        isDark ? 'bg-surface-hover' : 'bg-primary/15',
        className
      )}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <div
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300',
          isDark
            ? 'translate-x-0 bg-surface-elevated'
            : 'translate-x-6 bg-white shadow-sm'
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-primary-light" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-primary" />
        )}
      </div>
    </button>
  );
}
