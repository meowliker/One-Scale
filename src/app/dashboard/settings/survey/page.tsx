'use client';

import { useState } from 'react';
import { Settings, BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SurveyBuilder } from '@/components/survey/SurveyBuilder';
import { SurveyResults } from '@/components/survey/SurveyResults';

type Tab = 'builder' | 'results';

export default function SurveyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('builder');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Post-Purchase Survey
        </h2>
        <p className="mt-0.5 text-sm text-text-secondary">
          Configure and track your &ldquo;How did you hear about us?&rdquo; survey
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-border bg-surface-elevated p-1">
        <button
          onClick={() => setActiveTab('builder')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'builder'
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          <Settings className="h-4 w-4" />
          Builder
        </button>
        <button
          onClick={() => setActiveTab('results')}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'results'
              ? 'bg-surface-elevated text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          )}
        >
          <BarChart2 className="h-4 w-4" />
          Results
        </button>
      </div>

      {activeTab === 'builder' ? <SurveyBuilder /> : <SurveyResults />}
    </div>
  );
}
