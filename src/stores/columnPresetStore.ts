import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MetricKey, ColumnPreset } from '@/types/metrics';
import { defaultColumnPresets } from '@/data/metricDefinitions';
import { useStoreStore } from '@/stores/storeStore';

interface ColumnPresetState {
  activePresetId: string;
  customPresets: ColumnPreset[];
  visibleColumns: MetricKey[];
  columnOrder: MetricKey[];
  serverPresetsLoaded: boolean;
  setPreset: (presetId: string) => void;
  addColumn: (key: MetricKey) => void;
  removeColumn: (key: MetricKey) => void;
  reorderColumns: (columns: MetricKey[]) => void;
  saveCustomPreset: (name: string) => Promise<void>;
  deletePreset: (presetId: string) => Promise<void>;
  loadPresetsFromServer: () => Promise<void>;
}

export const useColumnPresetStore = create<ColumnPresetState>()(
  persist(
    (set, get) => ({
      activePresetId: 'performance',
      customPresets: [],
      visibleColumns: defaultColumnPresets[0].columns,
      columnOrder: defaultColumnPresets[0].columns,
      serverPresetsLoaded: false,

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

      saveCustomPreset: async (name) => {
        const { visibleColumns, customPresets } = get();
        const storeId = useStoreStore.getState().activeStoreId;
        const newPreset: ColumnPreset = {
          id: `custom-${Date.now()}`,
          name,
          columns: visibleColumns,
          isDefault: false,
          isCustom: true,
        };
        set({ customPresets: [...customPresets, newPreset], activePresetId: newPreset.id });

        // Persist to server if storeId is available
        if (storeId) {
          try {
            await fetch('/api/column-presets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeId, id: newPreset.id, name: newPreset.name, columns: newPreset.columns }),
            });
          } catch {
            // Silent fail - local state is already updated
          }
        }
      },

      deletePreset: async (presetId) => {
        const { customPresets } = get();
        const storeId = useStoreStore.getState().activeStoreId;
        set({ customPresets: customPresets.filter((p) => p.id !== presetId) });

        if (storeId) {
          try {
            await fetch(`/api/column-presets?id=${encodeURIComponent(presetId)}&storeId=${encodeURIComponent(storeId)}`, {
              method: 'DELETE',
            });
          } catch {
            // Silent fail
          }
        }
      },

      loadPresetsFromServer: async () => {
        const storeId = useStoreStore.getState().activeStoreId;
        if (!storeId || get().serverPresetsLoaded) return;
        try {
          const res = await fetch(`/api/column-presets?storeId=${encodeURIComponent(storeId)}`);
          if (!res.ok) return;
          const json = await res.json() as { data: Array<{ id: string; name: string; columns: string[] }> };
          if (!json.data?.length) return;

          const serverPresets: ColumnPreset[] = json.data.map((p) => ({
            id: p.id,
            name: p.name,
            columns: p.columns as MetricKey[],
            isDefault: false,
            isCustom: true,
          }));

          // Merge server presets with local ones (server wins on id conflicts)
          const localPresets = get().customPresets;
          const merged = [...localPresets];
          for (const sp of serverPresets) {
            if (!merged.find((lp) => lp.id === sp.id)) {
              merged.push(sp);
            }
          }
          set({ customPresets: merged, serverPresetsLoaded: true });
        } catch {
          // Silent fail
        }
      },
    }),
    { name: 'column-presets' }
  )
);
