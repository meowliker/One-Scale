'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckSquare, HardDrive, MessageSquare, Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type {
  Integration,
  ClickUpTask,
  GoogleDriveFile,
  SlackChannel,
  SlackNotificationRule,
} from '@/types/integrations';
import {
  getIntegrations,
  getClickUpTasks,
  getGoogleDriveFiles,
  getSlackChannels,
  getSlackNotificationRules,
} from '@/services/integrations';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { ClickUpPanel } from '@/components/integrations/ClickUpPanel';
import { GoogleDrivePanel } from '@/components/integrations/GoogleDrivePanel';
import { SlackConfig } from '@/components/integrations/SlackConfig';
import { ImportCreativeModal } from '@/components/integrations/ImportCreativeModal';
import { ShopifyConnectModal } from '@/components/integrations/ShopifyConnectModal';
import { MetaConnectionDetails } from '@/components/integrations/MetaConnectionDetails';

type PanelTab = 'clickup' | 'google_drive' | 'slack';

const tabConfig: { key: PanelTab; label: string; icon: typeof CheckSquare; platform: string }[] = [
  { key: 'clickup', label: 'ClickUp Tasks', icon: CheckSquare, platform: 'clickup' },
  { key: 'google_drive', label: 'Google Drive', icon: HardDrive, platform: 'google_drive' },
  { key: 'slack', label: 'Slack Config', icon: MessageSquare, platform: 'slack' },
];

