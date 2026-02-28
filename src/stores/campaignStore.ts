import { create } from 'zustand';

const EXPANDED_CAMPAIGNS_KEY = 'onescale_expanded_campaigns';
const EXPANDED_ADSETS_KEY = 'onescale_expanded_adsets';

function readSessionSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function writeSessionSet(key: string, s: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...s]));
  } catch { /* ignore */ }
}

interface CampaignStoreState {
  selectedIds: Set<string>;
  expandedCampaigns: Set<string>;
  expandedAdSets: Set<string>;
  editingCell: { entityId: string; field: string } | null;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  toggleExpandCampaign: (id: string) => void;
  setExpandedCampaigns: (ids: Set<string>) => void;
  collapseAllCampaigns: () => void;
  toggleExpandAdSet: (id: string) => void;
  setEditing: (entityId: string, field: string) => void;
  clearEditing: () => void;
}

export const useCampaignStore = create<CampaignStoreState>()((set, get) => ({
  selectedIds: new Set(),
  expandedCampaigns: readSessionSet(EXPANDED_CAMPAIGNS_KEY),
  expandedAdSets: readSessionSet(EXPANDED_ADSETS_KEY),
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
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, next);
  },

  setExpandedCampaigns: (ids) => {
    set({ expandedCampaigns: ids });
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, ids);
  },

  collapseAllCampaigns: () => {
    const empty = new Set<string>();
    set({ expandedCampaigns: empty, expandedAdSets: empty });
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, empty);
    writeSessionSet(EXPANDED_ADSETS_KEY, empty);
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
    writeSessionSet(EXPANDED_ADSETS_KEY, next);
  },

  setEditing: (entityId, field) => {
    set({ editingCell: { entityId, field } });
  },

  clearEditing: () => {
    set({ editingCell: null });
  },
}));
