import { Suspense } from 'react';
import LaunchCreativeSelectionPage from '@/components/creative-hub/launch-creative/LaunchCreativeSelectionPage';

export default function DashboardCreativeHubLaunchCreativePage() {
  return (
    <Suspense fallback={<div className="rounded-2xl border border-border bg-surface-elevated p-6 text-sm text-text-secondary">Loading launch flow...</div>}>
      <LaunchCreativeSelectionPage />
    </Suspense>
  );
}
