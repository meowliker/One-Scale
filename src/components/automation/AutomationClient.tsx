'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import type { AutomationRule, RulePreset, RuleLogEntry, DayPartingSchedule, DayPartingPreset } from '@/types/automation';
import { Tabs } from '@/components/ui/Tabs';
import { RulesList } from '@/components/automation/RulesList';
import { RulePresetCards } from '@/components/automation/RulePresetCards';
import { ActivityLog } from '@/components/automation/ActivityLog';
import { RuleCreateModal } from '@/components/automation/RuleCreateModal';
import { DayPartingBotPanel } from '@/components/automation/DayPartingBotPanel';

interface AutomationClientProps {
  initialRules: AutomationRule[];
  presets: RulePreset[];
  log: RuleLogEntry[];
  dayPartingSchedules: DayPartingSchedule[];
  dayPartingPresets: DayPartingPreset[];
}

const tabs = [
  { id: 'rules', label: 'Active Rules' },
  { id: 'presets', label: 'Presets' },
  { id: 'log', label: 'Activity Log' },
  { id: 'dayparting', label: 'Day-Parting Bot' },
];

export function AutomationClient({ initialRules, presets, log, dayPartingSchedules, dayPartingPresets }: AutomationClientProps) {
  const [rules, setRules] = useState<AutomationRule[]>(initialRules);
  const [activeTab, setActiveTab] = useState('rules');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const handleToggle = (id: string) => {
    setRules((prev) =>
      prev.map((rule) =>
        rule.id === id
          ? { ...rule, status: rule.status === 'active' ? 'paused' : 'active' }
          : rule
      )
    );
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      const newStatus = rule.status === 'active' ? 'paused' : 'active';
      toast.success(`Rule "${rule.name}" ${newStatus}`);
    }
  };

  const handleDelete = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    setRules((prev) => prev.filter((r) => r.id !== id));
    if (rule) {
      toast.success(`Rule "${rule.name}" deleted`);
    }
  };

  const handleCreate = (rule: AutomationRule) => {
    setRules((prev) => [rule, ...prev]);
    setIsCreateOpen(false);
    toast.success(`Rule "${rule.name}" created`);
  };

  const handleUsePreset = (preset: RulePreset) => {
    const newRule: AutomationRule = {
      id: `rule-${Date.now()}`,
      name: preset.name,
      description: preset.description,
      status: 'active',
      conditions: preset.conditions,
      action: preset.action,
      frequency: preset.frequency,
      appliesTo: preset.appliesTo,
      lastTriggered: null,
      triggerCount: 0,
      createdAt: new Date().toISOString(),
    };
    setRules((prev) => [newRule, ...prev]);
    setActiveTab('rules');
    toast.success(`Rule created from preset "${preset.name}"`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Rule
        </button>
      </div>

      {activeTab === 'rules' && (
        <RulesList rules={rules} onToggle={handleToggle} onDelete={handleDelete} />
      )}

      {activeTab === 'presets' && (
        <RulePresetCards presets={presets} onUsePreset={handleUsePreset} />
      )}

      {activeTab === 'log' && <ActivityLog log={log} />}

      {activeTab === 'dayparting' && (
        <DayPartingBotPanel initialSchedules={dayPartingSchedules} presets={dayPartingPresets} />
      )}

      <RuleCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSave={handleCreate}
      />
    </div>
  );
}
