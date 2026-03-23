'use client';

import { useState } from 'react';
import {
  Clock,
  CalendarCheck,
  Tag,
  PenLine,
  Monitor,
  Brain,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCreativeHubStore } from '@/stores/creativeHubStore';
import type { MirrorAccount } from '@/types/creativeHub';

const ATTRIBUTION_WINDOWS = [
  { value: '1d_click', label: '1 Day Click' },
  { value: '7d_click', label: '7 Day Click' },
  { value: '1d_click_1d_view', label: '1 Day Click, 1 Day View' },
  { value: '7d_click_1d_view', label: '7 Day Click, 1 Day View' },
  { value: '28d_click_1d_view', label: '28 Day Click, 1 Day View' },
];

const EVAL_FREQUENCIES = [
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '24h', label: 'Every 24 hours' },
  { value: '48h', label: 'Every 48 hours' },
];

// Mock mirror accounts for UI scaffolding
const MOCK_MIRROR_ACCOUNTS: MirrorAccount[] = [
  { adAccountId: 'act_456', adAccountName: 'US Scale Account', currency: 'USD', budget: 50, selected: false },
  { adAccountId: 'act_789', adAccountName: 'CA Account', currency: 'CAD', budget: 60, selected: false },
];

export function LaunchStep3Settings() {
  const { launchConfig, updateLaunchConfig } = useCreativeHubStore();

  const launchTime = launchConfig.launchTime || 'immediately';
  const scheduledDate = launchConfig.scheduledDate || '';
  const scheduledTime = launchConfig.scheduledTime || '09:00';
  const endDate = launchConfig.endDate || '';
  const utmTemplate = launchConfig.utmTemplate || '';
  const mirrorAccounts = launchConfig.mirrorAccounts || MOCK_MIRROR_ACCOUNTS;

  const aiMinSpend = launchConfig.aiMinSpend ?? 0;
  const aiMinImpressions = launchConfig.aiMinImpressions ?? 500;
  const aiMinHours = launchConfig.aiMinHours ?? 24;
  const aiEvalFrequency = launchConfig.aiEvalFrequency || '24h';
  const autoKill = launchConfig.autoKill ?? true;
  const notifyOnKill = launchConfig.notifyOnKill ?? true;

  const [endDateMode, setEndDateMode] = useState<'auto' | 'none' | 'custom'>(
    endDate ? 'custom' : launchConfig.testDuration ? 'auto' : 'none'
  );
  const [showMultiAccount, setShowMultiAccount] = useState(false);
  const [showAiRules, setShowAiRules] = useState(true);

  const attributionWindow = launchConfig.attributionWindow || '7d_click_1d_view';

  // Naming overrides
  const namingCampaign = launchConfig.newCampaignName || '';
  const adsetNameOverride = launchConfig.adsetNameOverride || '';
  const adNameOverride = launchConfig.adNameOverride || '';

  return (
    <div className="space-y-8">
      {/* Schedule Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Schedule</h2>
        </div>

        {/* Launch Time */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">Launch Timing</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              onClick={() => updateLaunchConfig({ launchTime: 'immediately' })}
              className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
                launchTime === 'immediately'
                  ? 'border-blue-500 bg-blue-50/30'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <Clock
                className={cn(
                  'h-5 w-5',
                  launchTime === 'immediately' ? 'text-blue-600' : 'text-slate-400'
                )}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">Launch Immediately</p>
                <p className="text-xs text-slate-500">Go live as soon as the test is created</p>
              </div>
            </button>

            <button
              onClick={() => updateLaunchConfig({ launchTime: 'scheduled' })}
              className={cn(
                'flex items-center gap-3 rounded-xl border-2 p-4 text-left transition-all',
                launchTime === 'scheduled'
                  ? 'border-blue-500 bg-blue-50/30'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              )}
            >
              <CalendarCheck
                className={cn(
                  'h-5 w-5',
                  launchTime === 'scheduled' ? 'text-blue-600' : 'text-slate-400'
                )}
              />
              <div>
                <p className="text-sm font-medium text-slate-900">Schedule for Later</p>
                <p className="text-xs text-slate-500">Pick a specific date and time</p>
              </div>
            </button>
          </div>

          {launchTime === 'scheduled' && (
            <div className="ml-1 grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => updateLaunchConfig({ scheduledDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Time</label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => updateLaunchConfig({ scheduledTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">End Date</label>
          <div className="flex gap-2">
            {(['auto', 'none', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setEndDateMode(mode);
                  if (mode === 'none') updateLaunchConfig({ endDate: undefined });
                }}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  endDateMode === mode
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                )}
              >
                {mode === 'auto' ? 'Auto-stop' : mode === 'none' ? 'No End' : 'Custom'}
              </button>
            ))}
          </div>
          {endDateMode === 'auto' && (
            <p className="text-xs text-slate-500">
              Test will auto-stop after {launchConfig.testDuration ?? 3} days based on your test duration setting.
            </p>
          )}
          {endDateMode === 'custom' && (
            <input
              type="date"
              value={endDate}
              onChange={(e) => updateLaunchConfig({ endDate: e.target.value })}
              className="w-48 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
        </div>

        {/* Attribution Window */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Attribution Window</label>
          <select
            value={attributionWindow}
            onChange={(e) => updateLaunchConfig({ attributionWindow: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-72"
          >
            {ATTRIBUTION_WINDOWS.map((w) => (
              <option key={w.value} value={w.value}>
                {w.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* UTM Template */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">UTM Template</h3>
        </div>
        <input
          type="text"
          value={utmTemplate}
          onChange={(e) => updateLaunchConfig({ utmTemplate: e.target.value })}
          placeholder="utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-500">
          Use {'{{campaign.name}}'}, {'{{adset.name}}'}, {'{{ad.name}}'} as dynamic placeholders.
        </p>
      </section>

      {/* Naming Overrides */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <PenLine className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">Naming Overrides</h3>
        </div>
        <p className="text-xs text-slate-500">
          Override the auto-generated names. Leave blank to use naming template from product profile.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Campaign Name</label>
            <input
              type="text"
              value={namingCampaign}
              onChange={(e) => updateLaunchConfig({ newCampaignName: e.target.value })}
              placeholder="Auto-generated"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ad Set Name</label>
            <input
              type="text"
              value={adsetNameOverride}
              onChange={(e) => updateLaunchConfig({ adsetNameOverride: e.target.value })}
              placeholder="Auto-generated"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ad Name</label>
            <input
              type="text"
              value={adNameOverride}
              onChange={(e) => updateLaunchConfig({ adNameOverride: e.target.value })}
              placeholder="Auto-generated"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Multi-Account Launch */}
      <section className="space-y-3">
        <button
          onClick={() => setShowMultiAccount(!showMultiAccount)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900">Multi-Account Launch</h3>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              Optional
            </span>
          </div>
          {showMultiAccount ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showMultiAccount && (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-xs text-slate-500">
              Mirror this test launch to additional ad accounts.
            </p>
            {mirrorAccounts.map((account, idx) => (
              <label
                key={account.adAccountId}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                  account.selected ? 'border-blue-400 bg-blue-50/50' : 'border-slate-200 bg-white'
                )}
              >
                <input
                  type="checkbox"
                  checked={account.selected}
                  onChange={() => {
                    const next = [...mirrorAccounts];
                    next[idx] = { ...next[idx], selected: !next[idx].selected };
                    updateLaunchConfig({ mirrorAccounts: next });
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">{account.adAccountName}</p>
                  <p className="text-xs text-slate-500">
                    {account.adAccountId} &middot; {account.currency}
                  </p>
                </div>
                <div className="relative w-24">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                    $
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={account.budget}
                    onChange={(e) => {
                      const next = [...mirrorAccounts];
                      next[idx] = { ...next[idx], budget: parseInt(e.target.value) || 0 };
                      updateLaunchConfig({ mirrorAccounts: next });
                    }}
                    disabled={!account.selected}
                    className={cn(
                      'w-full rounded-lg border border-slate-200 py-1.5 pl-6 pr-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                      !account.selected && 'cursor-not-allowed bg-slate-50 text-slate-400'
                    )}
                  />
                </div>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* AI Test Rules */}
      <section className="space-y-3">
        <button
          onClick={() => setShowAiRules(!showAiRules)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-slate-900">AI Test Rules</h3>
          </div>
          {showAiRules ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showAiRules && (
          <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
            <p className="text-xs text-slate-600">
              Configure when the AI evaluator should start analyzing creative performance.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Min. Spend ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={aiMinSpend}
                  onChange={(e) =>
                    updateLaunchConfig({ aiMinSpend: parseInt(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Min. Impressions
                </label>
                <input
                  type="number"
                  min={0}
                  value={aiMinImpressions}
                  onChange={(e) =>
                    updateLaunchConfig({
                      aiMinImpressions: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Min. Time (hours)
                </label>
                <input
                  type="number"
                  min={1}
                  value={aiMinHours}
                  onChange={(e) =>
                    updateLaunchConfig({ aiMinHours: parseInt(e.target.value) || 24 })
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Eval Frequency */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Evaluation Frequency
              </label>
              <select
                value={aiEvalFrequency}
                onChange={(e) => updateLaunchConfig({ aiEvalFrequency: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 sm:w-56"
              >
                {EVAL_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-kill toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Auto-Kill Losers</p>
                <p className="text-xs text-slate-500">
                  Automatically pause underperforming creatives
                </p>
              </div>
              <button
                onClick={() => updateLaunchConfig({ autoKill: !autoKill })}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  autoKill ? 'bg-violet-600' : 'bg-slate-200'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                    autoKill ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* Notify toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Notify on Kill</p>
                <p className="text-xs text-slate-500">
                  Send a notification when a creative is auto-killed
                </p>
              </div>
              <button
                onClick={() => updateLaunchConfig({ notifyOnKill: !notifyOnKill })}
                className={cn(
                  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                  notifyOnKill ? 'bg-violet-600' : 'bg-slate-200'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform',
                    notifyOnKill ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
