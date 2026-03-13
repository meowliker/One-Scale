'use client';

import { useState } from 'react';
import { X, CheckSquare, Loader2, ExternalLink, Check, ChevronRight, Folder, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Workspace {
  id: string;
  name: string;
}

interface TreeItem {
  type: 'space' | 'folder' | 'list';
  id: string;
  name: string;
  taskCount?: number | null;
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

// ── Tree node renderer ────────────────────────────────────────────────────────
function TreeNode({
  item,
  depth = 0,
  onSelectList,
  selectedId,
  expandedFolders,
  toggleFolder,
}: {
  item: TreeItem;
  depth?: number;
  onSelectList: (list: SelectedList) => void;
  selectedId: string;
  expandedFolders: Set<string>;
  toggleFolder: (id: string) => void;
}) {
  if (item.type === 'space') {
    return (
      <div>
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          <span>{item.name}</span>
        </div>
        <div>
          {(item.children || []).map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              depth={depth + 1}
              onSelectList={onSelectList}
              selectedId={selectedId}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
            />
          ))}
        </div>
      </div>
    );
  }

  if (item.type === 'folder') {
    const isExpanded = expandedFolders.has(item.id);
    const hasLists = (item.children || []).length > 0;
    return (
      <div>
        <button
          onClick={() => toggleFolder(item.id)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-hover transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 text-text-muted shrink-0 transition-transform', isExpanded && 'rotate-90')}
          />
          <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="flex-1 text-left font-medium text-text-primary truncate">{item.name}</span>
          {hasLists && (
            <span className="text-[10px] text-text-muted shrink-0">{item.children!.length} lists</span>
          )}
        </button>
        {isExpanded && (
          <div>
            {(item.children || []).map((list) => (
              <TreeNode
                key={list.id}
                item={list}
                depth={depth + 1}
                onSelectList={onSelectList}
                selectedId={selectedId}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // List item
  const isSelected = item.id === selectedId;
  return (
    <button
      onClick={() =>
        onSelectList({
          id: item.id,
          name: item.name,
          spaceName: item.spaceName || '',
          folderName: item.folderName,
        })
      }
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      {isSelected ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
      ) : (
        <List className="h-3.5 w-3.5 shrink-0 text-text-muted" />
      )}
      <span className="flex-1 text-left truncate">{item.name}</span>
      {item.taskCount != null && (
        <span className="text-[10px] text-text-muted shrink-0">{item.taskCount}</span>
      )}
    </button>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function ClickUpConnectModal({ storeId, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>('token');
  const [apiToken, setApiToken] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [tree, setTree] = useState<TreeItem[]>([]);
  const [selectedList, setSelectedList] = useState<SelectedList | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [readyStatus, setReadyStatus] = useState('ready to launch');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleVerifyToken = async () => {
    if (!apiToken.trim()) { setError('Please enter your API token'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/integrations/clickup/workspaces?apiToken=${encodeURIComponent(apiToken.trim())}`
      );
      const data = await res.json() as { workspaces?: Workspace[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to connect');
      setWorkspaces(data.workspaces || []);
      if (data.workspaces?.length === 1) {
        const ws = data.workspaces[0];
        setSelectedWorkspace(ws);
        await fetchTree(ws.id);
        setStep('list');
      } else {
        setStep('workspace');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to ClickUp');
    } finally {
      setLoading(false);
    }
  };

  const fetchTree = async (workspaceId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/integrations/clickup/lists?apiToken=${encodeURIComponent(apiToken.trim())}&workspaceId=${workspaceId}`
      );
      const data = await res.json() as { tree?: TreeItem[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch lists');
      setTree(data.tree || []);
      // Auto-expand first folder if there's only one space with one folder
      const spaceItems = data.tree || [];
      if (spaceItems.length === 1 && spaceItems[0].children?.length) {
        const firstChild = spaceItems[0].children[0];
        if (firstChild.type === 'folder') {
          setExpandedFolders(new Set([firstChild.id]));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lists');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = async (ws: Workspace) => {
    setSelectedWorkspace(ws);
    await fetchTree(ws.id);
    setStep('list');
  };

  const handleSave = async () => {
    if (!selectedList || !selectedWorkspace) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/clickup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          apiToken: apiToken.trim(),
          workspaceId: selectedWorkspace.id,
          workspaceName: selectedWorkspace.name,
          listId: selectedList.id,
          listName: selectedList.name,
          readyStatus: readyStatus.trim().toLowerCase(),
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to save');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setLoading(false);
    }
  };

  const steps: Step[] = ['token', 'workspace', 'list', 'status'];
  const stepIdx = steps.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface-elevated shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#7B68EE]/10">
              <CheckSquare className="h-5 w-5 text-[#7B68EE]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Connect ClickUp</h2>
              <p className="text-xs text-text-secondary">
                {step === 'token' && 'Enter your personal API token'}
                {step === 'workspace' && 'Select your workspace'}
                {step === 'list' && 'Choose the task list'}
                {step === 'status' && 'Configure ready status'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step progress */}
        <div className="flex gap-1.5 px-5 pt-4">
          {steps.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step === s ? 'bg-primary' : i < stepIdx ? 'bg-primary/40' : 'bg-border'
              )}
            />
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Step 1: API Token */}
          {step === 'token' && (
            <>
              <div>
                <p className="text-xs text-text-secondary mb-3">
                  Get your token from{' '}
                  <a
                    href="https://app.clickup.com/settings/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-0.5 hover:underline"
                  >
                    ClickUp Settings → Apps <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
                <label className="block text-xs font-medium text-text-primary mb-1.5">
                  Personal API Token
                </label>
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
              <button
                onClick={handleVerifyToken}
                disabled={loading || !apiToken.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Verifying...' : 'Connect & Fetch Workspaces'}
              </button>
            </>
          )}

          {/* Step 2: Workspace */}
          {step === 'workspace' && (
            <>
              <p className="text-xs text-text-secondary">Choose your ClickUp workspace:</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSelectWorkspace(ws)}
                    disabled={loading}
                    className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium text-text-primary">{ws.name}</span>
                    {loading && selectedWorkspace?.id === ws.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-text-secondary" />
                    )}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}

          {/* Step 3: List tree */}
          {step === 'list' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-secondary">
                  Select the list with your &ldquo;Ready to Launch&rdquo; tasks:
                </p>
                {selectedList && (
                  <span className="text-[10px] text-primary font-medium truncate max-w-[120px]">{selectedList.name}</span>
                )}
              </div>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 space-y-0.5">
                  {tree.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-4">No lists found.</p>
                  )}
                  {tree.map((space) => (
                    <TreeNode
                      key={space.id}
                      item={space}
                      depth={0}
                      onSelectList={(list) => {
                        setSelectedList(list);
                        setStep('status');
                      }}
                      selectedId={selectedList?.id || ''}
                      expandedFolders={expandedFolders}
                      toggleFolder={toggleFolder}
                    />
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={() => setStep('workspace')} className="text-xs text-text-secondary hover:text-text-primary">
                ← Back to workspace
              </button>
            </>
          )}

          {/* Step 4: Status */}
          {step === 'status' && (
            <>
              <div className="rounded-lg border border-border bg-surface p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-muted">Workspace</span>
                  <span className="font-medium text-text-primary">{selectedWorkspace?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">List</span>
                  <span className="font-medium text-text-primary">{selectedList?.name}</span>
                </div>
                {selectedList?.folderName && (
                  <div className="flex justify-between">
                    <span className="text-text-muted">Folder</span>
                    <span className="font-medium text-text-primary">{selectedList.folderName}</span>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">
                  &ldquo;Ready to Launch&rdquo; Status Name
                </label>
                <p className="text-[11px] text-text-muted mb-2">
                  Tasks with this status will appear in Creative Launch. Must match exactly (case-insensitive).
                </p>
                <input
                  type="text"
                  value={readyStatus}
                  onChange={(e) => setReadyStatus(e.target.value)}
                  placeholder="ready to launch"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-dimmed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-3">
                <button onClick={() => setStep('list')} className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                  Back
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
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
