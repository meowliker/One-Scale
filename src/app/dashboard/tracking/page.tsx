'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { getTrackingConfig, getTrackingHealth } from '@/services/tracking';
import { TrackingDashboardClient } from '@/components/tracking/TrackingDashboardClient';
import type { TrackingConfig, TrackingHealth } from '@/types/tracking';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

const defaultConfig: TrackingConfig = {
  pixelId: '',
  domain: '',
  serverSideEnabled: false,
  attributionModel: 'last_click',
  attributionWindow: '7day',
  events: [],
};

const defaultHealth: TrackingHealth = {
  overall: 'warning',
  checks: [],
  lastUpdated: new Date().toISOString(),
};

export default function TrackingPage() {
  const [config, setConfig] = useState<TrackingConfig>(defaultConfig);
  const [health, setHealth] = useState<TrackingHealth>(defaultHealth);
  const [loading, setLoading] = useState(true);
  const [emptyReason, setEmptyReason] = useState<'not_connected' | 'no_accounts' | 'error' | null>(null);

  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setEmptyReason(null);
    try {
      const [cfg, h] = await Promise.all([getTrackingConfig(), getTrackingHealth()]);
      setConfig(cfg);
      setHealth(h);
    } catch (err) {
      if (err instanceof NotConnectedError) {
        setEmptyReason(err.reason);
      } else {
        setEmptyReason('error');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connectionReady) {
      fetchData();
    }
  }, [connectionReady, activeStoreId, fetchData]);

  if ((!connectionReady || loading) && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading tracking setup...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Tracking Setup</h1>
        <p className="text-sm text-text-secondary">
          Configure your first-party tracking pixel and attribution
        </p>
      </div>

      <TrackingDashboardClient config={config} health={health} />
    </div>
  );
}
