'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  X, CheckSquare, Loader2, ExternalLink, Check, ChevronRight,
  Folder, List, Search, Minus, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClickUpStatusOption {
  name: string;
  color: string;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface Workspace { id: string; name: string }

interface TreeItem {
  type: 'space' | 'folder' | 'list';
  id: string;
  name: string;
  taskCount?: number | null;
  spaceId?: string;
  spaceName?: string;
  folderId?: string;
  folderName?: string;
  children?: TreeItem[];
}

interface SelectedList {
  id: string;
  name: string;
  spaceName: string;
  folderName?: string;
}

interface Props {
  storeId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type Step = 'token' | 'workspace' | 'list' | 'status';

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAllListIds(item: TreeItem): string[] {
  if (item.type === 'list') return [item.id];
  return (item.children || []).flatMap(getAllListIds);
}

function getAllLists(item: TreeItem): Array<{ id: string; name: string; spaceName: string; folderName?: string }> {
  if (item.type === 'list') {
    return [{ id: item.id, name: item.name, spaceName: item.spaceName || '', folderName: item.folderName }];
  }
  return (item.children || []).flatMap(getAllLists);
}

function matchesSearch(item: TreeItem, q: string): boolean {
  if (item.name.toLowerCase().includes(q)) return true;
  return (item.children || []).some((c) => matchesSearch(c, q));
}

function filterTree(items: TreeItem[], q: string): TreeItem[] {
  if (!q) return items;
  return items.reduce<TreeItem[]>((acc, item) => {
    if (item.type === 'list') {
      if (item.name.toLowerCase().includes(q)) acc.push(item);
    } else {
      const filteredChildren = filterTree(item.children || [], q);
      if (filteredChildren.length > 0 || item.name.toLowerCase().includes(q)) {
        acc.push({ ...item, children: filteredChildren });
      }
    }
    return acc;
  }, []);
}

// ── Checkbox component ────────────────────────────────────────────────────────
function Checkbox({ checked, indeterminate, onChange }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked || indeterminate
          ? 'border-primary bg-primary text-white'
          : 'border-border bg-surface hover:border-primary/60'
      )}
    >
      {indeterminate && !checked ? (
        <Minus className="h-2.5 w-2.5" />
      ) : checked ? (
        <Check className="h-2.5 w-2.5" />
      ) : null}
    </button>
  );
}

