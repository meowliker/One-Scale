import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';
const normalizeTheme = (value: unknown): Theme => (value === 'light' ? 'light' : 'dark');

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme: normalizeTheme(theme) }),
      toggleTheme: () => set((state) => ({ theme: normalizeTheme(state.theme) === 'dark' ? 'light' : 'dark' })),
    }),
    { name: 'theme-preference' }
  )
);
