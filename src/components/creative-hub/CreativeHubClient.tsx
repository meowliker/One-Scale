'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Inbox, FlaskConical, Trophy } from 'lucide-react';
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
import { CreativeLaunchStudio } from '@/components/creative-hub/launch-center/CreativeLaunchStudio';

const tabs: { id: CreativeHubTab; label: string }[] = [
  { id: 'profiles', label: 'Product Profiles' },
  { id: 'inbox', label: 'Creative Inbox' },
  { id: 'active', label: 'Active Tests' },
  { id: 'completed', label: 'Completed' },
  { id: 'copy-library', label: 'Copy Library' },
];

const CREATIVE_HUB_RELOAD_STATE_KEY = 'creative-hub-reload-state';

export default function CreativeHubClient() {
  const activeTab = useCreativeHubStore((s) => s.activeTab);
  const setActiveTab = useCreativeHubStore((s) => s.setActiveTab);
  const profiles = useCreativeHubStore((s) => s.profiles);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const activeTests = useCreativeHubStore((s) => s.activeTests);
  const completedTests = useCreativeHubStore((s) => s.completedTests);
  const launchWizardOpen = useCreativeHubStore((s) => s.launchWizardOpen);
  const launchStudioOpen = useCreativeHubStore((s) => s.launchStudioOpen);
  const launchStudioProductId = useCreativeHubStore((s) => s.launchStudioProductId);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const restoreLaunchStudioSession = useCreativeHubStore((s) => s.restoreLaunchStudioSession);
  const fetchProfiles = useCreativeHubStore((s) => s.fetchProfiles);
  const fetchProfileCreativeCounts = useCreativeHubStore((s) => s.fetchProfileCreativeCounts);
  const fetchInbox = useCreativeHubStore((s) => s.fetchInbox);
  const fetchActiveTests = useCreativeHubStore((s) => s.fetchActiveTests);
  const fetchCompletedTests = useCreativeHubStore((s) => s.fetchCompletedTests);
  const profileCreativeTotal = useCreativeHubStore((s) => s.profileCreativeTotal);
  const profileCreativeCountsLoading = useCreativeHubStore((s) => s.profileCreativeCountsLoading);

  const activeStoreId = useStoreStore((s) => s.activeStoreId);
  const stores = useStoreStore((s) => s.stores);
  const storesLoading = useStoreStore((s) => s.loading);
  const storesError = useStoreStore((s) => s.error);
  const handledInitialEntryRef = useRef(false);

  useEffect(() => {
    if (handledInitialEntryRef.current || typeof window === 'undefined') return;
    handledInitialEntryRef.current = true;

    let shouldRestoreLaunchStudio = false;

    try {
      const raw = window.sessionStorage.getItem(CREATIVE_HUB_RELOAD_STATE_KEY);
      if (raw) {
        window.sessionStorage.removeItem(CREATIVE_HUB_RELOAD_STATE_KEY);
        const parsed = JSON.parse(raw) as {
          launchStudioOpen?: boolean;
          launchStudioProductId?: string | null;
          launchConfig?: typeof launchConfig;
          path?: string;
        };

        if (
          parsed.launchStudioOpen &&
          parsed.launchStudioProductId &&
          parsed.path === '/dashboard/creative-hub'
        ) {
          shouldRestoreLaunchStudio = true;
          restoreLaunchStudioSession(parsed.launchStudioProductId, parsed.launchConfig ?? {});
        }
      }
    } catch {
      window.sessionStorage.removeItem(CREATIVE_HUB_RELOAD_STATE_KEY);
    }

    // Preserve an already-open in-memory Launch Studio session.
    // This avoids dropping back to Product Profiles when the page subtree remounts
    // during local UI/theme changes inside Creative Hub.
    if (!shouldRestoreLaunchStudio && !launchStudioOpen && activeTab !== 'profiles') {
      setActiveTab('profiles');
    }
  }, [
    activeTab,
    launchConfig,
    launchStudioOpen,
    restoreLaunchStudioSession,
    setActiveTab,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const persistForReload = () => {
      if (launchStudioOpen && launchStudioProductId) {
        window.sessionStorage.setItem(
          CREATIVE_HUB_RELOAD_STATE_KEY,
          JSON.stringify({
            path: window.location.pathname,
            launchStudioOpen: true,
            launchStudioProductId,
            launchConfig,
          }),
        );
        return;
      }

      window.sessionStorage.removeItem(CREATIVE_HUB_RELOAD_STATE_KEY);
    };

    window.addEventListener('beforeunload', persistForReload);
    return () => window.removeEventListener('beforeunload', persistForReload);
  }, [launchConfig, launchStudioOpen, launchStudioProductId]);

  const winnersCount = useMemo(
    () => completedTests.filter((t) => t.status === 'completed' && t.winnerCreativeId).length,
    [completedTests]
  );
  const launchStudioCreativeCount = useMemo(() => {
    if (!launchStudioProductId) return 0;
    return inboxCreatives.filter((creative) => creative.productProfileId === launchStudioProductId).length;
  }, [inboxCreatives, launchStudioProductId]);

  // Fetch data based on active tab and storeId
  useEffect(() => {
    if (!activeStoreId) return;

    switch (activeTab) {
      case 'profiles':
        fetchProfiles(activeStoreId);
        fetchProfileCreativeCounts(activeStoreId);
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
  }, [activeTab, activeStoreId, fetchProfiles, fetchProfileCreativeCounts, fetchInbox, fetchActiveTests, fetchCompletedTests]);

  useEffect(() => {
    if (!activeStoreId || !launchStudioOpen || !launchStudioProductId) return;
    void fetchProfiles(activeStoreId);
    void fetchProfileCreativeCounts(activeStoreId);
    if (launchStudioCreativeCount === 0) {
      void fetchInbox(activeStoreId, launchStudioProductId);
    }
  }, [
    activeStoreId,
    fetchInbox,
    fetchProfileCreativeCounts,
    fetchProfiles,
    launchStudioCreativeCount,
    launchStudioOpen,
    launchStudioProductId,
  ]);

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
          value={
            activeTab === 'profiles'
              ? (profileCreativeCountsLoading ? '…' : profileCreativeTotal)
              : inboxCreatives.length
          }
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

      {!activeStoreId && (
        <div className="rounded-2xl border border-border bg-surface-elevated p-5 shadow-sm">
          <h2 className="text-base font-semibold text-text-primary">
            {storesLoading
              ? 'Loading store context'
              : storesError === 'Unauthorized'
                ? 'Sign in required'
                : stores.length === 0
                  ? 'No store selected'
                  : 'Select a store'}
          </h2>
          <p className="mt-2 text-sm text-text-secondary">
            {storesLoading
              ? 'Creative Hub data loads after the active store is resolved.'
              : storesError === 'Unauthorized'
                ? 'This page is open, but the API session is not valid, so Product Profiles and Creative Inbox cannot load.'
                : stores.length === 0
                  ? 'Connect or select a store first so Product Profiles, creatives, and tests can load.'
                  : 'Choose a store from the switcher in the left sidebar to load Product Profiles and creatives.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {storesError === 'Unauthorized' ? (
              <Link
                href="/login?next=/dashboard/creative-hub"
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Sign in again
              </Link>
            ) : (
              <Link
                href="/dashboard/settings/stores"
                className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
              >
                Manage stores
              </Link>
            )}
          </div>
        </div>
      )}

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

      {/* New Launch Studio */}
      <CreativeLaunchStudio storeId={activeStoreId || ''} />
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
  value: number | string;
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
