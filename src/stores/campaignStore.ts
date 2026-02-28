import { create } from 'zustand';

// --- sessionStorage helpers ---
function readSessionSet(key: string): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeSessionSet(key: string, set: Set<string>): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore write failures
  }
}

const EXPANDED_CAMPAIGNS_KEY = 'expandedCampaigns';
const EXPANDED_ADSETS_KEY = 'expandedAdSets';

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
  setExpandedCampaigns: (ids: Set<string>) => void;
  collapseAllCampaigns: () => void;
  setEditing: (entityId: string, field: string) => void;
  clearEditing: () => void;
}

function initExpandedCampaigns(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return readSessionSet(EXPANDED_CAMPAIGNS_KEY);
}

function initExpandedAdSets(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  return readSessionSet(EXPANDED_ADSETS_KEY);
}

export const useCampaignStore = create<CampaignStoreState>()((set, get) => ({
  selectedIds: new Set(),
  expandedCampaigns: initExpandedCampaigns(),
  expandedAdSets: initExpandedAdSets(),
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
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, next);
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
    writeSessionSet(EXPANDED_ADSETS_KEY, next);
    set({ expandedAdSets: next });
  },

  setExpandedCampaigns: (ids) => {
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, ids);
    set({ expandedCampaigns: ids });
  },

  collapseAllCampaigns: () => {
    const empty = new Set<string>();
    writeSessionSet(EXPANDED_CAMPAIGNS_KEY, empty);
    writeSessionSet(EXPANDED_ADSETS_KEY, empty);
    set({ expandedCampaigns: empty, expandedAdSets: empty });
  },

  setEditing: (entityId, field) => {
    set({ editingCell: { entityId, field } });
  },

  clearEditing: () => {
    set({ editingCell: null });
  },
}));