export function IntegrationsClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [clickUpTasks, setClickUpTasks] = useState<ClickUpTask[]>([]);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([]);
  const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
  const [slackRules, setSlackRules] = useState<SlackNotificationRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<PanelTab>('clickup');

  // Available Meta connections from other stores (for reuse)
  const [availableMetaConnections, setAvailableMetaConnections] = useState<
    Array<{ storeId: string; storeName: string; accountId: string | null; accountName: string | null; connectedAt: string }>
  >([]);
  const [copyingConnection, setCopyingConnection] = useState(false);

  // Modal states
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [importModal, setImportModal] = useState<{
    isOpen: boolean;
    source: { type: 'clickup'; data: ClickUpTask } | { type: 'drive'; data: GoogleDriveFile } | null;
  }>({ isOpen: false, source: null });

  const searchParams = useSearchParams();
  const refreshStatus = useConnectionStore((s) => s.refreshStatus);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const stores = useStoreStore((s) => s.stores);
  const activeStoreName = stores.find((s) => s.id === activeStoreId)?.name || 'Current Store';

  // Listen for OAuth popup callback messages
  useEffect(() => {
    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'oauth_callback') return;

      const { platform, status, message } = event.data;

      if (platform === 'meta') {
        if (status === 'connected') {
          toast.success('Meta Ads connected! Link ad accounts below.');
          refreshStatus(activeStoreId);
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.platform === 'meta'
                ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
                : intg
            )
          );
        } else {
          toast.error(`Meta connection failed: ${message || 'Unknown error'}`);
        }
      }

      if (platform === 'shopify') {
        if (status === 'connected') {
          toast.success('Shopify connected successfully!');
          refreshStatus(activeStoreId);
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.platform === 'shopify'
                ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
                : intg
            )
          );
        } else {
          toast.error(`Shopify connection failed: ${message || 'Unknown error'}`);
        }
      }
    }

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [activeStoreId, refreshStatus]);

  // Also check URL params for non-popup fallback (if popup was blocked)
  useEffect(() => {
    const metaParam = searchParams.get('meta');
    const shopifyParam = searchParams.get('shopify');

    if (metaParam === 'connected') {
      toast.success('Meta Ads connected! Link ad accounts below.');
    } else if (metaParam === 'error') {
      const message = searchParams.get('message') || 'Unknown error';
      toast.error(`Meta connection failed: ${message}`);
    }

    if (shopifyParam === 'connected') {
      toast.success('Shopify connected successfully!');
    } else if (shopifyParam === 'error') {
      const message = searchParams.get('message') || 'Unknown error';
      toast.error(`Shopify connection failed: ${message}`);
    }

    if (metaParam || shopifyParam) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams]);

  // Load connection status on mount
  useEffect(() => {
    if (activeStoreId) {
      refreshStatus(activeStoreId);
    }
  }, [activeStoreId, refreshStatus]);

  // Fetch available Meta connections from other stores (for "reuse existing" feature)
  useEffect(() => {
    if (!activeStoreId) return;
    fetch(`/api/auth/meta/available-connections?excludeStoreId=${encodeURIComponent(activeStoreId)}`)
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((data) => setAvailableMetaConnections(data.connections || []))
      .catch(() => setAvailableMetaConnections([]));
  }, [activeStoreId]);

  // Handler: copy an existing Meta connection from another store
  const handleCopyMetaConnection = async (fromStoreId: string, fromStoreName: string) => {
    setCopyingConnection(true);
    try {
      const res = await fetch('/api/auth/meta/copy-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromStoreId, toStoreId: activeStoreId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || 'Failed to copy connection');
      }
      toast.success(`Meta connection copied from "${fromStoreName}". Now link your ad accounts below.`);
      refreshStatus(activeStoreId);
      // Update integration card status
      setIntegrations((prev) =>
        prev.map((intg) =>
          intg.platform === 'meta'
            ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
            : intg
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to copy connection');
    } finally {
      setCopyingConnection(false);
    }
  };

  useEffect(() => {
    async function loadData() {
      try {
        const [intgs, tasks, files, channels, rules] = await Promise.all([
          getIntegrations(),
          getClickUpTasks(),
          getGoogleDriveFiles(),
          getSlackChannels(),
          getSlackNotificationRules(),
        ]);

        setIntegrations(intgs);
        setClickUpTasks(tasks);
        setDriveFiles(files);
        setSlackChannels(channels);
        setSlackRules(rules);
      } catch {
        toast.error('Failed to load integrations');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleSelectIntegration = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration || integration.status !== 'connected') return;

    if (activeIntegration === id) {
      setActiveIntegration(null);
      return;
    }

    setActiveIntegration(id);

    // Auto-switch to the correct tab based on platform
    const platform = integration.platform;
    if (platform === 'clickup' || platform === 'google_drive' || platform === 'slack') {
      setActiveTab(platform);
    }
  };

  const handleToggleConnection = async (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    const isConnected = integration.status === 'connected';

    // Handle Meta connect/disconnect
    if (integration.platform === 'meta') {
      if (isConnected) {
        // Disconnect
        try {
          await fetch('/api/auth/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: 'meta', storeId: activeStoreId }),
          });
          toast.success('Meta Ads disconnected');
          refreshStatus(activeStoreId);
          // Update local state
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.id === id
                ? { ...intg, status: 'disconnected' as const, lastSynced: null }
                : intg
            )
          );
          if (activeIntegration === id) setActiveIntegration(null);
        } catch {
          toast.error('Failed to disconnect Meta Ads');
        }
        return;
      }
      // Connect — open Meta OAuth in a popup
      const url = `/api/auth/meta?storeId=${encodeURIComponent(activeStoreId)}`;
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        'meta_oauth',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
      );
      // Fallback: if popup was blocked, redirect the page
      if (!popup || popup.closed) {
        window.location.href = url;
      }
      return;
    }

    // Handle Shopify connect/disconnect
    if (integration.platform === 'shopify') {
      if (isConnected) {
        // Disconnect
        try {
          await fetch('/api/auth/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: 'shopify', storeId: activeStoreId }),
          });
          toast.success('Shopify disconnected');
          refreshStatus(activeStoreId);
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.id === id
                ? { ...intg, status: 'disconnected' as const, lastSynced: null }
                : intg
            )
          );
          if (activeIntegration === id) setActiveIntegration(null);
        } catch {
          toast.error('Failed to disconnect Shopify');
        }
        return;
      }
      // Connect — open shop domain modal first
      setShopifyModalOpen(true);
      return;
    }

    // Default toggle for other platforms (mock behavior)
    setIntegrations((prev) =>
      prev.map((intg) => {
        if (intg.id !== id) return intg;
        const newStatus = intg.status === 'connected' ? 'disconnected' : 'connected';
        const newSynced = newStatus === 'connected' ? new Date().toISOString() : null;

        if (newStatus === 'connected') {
          toast.success(`${intg.name} connected successfully`);
        } else {
          toast.success(`${intg.name} disconnected`);
          if (activeIntegration === id) {
            setActiveIntegration(null);
          }
        }

        return { ...intg, status: newStatus, lastSynced: newSynced };
      })
    );
  };

  const handleImportClickUpTask = (task: ClickUpTask) => {
    setImportModal({ isOpen: true, source: { type: 'clickup', data: task } });
  };

  const handleUseAsCreative = (file: GoogleDriveFile) => {
    setImportModal({ isOpen: true, source: { type: 'drive', data: file } });
  };

  const handleCloseImportModal = () => {
    setImportModal({ isOpen: false, source: null });
  };

  // Check if a panel tab platform is connected
  const isPlatformConnected = (platform: string) => {
    return integrations.some(
      (i) => i.platform === platform && i.status === 'connected'
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Integration Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <IntegrationCard
            key={integration.id}
            integration={integration}
            isActive={activeIntegration === integration.id}
            onSelect={handleSelectIntegration}
            onToggleConnection={handleToggleConnection}
          />
        ))}
      </div>

      {/* Reuse Existing Meta Connection — shown when Meta is NOT connected but other stores have it */}
      {!integrations.some((i) => i.platform === 'meta' && i.status === 'connected') &&
        availableMetaConnections.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-elevated overflow-hidden">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Copy className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Use Existing Facebook Connection</h3>
                <p className="text-xs text-text-secondary">
                  You already have Meta connected on other stores. Reuse the same connection here.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {availableMetaConnections.map((conn) => (
                <div
                  key={conn.storeId}
                  className="flex items-center justify-between rounded-lg border border-border p-3 bg-surface-hover/50"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-text-primary">{conn.storeName}</span>
                    {conn.accountName && (
                      <span className="ml-2 text-xs text-text-muted">· {conn.accountName}</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleCopyMetaConnection(conn.storeId, conn.storeName)}
                    disabled={copyingConnection}
                    className="shrink-0 ml-3 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {copyingConnection ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    Use This Connection
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Meta Connection Details — shown when Meta is connected */}
      {integrations.some((i) => i.platform === 'meta' && i.status === 'connected') && (
        <MetaConnectionDetails
          storeId={activeStoreId}
          storeName={activeStoreName}
          onAccountSelected={() => refreshStatus(activeStoreId)}
        />
      )}

      {/* Detail Panel */}
      <div className="rounded-lg border border-border bg-surface-elevated">
        {/* Panel Tabs */}
        <div className="flex border-b border-border">
          {tabConfig.map((tab) => {
            const Icon = tab.icon;
            const connected = isPlatformConnected(tab.platform);

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-secondary hover:border-border hover:text-text-primary'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {!connected && (
                  <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-dimmed">
                    Not connected
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel Content */}
        <div className="p-5">
          {activeTab === 'clickup' && (
            isPlatformConnected('clickup') ? (
              <ClickUpPanel tasks={clickUpTasks} onImportTask={handleImportClickUpTask} />
            ) : (
              <EmptyPanelState platform="ClickUp" />
            )
          )}

          {activeTab === 'google_drive' && (
            isPlatformConnected('google_drive') ? (
              <GoogleDrivePanel files={driveFiles} onUseAsCreative={handleUseAsCreative} />
            ) : (
              <EmptyPanelState platform="Google Drive" />
            )
          )}

          {activeTab === 'slack' && (
            isPlatformConnected('slack') ? (
              <SlackConfig channels={slackChannels} rules={slackRules} />
            ) : (
              <EmptyPanelState platform="Slack" />
            )
          )}
        </div>
      </div>

      {/* Modals */}
      <ImportCreativeModal
        isOpen={importModal.isOpen}
        onClose={handleCloseImportModal}
        source={importModal.source}
      />

      <ShopifyConnectModal
        isOpen={shopifyModalOpen}
        onClose={() => setShopifyModalOpen(false)}
        storeId={activeStoreId}
      />

    </div>
  );
}

function EmptyPanelState({ platform }: { platform: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm text-text-secondary">
        Connect {platform} to access this panel.
      </p>
      <p className="mt-1 text-xs text-text-muted">
        Click the &quot;Connect&quot; button on the {platform} card above to get started.
      </p>
    </div>
  );
}
