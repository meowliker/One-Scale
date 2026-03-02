'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    const safeTheme = theme === 'light' ? 'light' : 'dark';
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(safeTheme);
    if (safeTheme !== theme) setTheme(safeTheme);
  }, [theme, setTheme]);

  return <>{children}</>;
}
