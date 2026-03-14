// src/stores/smartFilterStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MetricKey } from '@/types/metrics';

export interface ColumnValueFilter {
  metricKey: MetricKey;
  min: number | null;
  max: number | null;
}

export interface SavedFilter {
  id: string;
  name: string;
  emoji: string;
  roasMin: number | null;
  roasMax: number | null;
  cpaMin: number | null;
  cpaMax: number | null;
  spendMin: number | null;
  spendMax: number | null;
  ctrMin: number | null;
  statusFilter: 'all' | 'ACTIVE' | 'PAUSED';
}

export type SmartSegmentId =
  | 'kill-list'
  | 'needs-review'
  | 'scale-now'
  | 'top-7d'
  | 'learning'
  | 'fatigue'
  | null;

export type SegmentDays = 3 | 7;

interface SmartFilterStore {
  activeSegment: SmartSegmentId;
  setActiveSegment: (seg: SmartSegmentId) => void;
  
  segmentDays: SegmentDays;
  setSegmentDays: (days: SegmentDays) => void;

  columnFilters: ColumnValueFilter[];
  setColumnFilter: (filter: ColumnValueFilter) => void;
  removeColumnFilter: (key: MetricKey) => void;
  clearColumnFilters: () => void;

  savedFilters: SavedFilter[];
  activeSavedFilterId: string | null;
  saveFilter: (f: Omit<SavedFilter, 'id'>) => void;
  deleteSavedFilter: (id: string) => void;
  setActiveSavedFilter: (id: string | null) => void;
}

export const useSmartFilterStore = create<SmartFilterStore>()(
  persist(
    (set, get) => ({
      activeSegment: null,
      setActiveSegment: (seg) => set({ activeSegment: seg, activeSavedFilterId: null }),
      
      segmentDays: 7,
      setSegmentDays: (days) => set({ segmentDays: days }),

      columnFilters: [],
      setColumnFilter: (filter) => set((s) => ({
        columnFilters: [
          ...s.columnFilters.filter((f) => f.metricKey !== filter.metricKey),
          filter,
        ],
      })),
      removeColumnFilter: (key) => set((s) => ({
        columnFilters: s.columnFilters.filter((f) => f.metricKey !== key),
      })),
      clearColumnFilters: () => set({ columnFilters: [] }),

      savedFilters: [],
      activeSavedFilterId: null,
      saveFilter: (f) => {
        const id = `custom-${Date.now()}`;
        set((s) => ({ savedFilters: [...s.savedFilters, { ...f, id }], activeSavedFilterId: id }));
      },
      deleteSavedFilter: (id) => set((s) => ({
        savedFilters: s.savedFilters.filter((f) => f.id !== id),
        activeSavedFilterId: s.activeSavedFilterId === id ? null : s.activeSavedFilterId,
      })),
      setActiveSavedFilter: (id) => set({ activeSavedFilterId: id, activeSegment: null }),
    }),
    { name: 'smart-filters' }
  )
);
