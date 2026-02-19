'use client';

import { useState } from 'react';
import { Clock, Grid3x3, BarChart2, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayPartingCell } from '@/data/mockDayParting';
import { HeatmapChart } from './HeatmapChart';
import { HourlyBreakdown } from './HourlyBreakdown';
import { DayPartingRecommendations } from './DayPartingRecommendations';

interface DayPartingClientProps {
  data: DayPartingCell[];
}

type Tab = 'heatmap' | 'hourly' | 'recommendations';

const tabs: { key: Tab; label: string; icon: typeof Grid3x3 }[] = [
  { key: 'heatmap', label: 'Heatmap', icon: Grid3x3 },
  { key: 'hourly', label: 'Hourly Breakdown', icon: BarChart2 },
  { key: 'recommendations', label: 'Recommendations', icon: Lightbulb },
];

export function DayPartingClient({ data }: DayPartingClientProps) {
  const [activeTab, setActiveTab] = useState<Tab>('heatmap');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
          <Clock className="h-6 w-6 text-brand" />
          Day-Parting Analysis
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Analyze performance by hour and day of week to optimize ad scheduling
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-surface-elevated text-text-primary shadow-sm'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-surface-elevated p-6 shadow-sm">
        {activeTab === 'heatmap' && <HeatmapChart data={data} />}
        {activeTab === 'hourly' && <HourlyBreakdown data={data} />}
        {activeTab === 'recommendations' && <DayPartingRecommendations data={data} />}
      </div>
    </div>
  );
}
