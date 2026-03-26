'use client';

import { useMemo } from 'react';
import { Settings, DollarSign, Clock, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { CreativeBatch } from '@/types/creativeHub';

interface LaunchConfigPanelProps {
  batches: CreativeBatch[];
  productProfileId?: string;
}

export function LaunchConfigPanel({ batches, productProfileId }: LaunchConfigPanelProps) {
  const profiles = useCreativeHubStore((s) => s.profiles);
  const launchConfig = useCreativeHubStore((s) => s.launchConfig);
  const updateLaunchConfig = useCreativeHubStore((s) => s.updateLaunchConfig);

  const selectedProfile = useMemo(() => {
    const pid = productProfileId ?? launchConfig.productProfileId;
    return profiles.find((p) => p.id === pid);
  }, [profiles, productProfileId, launchConfig.productProfileId]);

  const totalAdSets = batches.length;
  const totalAds = useMemo(() => batches.reduce((sum, b) => sum + b.creativeIds.length, 0), [batches]);
  const budget = launchConfig.dailyBudget ?? selectedProfile?.defaultBudget ?? 20;
  const duration = launchConfig.testDuration ?? selectedProfile?.defaultDuration ?? 3;
  const structure = launchConfig.structure ?? selectedProfile?.defaultStructure ?? 'ABO';

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={16} className="text-gray-500 dark:text-gray-400" />
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Launch Config</span>
      </div>

      {/* Profile selector */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
          Product Profile
        </label>
        <select
          value={productProfileId ?? launchConfig.productProfileId ?? ''}
          onChange={(e) => updateLaunchConfig({ productProfileId: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <option value="">Select profile...</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.productName}
            </option>
          ))}
        </select>
      </div>

      {/* Config grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Structure */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Structure
          </label>
          <select
            value={structure}
            onChange={(e) => updateLaunchConfig({ structure: e.target.value as 'ABO' | 'CBO' })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="ABO">ABO</option>
            <option value="CBO">CBO</option>
          </select>
        </div>

        {/* Budget */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <DollarSign size={10} className="inline mr-0.5" />
            {structure === 'CBO' ? 'Campaign Budget' : 'Daily / Ad Set'}
          </label>
          <input
            type="number"
            min={1}
            value={budget}
            onChange={(e) => updateLaunchConfig({ dailyBudget: Number(e.target.value) })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Clock size={10} className="inline mr-0.5" />
            Duration (days)
          </label>
          <input
            type="number"
            min={1}
            max={30}
            value={duration}
            onChange={(e) => updateLaunchConfig({ testDuration: Number(e.target.value) })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
        </div>

        {/* Launch status */}
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            <Target size={10} className="inline mr-0.5" />
            Launch As
          </label>
          <select
            value={launchConfig.launchStatus ?? selectedProfile?.defaultLaunchStatus ?? 'PAUSED'}
            onChange={(e) => updateLaunchConfig({ launchStatus: e.target.value as 'ACTIVE' | 'PAUSED' })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            <option value="PAUSED">Paused</option>
            <option value="ACTIVE">Active</option>
          </select>
        </div>
      </div>

      {/* Summary line */}
      {totalAdSets > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/50">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {structure === 'CBO' ? (
              <>
                1 campaign x <span className="font-semibold text-gray-700 dark:text-gray-300">{totalAdSets}</span> ad sets x{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-300">{totalAds}</span> ads ={' '}
                <span className="font-semibold text-blue-600 dark:text-blue-400">${budget}/day</span> total
              </>
            ) : (
              <>
                <span className="font-semibold text-gray-700 dark:text-gray-300">{totalAdSets}</span> ad sets x ${budget}/day ={' '}
                <span className="font-semibold text-blue-600 dark:text-blue-400">${totalAdSets * budget}/day</span> total |{' '}
                <span className="font-semibold text-gray-700 dark:text-gray-300">{totalAds}</span> ads
              </>
            )}
            {' '} for {duration} days
          </p>
        </div>
      )}
    </div>
  );
}
