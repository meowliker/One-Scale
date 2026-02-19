'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import type { Creative, CreativeSummary } from '@/types/creative';
import { getCreatives, computeSummary } from '@/services/creativeAnalysis';
import { CreativeAnalysisClient } from '@/components/creative-analysis/CreativeAnalysisClient';
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

export default function CreativeAnalysisPage() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [summary, setSummary] = useState<CreativeSummary>({ totalCreatives: 0, images: 0, videos: 0, fatigued: 0 });
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
      const data = await getCreatives();
      setCreatives(data);
      setSummary(computeSummary(data));
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

  // Wait for connection status to be fully loaded before fetching data.
  useEffect(() => {
    if (connectionReady) {
      fetchData();
    }
  }, [connectionReady, activeStoreId, fetchData]);

  if ((!connectionReady || loading) && creatives.length === 0 && !emptyReason) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-text-muted">Loading creatives...</span>
      </div>
    );
  }

  if (emptyReason) {
    return <ConnectionEmptyState reason={emptyReason} />;
  }

  return <CreativeAnalysisClient creatives={creatives} summary={summary} />;
}
