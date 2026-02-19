'use client';

import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Clock, Plus, Trash2, Zap, Calendar, Brain, ToggleLeft, ToggleRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DayPartingSchedule, DayPartingPreset, HourlyBudgetRule } from '@/types/automation';
import { Modal } from '@/components/ui/Modal';
import { DayPartingScheduleEditor } from '@/components/automation/DayPartingScheduleEditor';
import { mockDayPartingPresets } from '@/data/mockDayPartingSchedules';

interface DayPartingBotPanelProps {
  initialSchedules: DayPartingSchedule[];
  presets: DayPartingPreset[];
}

const presetIcons: Record<string, React.ReactNode> = {
  Zap: <Zap className="h-5 w-5 text-yellow-400" />,
  Calendar: <Calendar className="h-5 w-5 text-blue-400" />,
  Brain: <Brain className="h-5 w-5 text-purple-400" />,
};

function getCellColor(multiplier: number): string {
  if (multiplier === 0) return 'bg-red-900/60';
  if (multiplier >= 1.3) return 'bg-green-600/60';
  if (multiplier >= 1.1) return 'bg-green-500/40';
  if (multiplier > 1.0) return 'bg-green-400/30';
  if (multiplier === 1.0) return 'bg-surface-hover';
  if (multiplier >= 0.8) return 'bg-orange-600/40';
  return 'bg-orange-700/50';
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getMultiplierForHour(schedule: HourlyBudgetRule[], hour: number): number {
  const rule = schedule.find((r) => r.hour === hour && r.days.includes('All'));
  return rule ? rule.budgetMultiplier : 1.0;
}

export function DayPartingBotPanel({ initialSchedules, presets }: DayPartingBotPanelProps) {
  const [schedules, setSchedules] = useState<DayPartingSchedule[]>(initialSchedules);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Create/edit modal state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAppliesTo, setEditAppliesTo] = useState<'campaigns' | 'adsets'>('campaigns');
  const [editScheduleRules, setEditScheduleRules] = useState<HourlyBudgetRule[]>([]);

  const resetForm = useCallback(() => {
    setEditName('');
    setEditDescription('');
    setEditAppliesTo('campaigns');
    setEditScheduleRules([]);
  }, []);

  const handleOpenCreate = useCallback(() => {
    resetForm();
    setIsCreateOpen(true);
  }, [resetForm]);

  const handleCloseCreate = useCallback(() => {
    resetForm();
    setIsCreateOpen(false);
  }, [resetForm]);

  const handleSave = useCallback(() => {
    if (!editName.trim()) {
      toast.error('Please enter a schedule name');
      return;
    }

    const newSchedule: DayPartingSchedule = {
      id: `dp-${Date.now()}`,
      name: editName.trim(),
      description: editDescription.trim(),
      status: 'active',
      appliesTo: editAppliesTo,
      schedule: editScheduleRules,
      createdAt: new Date().toISOString(),
      lastExecuted: null,
      executionCount: 0,
    };

    setSchedules((prev) => [newSchedule, ...prev]);
    setIsCreateOpen(false);
    resetForm();
    toast.success(`Schedule "${newSchedule.name}" created`);
  }, [editName, editDescription, editAppliesTo, editScheduleRules, resetForm]);

  const handleToggle = useCallback((id: string) => {
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === 'active' ? 'paused' as const : 'active' as const }
          : s
      )
    );
    const schedule = schedules.find((s) => s.id === id);
    if (schedule) {
      const newStatus = schedule.status === 'active' ? 'paused' : 'active';
      toast.success(`Schedule "${schedule.name}" ${newStatus}`);
    }
  }, [schedules]);

  const handleDelete = useCallback((id: string) => {
    const schedule = schedules.find((s) => s.id === id);
    setSchedules((prev) => prev.filter((s) => s.id !== id));
    if (schedule) {
      toast.success(`Schedule "${schedule.name}" deleted`);
    }
  }, [schedules]);

  const handleUsePreset = useCallback((preset: DayPartingPreset) => {
    const newSchedule: DayPartingSchedule = {
      id: `dp-${Date.now()}`,
      name: preset.name,
      description: preset.description,
      status: 'active',
      appliesTo: preset.appliesTo,
      schedule: [...preset.schedule],
      createdAt: new Date().toISOString(),
      lastExecuted: null,
      executionCount: 0,
    };
    setSchedules((prev) => [newSchedule, ...prev]);
    toast.success(`Schedule created from preset "${preset.name}"`);
  }, []);

  const handleAIRecommendation = useCallback(() => {
    // Use the Smart Schedule preset as the "AI recommendation"
    const smartPreset = mockDayPartingPresets.find((p) => p.icon === 'Brain');
    if (smartPreset) {
      setEditScheduleRules([...smartPreset.schedule]);
      toast.success('AI recommendation applied to schedule');
    }
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20">
            <Clock className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Day-Parting Bot</h2>
            <p className="text-sm text-text-muted">
              Automatically adjust budgets by hour and day of week
            </p>
          </div>
        </div>
        <button
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Schedule
        </button>
      </div>

      {/* Active Schedules */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Active Schedules
        </h3>

        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-surface py-12">
            <Clock className="h-10 w-10 text-text-dimmed" />
            <h3 className="mt-3 text-sm font-semibold text-text-primary">No schedules yet</h3>
            <p className="mt-1 text-sm text-text-muted">
              Create your first day-parting schedule or use a preset to get started.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="rounded-lg border border-border bg-surface-elevated p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-text-primary truncate">
                        {schedule.name}
                      </h4>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          schedule.status === 'active'
                            ? 'bg-green-900/30 text-green-400'
                            : 'bg-yellow-900/30 text-yellow-400'
                        )}
                      >
                        {schedule.status}
                      </span>
                      <span className="text-xs text-text-dimmed">
                        Applies to: {schedule.appliesTo}
                      </span>
                    </div>
                    {schedule.description && (
                      <p className="mt-1 text-xs text-text-muted truncate">
                        {schedule.description}
                      </p>
                    )}

                    {/* Compact 24-hour timeline bar */}
                    <div className="mt-3 flex items-center gap-px">
                      {Array.from({ length: 24 }, (_, h) => {
                        const m = getMultiplierForHour(schedule.schedule, h);
                        return (
                          <div
                            key={h}
                            className={cn(
                              'h-4 flex-1 first:rounded-l last:rounded-r',
                              getCellColor(m)
                            )}
                            title={`${h}:00 - ${m === 0 ? 'Paused' : m === 1 ? 'Normal' : `${Math.round(m * 100)}%`}`}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-text-dimmed">
                      <span>12am</span>
                      <span>6am</span>
                      <span>12pm</span>
                      <span>6pm</span>
                      <span>11pm</span>
                    </div>

                    {/* Stats */}
                    <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                      {schedule.lastExecuted && (
                        <span>Last executed: {timeAgo(schedule.lastExecuted)}</span>
                      )}
                      <span>Triggered {schedule.executionCount} times</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(schedule.id)}
                      className="p-1.5 rounded-md hover:bg-surface-hover transition-colors"
                      title={schedule.status === 'active' ? 'Pause schedule' : 'Activate schedule'}
                    >
                      {schedule.status === 'active' ? (
                        <ToggleRight className="h-5 w-5 text-green-400" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-text-dimmed" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(schedule.id)}
                      className="p-1.5 rounded-md hover:bg-red-900/30 transition-colors"
                      title="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
          Presets
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className="rounded-lg border border-border bg-surface-elevated p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-hover">
                  {presetIcons[preset.icon] || <Zap className="h-5 w-5 text-yellow-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-text-primary">{preset.name}</h4>
                  <p className="mt-1 text-xs text-text-muted">{preset.description}</p>
                  <button
                    onClick={() => handleUsePreset(preset)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30 transition-colors"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Use Preset
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={handleCloseCreate}
        title="Create Day-Parting Schedule"
        size="lg"
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Schedule Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Peak Hours Strategy"
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="Describe what this schedule does..."
              rows={2}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Applies To */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Applies To
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appliesTo"
                  value="campaigns"
                  checked={editAppliesTo === 'campaigns'}
                  onChange={() => setEditAppliesTo('campaigns')}
                  className="text-primary focus:ring-primary"
                />
                <span className="text-sm text-text-primary">Campaigns</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="appliesTo"
                  value="adsets"
                  checked={editAppliesTo === 'adsets'}
                  onChange={() => setEditAppliesTo('adsets')}
                  className="text-primary focus:ring-primary"
                />
                <span className="text-sm text-text-primary">Ad Sets</span>
              </label>
            </div>
          </div>

          {/* Schedule Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-text-secondary">
                Budget Schedule
              </label>
              <button
                onClick={handleAIRecommendation}
                className="inline-flex items-center gap-1.5 rounded-md bg-purple-600/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-600/30 transition-colors"
              >
                <Brain className="h-3.5 w-3.5" />
                Use AI Recommendation
              </button>
            </div>
            <DayPartingScheduleEditor
              schedule={editScheduleRules}
              onChange={setEditScheduleRules}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-border pt-4">
          <button
            onClick={handleCloseCreate}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!editName.trim()}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors',
              editName.trim()
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-surface-hover text-text-dimmed cursor-not-allowed'
            )}
          >
            Save Schedule
          </button>
        </div>
      </Modal>
    </div>
  );
}
