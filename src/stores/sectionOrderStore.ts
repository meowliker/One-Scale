import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const DEFAULT_SECTION_ORDER = [
  'live-strip',
  'metrics-row',
  'charts',
  'conversion-funnel',
  'campaigns-table',
  'health-audit',
  'funnel-breakdown',
  'cross-channel',
] as const;

export type SectionId = (typeof DEFAULT_SECTION_ORDER)[number];

interface SavedView {
  id: string;
  name: string;
  order: string[];
}

interface SectionOrderState {
  sectionOrder: string[];
  savedViews: SavedView[];
  activeViewId: string | null;
  setSectionOrder: (order: string[]) => void;
  saveView: (name: string) => void;
  loadView: (viewId: string) => void;
  deleteView: (viewId: string) => void;
  resetToDefault: () => void;
}

export const useSectionOrderStore = create<SectionOrderState>()(
  persist(
    (set, get) => ({
      sectionOrder: [...DEFAULT_SECTION_ORDER],
      savedViews: [],
      activeViewId: null,

      setSectionOrder: (order) => {
        set({ sectionOrder: order, activeViewId: null });
      },

      saveView: (name) => {
        const { sectionOrder, savedViews } = get();
        const newView: SavedView = {
          id: `view-${Date.now()}`,
          name,
          order: [...sectionOrder],
        };
        set({
          savedViews: [...savedViews, newView],
          activeViewId: newView.id,
        });
      },

      loadView: (viewId) => {
        const view = get().savedViews.find((v) => v.id === viewId);
        if (view) {
          set({ sectionOrder: [...view.order], activeViewId: viewId });
        }
      },

      deleteView: (viewId) => {
        const { savedViews, activeViewId } = get();
        set({
          savedViews: savedViews.filter((v) => v.id !== viewId),
          activeViewId: activeViewId === viewId ? null : activeViewId,
        });
      },

      resetToDefault: () => {
        set({
          sectionOrder: [...DEFAULT_SECTION_ORDER],
          activeViewId: null,
        });
      },
    }),
    { name: 'section-order' }
  )
);
