'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Copy, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type { Integration } from '@/types/integrations';
import { getIntegrations } from '@/services/integrations';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { getWorkspaceId } from '@/lib/auth/workspace';
import { IntegrationCard } from '@/components/integrations/IntegrationCard';
import { ShopifyConnectModal } from '@/components/integrations/ShopifyConnectModal';
import { MetaConnectionDetails } from '@/components/integrations/MetaConnectionDetails';
import { ClickUpConnectModal } from '@/components/integrations/ClickUpConnectModal';
import { ClickUpConnectionDetails } from '@/components/integrations/ClickUpConnectionDetails';
import { GoogleDriveConnectModal } from '@/components/settings/GoogleDriveConnectModal';

export function IntegrationsClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeIntegration, setActiveIntegration] = useState<string | null>(null);

  // Available Meta connections from other stores (for reuse)
  const [availableMetaConnections, setAvailableMetaConnections] = useState<
    Array<{ storeId: string; storeName: string; accountId: string | null; accountName: string | null; connectedAt: string }>
  >([]);
  const [copyingConnection, setCopyingConnection] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>();

  // Modal states
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [clickupModalOpen, setClickupModalOpen] = useState(false);
  const [googleDriveModalOpen, setGoogleDriveModalOpen] = useState(false);

  // Google Drive connection info
  const [googleDriveEmail, setGoogleDriveEmail] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const refreshStatus = useConnectionStore((s) => s.refreshStatus);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const stores = useStoreStore((s) => s.stores);
  const activeStoreName = stores.find((s) => s.id === activeStoreId)?.name || 'Current Store';

  useEffect(() => { getWorkspaceId().then(setWorkspaceId); }, []);

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

      if (platform === 'google_drive') {
        if (status === 'connected') {
          toast.success('Google Drive connected successfully!');
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.platform === 'google_drive'
                ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
                : intg
            )
          );
          // Refresh Google Drive connection info
          fetchGoogleDriveStatus();
        } else {
          toast.error(`Google Drive connection failed: ${message || 'Unknown error'}`);
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

  // Fetch Google Drive connection status
  const fetchGoogleDriveStatus = async () => {
    if (!activeStoreId) return;
    try {
      const res = await fetch(`/api/google-drive/status?storeId=${encodeURIComponent(activeStoreId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.connected) {
          setGoogleDriveEmail(data.email || null);
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.platform === 'google_drive'
                ? { ...intg, status: 'connected' as const, lastSynced: data.lastSynced || intg.lastSynced }
                : intg
            )
          );
        }
      }
    } catch {
      // Ignore status check errors
    }
  };

  // Handler: Google Drive connected successfully
  const handleGoogleDriveConnected = async () => {
    setGoogleDriveModalOpen(false);
    toast.success('Google Drive connected successfully!');
    setIntegrations((prev) =>
      prev.map((intg) =>
        intg.platform === 'google_drive'
          ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
          : intg
      )
    );
    fetchGoogleDriveStatus();
  };

  // Handler: ClickUp connected successfully
  const handleClickUpConnected = async () => {
    setClickupModalOpen(false);
    toast.success('ClickUp connected successfully!');
    // Update integration card to show connected
    setIntegrations((prev) =>
      prev.map((intg) =>
        intg.platform === 'clickup'
          ? { ...intg, status: 'connected' as const, lastSynced: new Date().toISOString() }
          : intg
      )
    );
  };

  useEffect(() => {
    async function loadData() {
      try {
        const intgs = await getIntegrations();
        setIntegrations(intgs);

        // Check real ClickUp connection status
        if (activeStoreId) {
          try {
            const statusRes = await fetch(`/api/integrations/clickup/connect?storeId=${encodeURIComponent(activeStoreId)}`);
            if (statusRes.ok) {
              const text = await statusRes.text();
              if (text) {
                const statusData = JSON.parse(text) as { connected: boolean };
                if (statusData.connected) {
                  setIntegrations((prev) =>
                    prev.map((intg) =>
                      intg.platform === 'clickup' ? { ...intg, status: 'connected' as const } : intg
                    )
                  );
                }
              }
            }
          } catch {
            // Ignore ClickUp status check errors
          }

          // Check real Google Drive connection status
          try {
            const driveRes = await fetch(`/api/google-drive/status?storeId=${encodeURIComponent(activeStoreId)}`);
            if (driveRes.ok) {
              const driveData = await driveRes.json() as { connected: boolean; email?: string; lastSynced?: string };
              if (driveData.connected) {
                setGoogleDriveEmail(driveData.email || null);
                setIntegrations((prev) =>
                  prev.map((intg) =>
                    intg.platform === 'google_drive'
                      ? { ...intg, status: 'connected' as const, lastSynced: driveData.lastSynced || intg.lastSynced }
                      : intg
                  )
                );
              } else {
                setIntegrations((prev) =>
                  prev.map((intg) =>
                    intg.platform === 'google_drive'
                      ? { ...intg, status: 'disconnected' as const, lastSynced: null }
                      : intg
                  )
                );
              }
            }
          } catch {
            // Ignore Google Drive status check errors
          }
        }
      } catch {
        toast.error('Failed to load integrations');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [activeStoreId]);

  const handleSelectIntegration = (id: string) => {
    const integration = integrations.find((i) => i.id === id);
    if (!integration || integration.status !== 'connected') return;

    if (activeIntegration === id) {
      setActiveIntegration(null);
      return;
    }

    setActiveIntegration(id);
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
      const url = `/api/auth/meta?storeId=${encodeURIComponent(activeStoreId)}${workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : ''}`;
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

    // Handle Google Drive connect/disconnect
    if (integration.platform === 'google_drive') {
      if (isConnected) {
        // Disconnect
        try {
          const res = await fetch('/api/google-drive/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId: activeStoreId }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Failed' }));
            throw new Error(err.error || 'Failed to disconnect');
          }
          toast.success('Google Drive disconnected');
          setGoogleDriveEmail(null);
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.id === id
                ? { ...intg, status: 'disconnected' as const, lastSynced: null }
                : intg
            )
          );
          if (activeIntegration === id) setActiveIntegration(null);
        } catch {
          toast.error('Failed to disconnect Google Drive');
        }
        return;
      }
      // Connect — open credentials modal
      setGoogleDriveModalOpen(true);
      return;
    }

    // Handle ClickUp connect/disconnect
    if (integration.platform === 'clickup') {
      if (isConnected) {
        // Disconnect
        try {
          await fetch('/api/integrations/clickup/connect', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storeId: activeStoreId }),
          });
          toast.success('ClickUp disconnected');
          setIntegrations((prev) =>
            prev.map((intg) =>
              intg.id === id ? { ...intg, status: 'disconnected' as const, lastSynced: null } : intg
            )
          );
          if (activeIntegration === id) setActiveIntegration(null);
        } catch {
          toast.error('Failed to disconnect ClickUp');
        }
        return;
      }
      // Connect — open ClickUp token modal
      setClickupModalOpen(true);
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

      {/* Google Drive Connection Details — shown when Google Drive is connected */}
      {integrations.some((i) => i.platform === 'google_drive' && i.status === 'connected') && (
        <div className="rounded-lg border border-border bg-surface-elevated overflow-hidden">
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4285F4]/10">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2L2 19.5h20L12 2z" fill="#4285F4" opacity={0.4} />
                  <path d="M2 19.5l5-8.5h14l-5 8.5H2z" fill="#0F9D58" opacity={0.4} />
                  <path d="M7 11l5-9 5 9H7z" fill="#F4B400" opacity={0.4} />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">Google Drive Connected</h3>
                {googleDriveEmail && (
                  <p className="text-xs text-text-secondary truncate">{googleDriveEmail}</p>
                )}
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ClickUp Connection Details — shown when ClickUp is connected */}
      {integrations.some((i) => i.platform === 'clickup' && i.status === 'connected') && (
        <ClickUpConnectionDetails
          storeId={activeStoreId}
          storeName={activeStoreName}
          onDisconnect={async () => {
            try {
              const res = await fetch('/api/integrations/clickup/connect', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ storeId: activeStoreId }),
              });
              if (!res.ok) throw new Error('Failed to disconnect');
              toast.success('ClickUp disconnected');
              setIntegrations((prev) =>
                prev.map((intg) =>
                  intg.platform === 'clickup'
                    ? { ...intg, status: 'disconnected' as const, lastSynced: null }
                    : intg
                )
              );
            } catch {
              toast.error('Failed to disconnect ClickUp');
            }
          }}
        />
      )}

      {/* Modals */}
      <ShopifyConnectModal
        isOpen={shopifyModalOpen}
        onClose={() => setShopifyModalOpen(false)}
        storeId={activeStoreId}
        workspaceId={workspaceId}
      />

      {clickupModalOpen && (
        <ClickUpConnectModal
          storeId={activeStoreId}
          onSuccess={handleClickUpConnected}
          onClose={() => setClickupModalOpen(false)}
        />
      )}

      {googleDriveModalOpen && (
        <GoogleDriveConnectModal
          storeId={activeStoreId}
          onSuccess={handleGoogleDriveConnected}
          onClose={() => setGoogleDriveModalOpen(false)}
        />
      )}

    </div>
  );
}
