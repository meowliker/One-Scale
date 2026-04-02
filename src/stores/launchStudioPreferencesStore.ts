import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type LaunchStudioBrowserMode = 'all_assets' | 'by_task' | 'by_folder';
export type LaunchStudioSelectionViewMode = 'table' | 'grid' | 'compact' | 'list' | 'board' | 'focus';
export type LaunchStudioDensity = 'compact' | 'comfortable';
export type LaunchStudioHeaderVariant = 'slimbar' | 'splitbar' | 'chipbar';
export type LaunchStudioPlannerVariant = 'option1' | 'option2' | 'option3';
export type LaunchStudioTheme = 'light' | 'dark';

interface LaunchStudioPreference {
  browserMode: LaunchStudioBrowserMode;
  selectionViewMode: LaunchStudioSelectionViewMode;
  density: LaunchStudioDensity;
  headerVariant: LaunchStudioHeaderVariant;
  plannerVariant: LaunchStudioPlannerVariant;
  theme: LaunchStudioTheme;
  activeStep?: 'select' | 'batch' | 'schedule';
}

interface LaunchStudioPreferencesState {
  preferences: Record<string, LaunchStudioPreference>;
  getPreference: (key: string) => LaunchStudioPreference | null;
  setPreference: (key: string, partial: Partial<LaunchStudioPreference>) => void;
}

const DEFAULT_PREFERENCE: LaunchStudioPreference = {
  browserMode: 'all_assets',
  selectionViewMode: 'table',
  density: 'compact',
  headerVariant: 'slimbar',
  plannerVariant: 'option1',
  theme: 'light',
  activeStep: 'select',
};

export const useLaunchStudioPreferencesStore = create<LaunchStudioPreferencesState>()(
  persist(
    (set, get) => ({
      preferences: {},
      getPreference: (key) => get().preferences[key] || null,
      setPreference: (key, partial) => {
        const current = get().preferences[key] || DEFAULT_PREFERENCE;
        set({
          preferences: {
            ...get().preferences,
            [key]: {
              ...current,
              ...partial,
            },
          },
        });
      },
    }),
    { name: 'launch-studio-preferences' },
  ),
);
