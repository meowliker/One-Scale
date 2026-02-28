'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { Creative } from '@/types/creative';
import { getCreatives, computeSummary } from '@/services/creativeAnalysis';
import dynamic from 'next/dynamic';

const CreativeAnalysisClient = dynamic(
  () => import('@/components/creative-analysis/CreativeAnalysisClient').then((m) => m.CreativeAnalysisClient),
  { ssr: false }
);
import { useConnectionStore } from '@/stores/connectionStore';
import { useStoreStore } from '@/stores/storeStore';
import { NotConnectedError } from '@/services/withMockFallback';
import { ConnectionEmptyState } from '@/components/ui/ConnectionEmptyState';

export default function CreativeAnalysisPage() {
  const connectionLoading = useConnectionStore((s) => s.loading);
  const connectionStatus = useConnectionStore((s) => s.status);
  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const connectionReady = !connectionLoading && connectionStatus !== null;

  const {
    data: creatives = [],
    isLoading,
    error,
  } = useQuery<Creative[], Error>({
    queryKey: ['creatives', activeStoreId],
    queryFn: () => getCreatives(),
    enabled: connectionReady && !!activeStoreId,
  });

  const summary = useMemo(() => computeSummary(creatives), [creatives]);

  const emptyReason = error instanceof NotConnectedError
    ? error.reason
    : error
      ? 'error' as const
      : null;

  if ((!connectionReady || isLoading) && creatives.length === 0 && !emptyReason) {
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
