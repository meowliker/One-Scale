'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCreativeLaunchStore } from '@/stores/creativeLaunchStore';
import { useStoreStore } from '@/stores/storeStore';
import { StageIndicator } from './StageIndicator';
import { Stage1Discover } from './Stage1Discover';
import { Stage2Select } from './Stage2Select';
import { Stage3Configure } from './Stage3Configure';
import { Stage4Review } from './Stage4Review';
import { Stage5Monitor } from './Stage5Monitor';

// ── Stage slide variants ──────────────────────────────────────────────────────
const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
  }),
};

// ── Loading skeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-surface rounded-lg" />
      <div className="h-16 bg-surface rounded-xl" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-40 bg-surface rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
export function CreativeLaunchClient() {
  const [mounted, setMounted] = useState(false);
  const store = useCreativeLaunchStore();
  const activeStoreId = useStoreStore((s) => s.activeStoreId);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch real data when mounted and storeId is available
  useEffect(() => {
    if (mounted && activeStoreId) {
      store.fetchData(activeStoreId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, activeStoreId]);

  if (!mounted) {
    return <LoadingSkeleton />;
  }

  // Always use direction 1 (forward) for simplicity
  const direction = 1;

  const handleProceedToStage2 = () => store.setStage(2);

  const handleProceedToStage3 = () => {
    store.initBatchesFromSelection();
    store.setStage(3);
  };

  const handleProceedToStage4 = () => store.setStage(4);

  const handleLaunch = () => store.performLaunch(activeStoreId);

  const handleReset = () => {
    store.resetFlow();
    // Re-fetch data after reset
    if (activeStoreId) store.fetchData(activeStoreId);
  };

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <span className="text-2xl">🚀</span> Creative Launch
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          One-touch creative testing automation — from ClickUp to Meta in minutes
        </p>
      </div>

      {/* Stage indicator */}
      <div className="mb-8">
        <StageIndicator currentStage={store.stage} />
      </div>

      {/* Stage content with animated transitions */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={store.stage}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.3, ease: 'easeInOut' }}
        >
          {store.stage === 1 && (
            <Stage1Discover
              products={store.products}
              clickupCreatives={store.clickupCreatives}
              isLoading={store.isLoading}
              onProceed={handleProceedToStage2}
              discoverError={store.discoverError}
              notConnected={store.notConnected}
              notConfigured={store.notConfigured}
            />
          )}

          {store.stage === 2 && (
            <Stage2Select
              products={store.products}
              clickupCreatives={store.clickupCreatives}
              selectedCreativeIds={store.selectedCreativeIds}
              onToggle={store.toggleCreativeSelection}
              onSelectAllForProduct={store.selectAllForProduct}
              onClearForProduct={store.clearSelectionForProduct}
              onBack={() => store.setStage(1)}
              onProceed={handleProceedToStage3}
            />
          )}

          {store.stage === 3 && (
            <Stage3Configure
              batches={store.batches}
              products={store.products}
              clickupCreatives={store.clickupCreatives}
              availableCampaigns={[]}
              availableAdsets={[]}
              onUpdateBatch={store.updateBatch}
              onBack={() => store.setStage(2)}
              onProceed={handleProceedToStage4}
            />
          )}

          {store.stage === 4 && (
            <Stage4Review
              batches={store.batches}
              clickupCreatives={store.clickupCreatives}
              isLaunching={store.isLoading}
              onBack={() => store.setStage(3)}
              onLaunch={handleLaunch}
            />
          )}

          {store.stage === 5 && (
            <Stage5Monitor
              activeTests={store.activeTests}
              launchSuccess={store.launchSuccess}
              onNewBatch={handleReset}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
