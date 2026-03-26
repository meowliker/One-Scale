'use client';

import { useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Inbox, FlaskConical, Trophy, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/Tabs';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { useStoreStore } from '@/stores/storeStore';
import type { CreativeHubTab } from '@/types/creativeHub';
import { ProductProfilesTab } from '@/components/creative-hub/ProductProfilesTab';
import { CreativeInboxTab } from '@/components/creative-hub/CreativeInboxTab';
import { ActiveTestsTab } from '@/components/creative-hub/ActiveTestsTab';
import { CompletedTestsTab } from '@/components/creative-hub/CompletedTestsTab';
import { CopyLibraryTab } from '@/components/creative-hub/CopyLibraryTab';
import { LaunchWizard } from '@/components/creative-hub/LaunchWizard';
import { LaunchCenter } from '@/components/creative-hub/launch-center/LaunchCenter';

const tabs: { id: CreativeHubTab; label: string }[] = [
  { id: 'profiles', label: 'Product Profiles' },
  { id: 'inbox', label: 'Creative Inbox' },
  { id: 'active', label: 'Active Tests' },
  { id: 'completed', label: 'Completed' },
  { id: 'copy-library', label: 'Copy Library' },
];

export default function CreativeHubClient() {
  const activeTab = useCreativeHubStore((s) => s.activeTab);
  const setActiveTab = useCreativeHubStore((s) => s.setActiveTab);
  const profiles = useCreativeHubStore((s) => s.profiles);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const activeTests = useCreativeHubStore((s) => s.activeTests);
  const completedTests = useCreativeHubStore((s) => s.completedTests);
  const launchWizardOpen = useCreativeHubStore((s) => s.launchWizardOpen);
  const fetchProfiles = useCreativeHubStore((s) => s.fetchProfiles);
  const fetchInbox = useCreativeHubStore((s) => s.fetchInbox);
  const fetchActiveTests = useCreativeHubStore((s) => s.fetchActiveTests);
  const fetchCompletedTests = useCreativeHubStore((s) => s.fetchCompletedTests);

  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  const winnersCount = useMemo(
    () => completedTests.filter((t) => t.status === 'completed' && t.winnerCreativeId).length,
    [completedTests]
  );

  // Fetch data based on active tab and storeId
  useEffect(() => {
    if (!activeStoreId) return;

    switch (activeTab) {
      case 'profiles':
        fetchProfiles(activeStoreId);
        fetchInbox(activeStoreId);
        fetchActiveTests(activeStoreId);
        fetchCompletedTests(activeStoreId);
        break;
      case 'inbox':
        fetchInbox(activeStoreId);
        break;
      case 'active':
        fetchActiveTests(activeStoreId);
        break;
      case 'completed':
        fetchCompletedTests(activeStoreId);
        break;
      // copy-library fetches are driven by selected profile within the tab
    }
  }, [activeTab, activeStoreId, fetchProfiles, fetchInbox, fetchActiveTests, fetchCompletedTests]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Creative Hub</h1>
        <p className="text-sm text-text-secondary mt-1">
          Automate your creative testing workflow
        </p>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Products Configured"
          value={profiles.length}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <StatCard
          icon={Inbox}
          label="Creatives in Queue"
          value={inboxCreatives.length}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          icon={FlaskConical}
          label="Active Tests"
          value={activeTests.length}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
        <StatCard
          icon={Trophy}
          label="Winners Found"
          value={winnersCount}
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Tab bar */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as CreativeHubTab)} />

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'profiles' && activeStoreId && <ProductProfilesTab storeId={activeStoreId} />}
          {activeTab === 'inbox' && <CreativeInboxTab storeId={activeStoreId} />}
          {activeTab === 'active' && <ActiveTestsTab />}
          {activeTab === 'completed' && <CompletedTestsTab storeId={activeStoreId} />}
          {activeTab === 'copy-library' && <CopyLibraryTab storeId={activeStoreId} />}
        </motion.div>
      </AnimatePresence>

      {/* Launch Wizard overlay */}
      {launchWizardOpen && <LaunchWizard />}

      {/* Launch Center overlay (new bulk launch) */}
      <LaunchCenter storeId={activeStoreId || ''} />
    </div>
  );
}

/* ── Stat Card ── */

function StatCard({
  icon: Icon,
  label,
  value,
  iconColor,
  iconBg,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', iconBg)}>
          <Icon className={cn('h-5 w-5', iconColor)} />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          <p className="text-sm text-text-secondary">{label}</p>
        </div>
      </div>
    </div>
  );
}