// ── Tree node ─────────────────────────────────────────────────────────────────
function TreeNode({
  item,
  depth,
  selectedIds,
  expandedFolders,
  onToggleList,
  onToggleFolder,
  onToggleExpand,
}: {
  item: TreeItem;
  depth: number;
  selectedIds: Set<string>;
  expandedFolders: Set<string>;
  onToggleList: (id: string, list: SelectedList) => void;
  onToggleFolder: (item: TreeItem) => void;
  onToggleExpand: (id: string) => void;
}) {
  if (item.type === 'space') {
    const spaceLists = getAllListIds(item);
    const selectedCount = spaceLists.filter((id) => selectedIds.has(id)).length;
    return (
      <div className="mb-1">
        <div
          className="flex items-center gap-2 px-2 py-1 cursor-pointer group"
          onClick={() => onToggleFolder(item)}
        >
          <Checkbox
            checked={selectedCount === spaceLists.length && spaceLists.length > 0}
            indeterminate={selectedCount > 0 && selectedCount < spaceLists.length}
            onChange={() => onToggleFolder(item)}
          />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted group-hover:text-text-secondary transition-colors flex-1">
            {item.name}
          </span>
          {selectedCount > 0 && (
            <span className="text-[10px] text-primary font-medium">{selectedCount}/{spaceLists.length}</span>
          )}
        </div>
        <div>
          {(item.children || []).map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              selectedIds={selectedIds}
              expandedFolders={expandedFolders}
              onToggleList={onToggleList}
              onToggleFolder={onToggleFolder}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </div>
      </div>
    );
  }

  if (item.type === 'folder') {
    const isExpanded = expandedFolders.has(item.id);
    const folderListIds = getAllListIds(item);
    const selectedCount = folderListIds.filter((id) => selectedIds.has(id)).length;
    return (
      <div style={{ paddingLeft: `${depth * 12}px` }}>
        <div
          className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer hover:bg-surface-hover transition-colors group"
          onClick={() => onToggleExpand(item.id)}
        >
          <Checkbox
            checked={selectedCount === folderListIds.length && folderListIds.length > 0}
            indeterminate={selectedCount > 0 && selectedCount < folderListIds.length}
            onChange={() => onToggleFolder(item)}
          />
          <ChevronRight
            className={cn('h-3 w-3 text-text-muted shrink-0 transition-transform', isExpanded && 'rotate-90')}
          />
          <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-sm font-medium text-text-primary truncate">{item.name}</span>
          {selectedCount > 0 && !isExpanded && (
            <span className="text-[10px] text-primary font-medium shrink-0">{selectedCount} selected</span>
          )}
          {folderListIds.length > 0 && (
            <span className="text-[10px] text-text-muted shrink-0">{folderListIds.length} lists</span>
          )}
        </div>
        {isExpanded && (
          <div>
            {(item.children || []).map((list) => (
              <TreeNode
                key={list.id}
                item={list}
                depth={depth + 1}
                selectedIds={selectedIds}
                expandedFolders={expandedFolders}
                onToggleList={onToggleList}
                onToggleFolder={onToggleFolder}
                onToggleExpand={onToggleExpand}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // List item
  const isSelected = selectedIds.has(item.id);
  return (
    <div
      style={{ paddingLeft: `${depth * 12}px` }}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors',
        isSelected ? 'bg-primary/8 hover:bg-primary/12' : 'hover:bg-surface-hover'
      )}
      onClick={() =>
        onToggleList(item.id, {
          id: item.id,
          name: item.name,
          spaceName: item.spaceName || '',
          folderName: item.folderName,
        })
      }
    >
      <Checkbox
        checked={isSelected}
        onChange={() =>
          onToggleList(item.id, {
            id: item.id,
            name: item.name,
            spaceName: item.spaceName || '',
            folderName: item.folderName,
          })
        }
      />
      <List className="h-3.5 w-3.5 text-text-muted shrink-0" />
      <span className={cn('flex-1 text-sm truncate', isSelected ? 'text-primary font-medium' : 'text-text-secondary')}>
        {item.name}
      </span>
      {item.taskCount != null && (
        <span className="text-[10px] text-text-muted shrink-0">{item.taskCount}</span>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function ClickUpConnectModal({ storeId, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>('token');
  const [apiToken, setApiToken] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMap, setSelectedMap] = useState<Map<string, SelectedList>>(new Map());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [readyStatus, setReadyStatus] = useState('');
  const [availableStatuses, setAvailableStatuses] = useState<ClickUpStatusOption[]>([]);
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const filteredTree = useMemo(() => filterTree(tree, search.toLowerCase().trim()), [tree, search]);
  const selectedIds = useMemo(() => new Set(selectedMap.keys()), [selectedMap]);

  const toggleList = (id: string, list: SelectedList) => {
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, list);
      return next;
    });
  };

  const toggleFolder = (item: TreeItem) => {
    const allLists = getAllLists(item);
    const allIds = allLists.map((l) => l.id);
    const allSelected = allIds.every((id) => selectedIds.has(id));
    setSelectedMap((prev) => {
      const next = new Map(prev);
      if (allSelected) {
        allIds.forEach((id) => next.delete(id));
      } else {
        allLists.forEach((l) => next.set(l.id, l));
      }
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleVerifyToken = async () => {
    if (!apiToken.trim()) { setError('Please enter your API token'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/integrations/clickup/workspaces?apiToken=${encodeURIComponent(apiToken.trim())}`);
      let data: { workspaces?: Workspace[]; error?: string } = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch { data = { error: 'Invalid response' }; }
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to connect');
      setWorkspaces(data.workspaces || []);
      if ((data.workspaces || []).length === 1) {
        const ws = data.workspaces![0];
        setSelectedWorkspace(ws);
        await fetchTree(ws.id);
        setStep('list');
      } else {
        setStep('workspace');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to ClickUp');
    } finally { setLoading(false); }
  };

  const fetchTree = async (workspaceId: string) => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/integrations/clickup/lists?apiToken=${encodeURIComponent(apiToken.trim())}&workspaceId=${workspaceId}`);
      let data: { tree?: TreeItem[]; error?: string } = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch { data = { error: 'Invalid response' }; }
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch lists');
      const treeData = data.tree || [];
      setTree(treeData);
      // Auto-expand all folders for better discoverability
      const folderIds = new Set<string>();
      const collectFolders = (items: TreeItem[]) => {
        for (const item of items) {
          if (item.type === 'folder') folderIds.add(item.id);
          if (item.children) collectFolders(item.children);
        }
      };
      collectFolders(treeData);
      setExpandedFolders(folderIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lists');
    } finally { setLoading(false); }
  };

  // Fetch statuses when moving to status step
  const fetchStatuses = async (listIds: string[]) => {
    if (listIds.length === 0) return;
    setStatusesLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/clickup/statuses?apiToken=${encodeURIComponent(apiToken.trim())}&listIds=${listIds.join(',')}`
      );
      let data: { statuses?: ClickUpStatusOption[]; error?: string } = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch { data = {}; }
      if (res.ok && data.statuses) {
        setAvailableStatuses(data.statuses);
        // Auto-select first status if none selected
        if (!readyStatus && data.statuses.length > 0) {
          setReadyStatus(data.statuses[0].name);
        }
      }
    } catch {
      // Non-fatal - user can still type manually
    } finally {
      setStatusesLoading(false);
    }
  };

  // When step changes to 'status', fetch available statuses
  useEffect(() => {
    if (step === 'status' && selectedMap.size > 0 && availableStatuses.length === 0) {
      fetchStatuses([...selectedMap.keys()]);
    }
  }, [step, selectedMap, availableStatuses.length, apiToken]);

  const handleSave = async () => {
    if (selectedMap.size === 0) { setError('Select at least one list'); return; }
    if (!readyStatus.trim()) { setError('Please select a status'); return; }
    setLoading(true); setError('');
    try {
      const listIds = [...selectedMap.keys()];
      const listNames = [...selectedMap.values()].map((l) => l.name);
      const res = await fetch('/api/integrations/clickup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          apiToken: apiToken.trim(),
          workspaceId: selectedWorkspace?.id,
          workspaceName: selectedWorkspace?.name,
          listIds,
          listNames,
          readyStatus: readyStatus.trim(),
        }),
      });
      let data: { success?: boolean; error?: string } = {};
      try {
        const text = await res.text();
        if (text) data = JSON.parse(text);
      } catch { data = { error: 'Invalid response' }; }
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally { setLoading(false); }
  };

  const steps: Step[] = ['token', 'workspace', 'list', 'status'];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface-elevated shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B68EE]/10">
              <CheckSquare className="h-5 w-5 text-[#7B68EE]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Connect ClickUp</h2>
              <p className="text-xs text-text-secondary">
                {step === 'token' && 'Enter your personal API token'}
                {step === 'workspace' && 'Select your workspace'}
                {step === 'list' && (selectedMap.size > 0 ? `${selectedMap.size} list${selectedMap.size !== 1 ? 's' : ''} selected` : 'Select lists to watch')}
                {step === 'status' && 'Set the ready-to-launch status'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 px-5 pt-3 shrink-0">
          {steps.map((s, i) => (
            <div key={s} className={cn('h-1 flex-1 rounded-full transition-colors', step === s ? 'bg-primary' : i < stepIdx ? 'bg-primary/40' : 'bg-border')} />
          ))}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
          {/* ── Step 1: Token ── */}
          {step === 'token' && (
            <>
              <p className="text-xs text-text-secondary">
                Get your token from{' '}
                <a href="https://app.clickup.com/settings/apps" target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-0.5 hover:underline">
                  ClickUp Settings → Apps <ExternalLink className="h-3 w-3" />
                </a>
              </p>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1.5">Personal API Token</label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyToken()}
                  placeholder="pk_••••••••••••••••••••••••"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={handleVerifyToken} disabled={loading || !apiToken.trim()} className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Verifying...' : 'Connect & Fetch Workspaces'}
              </button>
            </>
          )}

          {/* ── Step 2: Workspace ── */}
          {step === 'workspace' && (
            <>
              <p className="text-xs text-text-secondary">Choose your ClickUp workspace:</p>
              <div className="space-y-2">
                {workspaces.map((ws) => (
                  <button key={ws.id} onClick={async () => { setSelectedWorkspace(ws); await fetchTree(ws.id); setStep('list'); }} disabled={loading} className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50">
                    <span className="font-medium text-text-primary">{ws.name}</span>
                    {loading && selectedWorkspace?.id === ws.id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <ChevronRight className="h-4 w-4 text-text-secondary" />}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}

          {/* ── Step 3: List multi-select ── */}
          {step === 'list' && (
            <>
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search lists..."
                  className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>

              {/* Selection summary */}
              {selectedMap.size > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-primary/8 px-3 py-2">
                  <span className="text-xs font-medium text-primary">
                    {selectedMap.size} list{selectedMap.size !== 1 ? 's' : ''} selected
                  </span>
                  <button onClick={() => setSelectedMap(new Map())} className="text-[11px] text-primary/70 hover:text-primary underline">
                    Clear all
                  </button>
                </div>
              )}

              {/* Tree */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-surface p-2 space-y-0.5 min-h-[120px]">
                  {filteredTree.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-6">
                      {search ? 'No lists match your search.' : 'No lists found in this workspace.'}
                    </p>
                  )}
                  {filteredTree.map((space) => (
                    <TreeNode
                      key={space.id}
                      item={space}
                      depth={0}
                      selectedIds={selectedIds}
                      expandedFolders={expandedFolders}
                      onToggleList={toggleList}
                      onToggleFolder={toggleFolder}
                      onToggleExpand={toggleExpand}
                    />
                  ))}
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('workspace')} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                  Back
                </button>
                <button onClick={() => { if (selectedMap.size === 0) { setError('Select at least one list'); return; } setError(''); setStep('status'); }} disabled={selectedMap.size === 0} className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  Continue
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          )}

          {/* ── Step 4: Status ── */}
          {step === 'status' && (
            <>
              {/* Summary */}
              <div className="rounded-lg border border-border bg-surface p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-text-muted">Workspace</span>
                  <span className="font-medium text-text-primary">{selectedWorkspace?.name}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-text-muted">Selected lists ({selectedMap.size})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[...selectedMap.values()].map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary font-medium">
                        <List className="h-2.5 w-2.5" />
                        {l.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  &ldquo;Ready to Launch&rdquo; Status
                </label>
                <p className="text-[11px] text-text-muted mb-2">
                  Tasks with this status will appear in Creative Launch.
                </p>
                {statusesLoading ? (
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-xs text-text-muted">Loading statuses...</span>
                  </div>
                ) : availableStatuses.length > 0 ? (
                  <div className="relative">
                    <select
                      value={readyStatus}
                      onChange={(e) => setReadyStatus(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2.5 pr-10 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors cursor-pointer"
                    >
                      <option value="">Select a status...</option>
                      {availableStatuses.map((status) => (
                        <option key={status.name} value={status.name}>
                          {status.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={readyStatus}
                    onChange={(e) => setReadyStatus(e.target.value)}
                    placeholder="e.g. ready to launch"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                )}
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep('list')} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                  Back
                </button>
                <button onClick={handleSave} disabled={loading} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {loading ? 'Saving...' : 'Save & Connect'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
