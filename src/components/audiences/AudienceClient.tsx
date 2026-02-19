'use client';

import { useState, useMemo } from 'react';
import { Users, Plus, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockAudiences } from '@/data/mockAudiences';
import type { Audience } from '@/data/mockAudiences';
import { AudienceCard } from './AudienceCard';
import { CreateAudienceModal } from './CreateAudienceModal';
import { AudienceLauncher } from './AudienceLauncher';
import toast from 'react-hot-toast';

type Tab = 'all' | 'Saved' | 'Lookalike' | 'Custom';

const tabs: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All Audiences' },
  { key: 'Saved', label: 'Saved' },
  { key: 'Lookalike', label: 'Lookalikes' },
  { key: 'Custom', label: 'Custom' },
];

export function AudienceClient() {
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [audiences, setAudiences] = useState<Audience[]>(mockAudiences);
  const [showCreate, setShowCreate] = useState(false);
  const [showLauncher, setShowLauncher] = useState(false);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return audiences;
    return audiences.filter((a) => a.type === activeTab);
  }, [audiences, activeTab]);

  const handleToggle = (id: string) => {
    setAudiences((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: a.status === 'Active' ? 'Inactive' : 'Active' }
          : a
      )
    );
  };

  const handleLaunch = (id: string) => {
    const aud = audiences.find((a) => a.id === id);
    if (aud) {
      toast.success(`"${aud.name}" launched to campaign`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Users className="h-6 w-6 text-blue-600" />
            Audiences
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Build, manage, and deploy your ad audiences
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowLauncher(true)}
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            <Layers className="h-4 w-4" />
            Full-Funnel Launcher
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Create Audience
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-gray-400">
              {tab.key === 'all'
                ? audiences.length
                : audiences.filter((a) => a.type === tab.key).length}
            </span>
          </button>
        ))}
      </div>

      {/* Cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((audience) => (
          <AudienceCard
            key={audience.id}
            audience={audience}
            onToggleStatus={handleToggle}
            onLaunch={handleLaunch}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">
            No audiences found in this category
          </p>
        </div>
      )}

      {/* Modals */}
      <CreateAudienceModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
      />
      <AudienceLauncher
        isOpen={showLauncher}
        onClose={() => setShowLauncher(false)}
      />
    </div>
  );
}
