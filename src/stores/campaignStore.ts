import { create } from 'zustand';

interface CampaignStoreState {
  selectedIds: Set<string>;
  expandedCampaigns: Set<string>;
  expandedAdSets: Set<string>;
  editingCell: { entityId: string; field: string } | null;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  toggleExpandCampaign: (id: string) => void;
  toggleExpandAdSet: (id: string) => void;
  setEditing: (entityId: string, field: string) => void;
  clearEditing: () => void;
}

export const useCampaignStore = create<CampaignStoreState>()((set, get) => ({
  selectedIds: new Set(),
  expandedCampaigns: new Set(),
  expandedAdSets: new Set(),
  editingCell: null,

  toggleSelection: (id) => {
    const { selectedIds } = get();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next });
  },

  selectAll: (ids) => {
    set({ selectedIds: new Set(ids) });
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },

  toggleExpandCampaign: (id) => {
    const { expandedCampaigns } = get();
    const next = new Set(expandedCampaigns);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ expandedCampaigns: next });
  },

  toggleExpandAdSet: (id) => {
    const { expandedAdSets } = get();
    const next = new Set(expandedAdSets);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ expandedAdSets: next });
  },

  setEditing: (entityId, field) => {
    set({ editingCell: { entityId, field } });
  },

  clearEditing: () => {
    set({ editingCell: null });
  },
}));
