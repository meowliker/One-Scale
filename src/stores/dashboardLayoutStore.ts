import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WidgetConfig } from '@/types/dashboard';

interface DashboardLayoutState {
  widgets: WidgetConfig[];
  isEditMode: boolean;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (widgetId: string) => void;
  moveWidget: (widgetId: string, position: { x: number; y: number }) => void;
  resizeWidget: (widgetId: string, size: { w: number; h: number }) => void;
  toggleEditMode: () => void;
  resetLayout: (widgets: WidgetConfig[]) => void;
}

export const useDashboardLayoutStore = create<DashboardLayoutState>()(
  persist(
    (set, get) => ({
      widgets: [],
      isEditMode: false,

      addWidget: (widget) => {
        set({ widgets: [...get().widgets, widget] });
      },

      removeWidget: (widgetId) => {
        set({ widgets: get().widgets.filter((w) => w.id !== widgetId) });
      },

      moveWidget: (widgetId, position) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId ? { ...w, position: { ...w.position, ...position } } : w
          ),
        });
      },

      resizeWidget: (widgetId, size) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId ? { ...w, position: { ...w.position, ...size } } : w
          ),
        });
      },

      toggleEditMode: () => {
        set({ isEditMode: !get().isEditMode });
      },

      resetLayout: (widgets) => {
        set({ widgets });
      },
    }),
    { name: 'dashboard-layout' }
  )
);
