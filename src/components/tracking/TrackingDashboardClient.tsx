'use client';

import { useState } from 'react';
import type { TrackingConfig, TrackingHealth } from '@/types/tracking';
import { Tabs } from '@/components/ui/Tabs';
import { PixelSetupGuide } from '@/components/tracking/PixelSetupGuide';
import { ServerSideConfig } from '@/components/tracking/ServerSideConfig';
import { AttributionModelSelector } from '@/components/tracking/AttributionModelSelector';
import { TrackingHealthDashboard } from '@/components/tracking/TrackingHealthDashboard';
import { AttributionHealthDashboard } from '@/components/tracking/AttributionHealthDashboard';

interface TrackingDashboardClientProps {
  config: TrackingConfig;
  health: TrackingHealth;
}

const tabs = [
  { id: 'pixel', label: 'Pixel Setup' },
  { id: 'server', label: 'Server-Side' },
  { id: 'attribution', label: 'Attribution' },
  { id: 'attribution-health', label: 'Attribution Health' },
  { id: 'health', label: 'Health' },
];

export function TrackingDashboardClient({
  config,
  health,
}: TrackingDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<string>('pixel');

  return (
    <div className="space-y-6">
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'pixel' && <PixelSetupGuide config={config} />}
      {activeTab === 'server' && <ServerSideConfig config={config} />}
      {activeTab === 'attribution' && (
        <AttributionModelSelector currentModel={config.attributionModel} />
      )}
      {activeTab === 'attribution-health' && <AttributionHealthDashboard />}
      {activeTab === 'health' && <TrackingHealthDashboard health={health} />}
    </div>
  );
}
