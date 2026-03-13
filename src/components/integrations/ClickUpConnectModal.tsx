'use client';

import { useState } from 'react';
import { X, CheckSquare, Loader2, ExternalLink, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Workspace {
  id: string;
  name: string;
}

interface ClickUpList {
  id: string;
  name: string;
  taskCount: number | null;
  spaceName: string;
}

interface Props {
  storeId: string;
  onSuccess: () => void;
  onClose: () => void;
}

type Step = 'token' | 'workspace' | 'list' | 'status';

export function ClickUpConnectModal({ storeId, onSuccess, onClose }: Props) {
  const [step, setStep] = useState<Step>('token');
  const [apiToken, setApiToken] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [lists, setLists] = useState<ClickUpList[]>([]);
  const [selectedList, setSelectedList] = useState<ClickUpList | null>(null);
  const [readyStatus, setReadyStatus] = useState('ready to launch');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        setSelectedWorkspace(data.workspaces[0]);
        await fetchLists(data.workspaces[0].id);
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

  const fetchLists = async (workspaceId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/integrations/clickup/lists?apiToken=${encodeURIComponent(apiToken.trim())}&workspaceId=${workspaceId}`
      );
      const data = await res.json() as { lists?: ClickUpList[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to fetch lists');
      setLists(data.lists || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch lists');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectWorkspace = async (ws: Workspace) => {
    setSelectedWorkspace(ws);
    await fetchLists(ws.id);
    setStep('list');
  };

  const handleSelectList = (list: ClickUpList) => {
    setSelectedList(list);
    setStep('status');
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
                {step === 'status' && 'Configure status name'}
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

        {/* Step indicator */}
        <div className="flex gap-1.5 px-5 pt-4">
          {(['token', 'workspace', 'list', 'status'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                step === s ? 'bg-primary' : i < (['token', 'workspace', 'list', 'status'] as Step[]).indexOf(step) ? 'bg-primary/40' : 'bg-border'
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? 'Verifying...' : 'Connect & Fetch Workspaces'}
              </button>
            </>
          )}

          {/* Step 2: Workspace selection */}
          {step === 'workspace' && (
            <>
              <p className="text-xs text-text-secondary">Choose the ClickUp workspace that contains your creative tasks:</p>
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
                      <ChevronDown className="h-4 w-4 text-text-secondary rotate-[-90deg]" />
                    )}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}

          {/* Step 3: List selection */}
          {step === 'list' && (
            <>
              <p className="text-xs text-text-secondary">
                Select the list that contains your &ldquo;Ready to Launch&rdquo; creative tasks:
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {lists.length === 0 && (
                    <p className="text-xs text-text-muted text-center py-4">No lists found in this workspace.</p>
                  )}
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => handleSelectList(list)}
                      className="w-full flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 text-sm hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <div className="text-left">
                        <div className="font-medium text-text-primary">{list.name}</div>
                        <div className="text-xs text-text-muted">{list.spaceName}</div>
                      </div>
                      <ChevronDown className="h-4 w-4 text-text-secondary rotate-[-90deg]" />
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button onClick={() => setStep('workspace')} className="text-xs text-text-secondary hover:text-text-primary">
                ← Back to workspace
              </button>
            </>
          )}

          {/* Step 4: Status config */}
          {step === 'status' && (
            <>
              <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span className="text-text-muted">Workspace</span>
                  <span className="font-medium text-text-primary">{selectedWorkspace?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted">List</span>
                  <span className="font-medium text-text-primary">{selectedList?.name}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1.5">
                  &ldquo;Ready to Launch&rdquo; Status Name
                </label>
                <p className="text-xs text-text-muted mb-2">
                  Tasks with this status will appear in Creative Launch. Must match exactly.
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
