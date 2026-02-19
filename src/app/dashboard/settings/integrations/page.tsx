import { Suspense } from 'react';
import { IntegrationsClient } from '@/components/integrations/IntegrationsClient';

function IntegrationsLoading() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-primary-light" />
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Integrations</h2>
        <p className="text-sm text-text-secondary mt-0.5">Connect your tools and manage data sources</p>
      </div>
      <Suspense fallback={<IntegrationsLoading />}>
        <IntegrationsClient />
      </Suspense>
    </div>
  );
}
