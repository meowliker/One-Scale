'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Zap,
  LayoutGrid,
  Columns,
  Kanban,
  MessageSquare,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import { QuickLaunchTab } from './QuickLaunchTab';
import { GridBuilderTab } from './GridBuilderTab';
import { MatrixTab } from './MatrixTab';
import { KanbanTab } from './KanbanTab';
import { ChatLaunchTab } from './ChatLaunchTab';
import { ImportTab } from './ImportTab';
import type { LaunchCenterTab } from '@/types/creativeHub';

interface LaunchCenterProps {
  storeId: string;
}

const TABS: { id: LaunchCenterTab; label: string; icon: typeof Zap }[] = [
  { id: 'quick', label: 'Quick Launch', icon: Zap },
  { id: 'grid', label: 'Grid Builder', icon: LayoutGrid },
  { id: 'matrix', label: 'Matrix', icon: Columns },
  { id: 'kanban', label: 'Kanban', icon: Kanban },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'import', label: 'Import', icon: Upload },
];

export function LaunchCenter({ storeId }: LaunchCenterProps) {
  const isOpen = useCreativeHubStore((s) => s.launchCenterOpen);
  const activeTab = useCreativeHubStore((s) => s.launchCenterTab);
  const setTab = useCreativeHubStore((s) => s.setLaunchCenterTab);
  const close = useCreativeHubStore((s) => s.closeLaunchCenter);
  const inboxCreatives = useCreativeHubStore((s) => s.inboxCreatives);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);

  // Filter to ready creatives for the selected product
  const productId = launchConfig?.productProfileId;
  const readyCreatives = inboxCreatives.filter((c) =>
    (c.uploadStatus === 'ready' || c.driveUrl || c.clickupAttachmentUrl) &&
    (!productId || c.productProfileId === productId)
  );

  const handleClose = useCallback(() => {
    close();
  }, [close]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Creative Launch Center
            </h2>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-200',
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {activeTab === 'quick' && <QuickLaunchTab storeId={storeId} />}
                {activeTab === 'grid' && <GridBuilderTab />}
                {activeTab === 'matrix' && (
                  <MatrixTab
                    creatives={readyCreatives}
                    productProfileId={productId || ''}
                    onLaunchSelected={(combos) => {
                      console.log('Launch combos:', combos);
                    }}
                  />
                )}
                {activeTab === 'kanban' && <KanbanTab />}
                {activeTab === 'chat' && (
                  <ChatLaunchTab
                    creatives={readyCreatives}
                    onSwitchToGrid={() => setTab('grid')}
                  />
                )}
                {activeTab === 'import' && (
                  <ImportTab
                    creatives={readyCreatives}
                    onLaunchFromCSV={(batches) => {
                      console.log('CSV batches:', batches);
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
