import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MetricKey, ColumnPreset } from '@/types/metrics';
import { defaultColumnPresets } from '@/data/metricDefinitions';

interface ColumnPresetState {
  activePresetId: string;
  customPresets: ColumnPreset[];
  visibleColumns: MetricKey[];
  columnOrder: MetricKey[];
  setPreset: (presetId: string) => void;
  addColumn: (key: MetricKey) => void;
  removeColumn: (key: MetricKey) => void;
  reorderColumns: (columns: MetricKey[]) => void;
  saveCustomPreset: (name: string) => void;
  deletePreset: (presetId: string) => void;
}

export const useColumnPresetStore = create<ColumnPresetState>()(
  persist(
    (set, get) => ({
      activePresetId: 'performance',
      customPresets: [],
      visibleColumns: defaultColumnPresets[0].columns,
      columnOrder: defaultColumnPresets[0].columns,

      setPreset: (presetId) => {
        const allPresets = [...defaultColumnPresets, ...get().customPresets];
        const preset = allPresets.find((p) => p.id === presetId);
        if (preset) {
          set({
            activePresetId: presetId,
            visibleColumns: preset.columns,
            columnOrder: preset.columns,
          });
        }
      },

      addColumn: (key) => {
        const { visibleColumns, columnOrder } = get();
        if (!visibleColumns.includes(key)) {
          set({
            visibleColumns: [...visibleColumns, key],
            columnOrder: [...columnOrder, key],
          });
        }
      },

      removeColumn: (key) => {
        const { visibleColumns, columnOrder } = get();
        set({
          visibleColumns: visibleColumns.filter((c) => c !== key),
          columnOrder: columnOrder.filter((c) => c !== key),
        });
      },

      reorderColumns: (columns) => {
        set({ columnOrder: columns, visibleColumns: columns });
      },

      saveCustomPreset: (name) => {
        const { visibleColumns, customPresets } = get();
        const newPreset: ColumnPreset = {
          id: `custom-${Date.now()}`,
          name,
          columns: visibleColumns,
          isDefault: false,
          isCustom: true,
        };
        set({ customPresets: [...customPresets, newPreset] });
      },

      deletePreset: (presetId) => {
        const { customPresets } = get();
        set({ customPresets: customPresets.filter((p) => p.id !== presetId) });
      },
    }),
    { name: 'column-presets' }
  )
);
