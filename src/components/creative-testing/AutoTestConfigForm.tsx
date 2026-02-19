'use client';

import { useState } from 'react';
import {
  Rocket,
  DollarSign,
  XCircle,
  TrendingUp,
  Activity,
  Save,
} from 'lucide-react';
import type { AutoTestConfig } from '@/data/mockAutoTestRules';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui/Toggle';
import toast from 'react-hot-toast';

interface AutoTestConfigFormProps {
  initialConfig: AutoTestConfig;
}

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const durationOptions = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
];

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-gray-500" />
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClasses =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors';

const selectClasses =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors';

export function AutoTestConfigForm({ initialConfig }: AutoTestConfigFormProps) {
  const [config, setConfig] = useState<AutoTestConfig>(initialConfig);

  function updateField<K extends keyof AutoTestConfig>(key: K, value: AutoTestConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    toast.success('Auto-test configuration saved successfully');
  }

  return (
    <div className="space-y-6">
      {/* Master Toggle */}
      <div className="flex items-center justify-between rounded-lg border bg-white p-4 shadow-sm">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Enable Auto-Testing</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Automatically launch, evaluate, and manage creative tests
          </p>
        </div>
        <Toggle
          checked={config.isEnabled}
          onChange={(checked) => updateField('isEnabled', checked)}
        />
      </div>

      <div className={cn(!config.isEnabled && 'pointer-events-none opacity-50')}>
        {/* Launch Settings */}
        <div className="rounded-lg border bg-white p-5 shadow-sm">
          <SectionHeader icon={Rocket} title="Launch Settings" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Launch Day">
              <select
                value={config.launchDay}
                onChange={(e) => updateField('launchDay', e.target.value)}
                className={selectClasses}
              >
                {daysOfWeek.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Creatives per Launch">
              <input
                type="number"
                min={1}
                max={10}
                value={config.launchCount}
                onChange={(e) => updateField('launchCount', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Default Campaign">
              <input
                type="text"
                value={config.defaultCampaignName}
                onChange={(e) => updateField('defaultCampaignName', e.target.value)}
                placeholder="Campaign name"
                className={inputClasses}
              />
            </FormField>

            <FormField label="Default Audience">
              <input
                type="text"
                value={config.defaultAudience}
                onChange={(e) => updateField('defaultAudience', e.target.value)}
                placeholder="Audience targeting"
                className={inputClasses}
              />
            </FormField>
          </div>
        </div>

        {/* Budget Settings */}
        <div className="mt-4 rounded-lg border bg-white p-5 shadow-sm">
          <SectionHeader icon={DollarSign} title="Budget Settings" />
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Min Budget per Test ($)">
              <input
                type="number"
                min={5}
                value={config.minBudgetPerTest}
                onChange={(e) => updateField('minBudgetPerTest', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Max Budget per Test ($)">
              <input
                type="number"
                min={5}
                value={config.maxBudgetPerTest}
                onChange={(e) => updateField('maxBudgetPerTest', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Max Concurrent Tests">
              <input
                type="number"
                min={1}
                max={20}
                value={config.maxConcurrentTests}
                onChange={(e) => updateField('maxConcurrentTests', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Test Duration">
              <select
                value={config.testDurationDays}
                onChange={(e) => updateField('testDurationDays', Number(e.target.value))}
                className={selectClasses}
              >
                {durationOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </div>

        {/* Auto-Kill Rules */}
        <div className="mt-4 rounded-lg border bg-white p-5 shadow-sm">
          <SectionHeader icon={XCircle} title="Auto-Kill Rules" />
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Kill if CPA > ($)">
              <input
                type="number"
                min={0}
                step={0.5}
                value={config.autoKillCPA}
                onChange={(e) => updateField('autoKillCPA', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Kill if ROAS <">
              <input
                type="number"
                min={0}
                step={0.1}
                value={config.autoKillROAS}
                onChange={(e) => updateField('autoKillROAS', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>
          </div>
        </div>

        {/* Auto-Scale Rules */}
        <div className="mt-4 rounded-lg border bg-white p-5 shadow-sm">
          <SectionHeader icon={TrendingUp} title="Auto-Scale Rules" />
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Scale if CPA < ($)">
              <input
                type="number"
                min={0}
                step={0.5}
                value={config.autoScaleCPA}
                onChange={(e) => updateField('autoScaleCPA', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Scale if ROAS >">
              <input
                type="number"
                min={0}
                step={0.1}
                value={config.autoScaleROAS}
                onChange={(e) => updateField('autoScaleROAS', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>

            <FormField label="Scale Budget ($)">
              <input
                type="number"
                min={0}
                value={config.autoScaleBudget}
                onChange={(e) => updateField('autoScaleBudget', Number(e.target.value))}
                className={inputClasses}
              />
            </FormField>
          </div>
        </div>

        {/* Fatigue Detection */}
        <div className="mt-4 rounded-lg border bg-white p-5 shadow-sm">
          <SectionHeader icon={Activity} title="Fatigue Detection" />
          <div className="space-y-4">
            <FormField label={`Fatigue Threshold: ${config.fatigueThreshold}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={config.fatigueThreshold}
                onChange={(e) => updateField('fatigueThreshold', Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-orange-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </FormField>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto-replace from queue</p>
                <p className="text-xs text-gray-500">
                  Automatically replace fatigued creatives with next in queue
                </p>
              </div>
              <Toggle
                checked={true}
                onChange={() => {
                  /* toggle auto-replace */
                }}
                size="sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        <Save className="h-4 w-4" />
        Save Configuration
      </button>
    </div>
  );
}
