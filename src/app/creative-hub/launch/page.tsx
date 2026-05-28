import { Suspense } from 'react';
import LaunchCreativeSelectionPage from '@/components/creative-hub/launch-creative/LaunchCreativeSelectionPage';

export default function CreativeHubLaunchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading launch flow...</div>}>
      <LaunchCreativeSelectionPage />
    </Suspense>
  );
}
