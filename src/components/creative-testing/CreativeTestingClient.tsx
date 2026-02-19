'use client';

import { useState, useMemo, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Plus, CalendarDays, Clock, FlaskConical, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs } from '@/components/ui/Tabs';
import { ScheduleQueue } from '@/components/creative-testing/ScheduleQueue';
import { ActiveTests } from '@/components/creative-testing/ActiveTests';
import { TestRulesConfig } from '@/components/creative-testing/TestRulesConfig';
import { CreativeCalendar } from '@/components/creative-testing/CreativeCalendar';
import { ScheduleCreativeModal } from '@/components/creative-testing/ScheduleCreativeModal';
import { useCreativeScheduleStore } from '@/stores/creativeScheduleStore';
import type { ScheduledCreative } from '@/types/creativeSchedule';

const tabs = [
  { id: 'queue', label: 'Schedule Queue' },
  { id: 'active', label: 'Active Tests' },
  { id: 'completed', label: 'Completed' },
  { id: 'rules', label: 'Test Rules' },
];

export function CreativeTestingClient() {
  const [activeTab, setActiveTab] = useState('queue');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const {
    scheduledCreatives,
    tests,
    testRules,
    addScheduledCreative,
    updateScheduleStatus,
    cancelSchedule,
    toggleTestRule,
  } = useCreativeScheduleStore();

  // Prevent hydration mismatch with persisted store
  useEffect(() => {
    setMounted(true);
  }, []);

  const queuedCount = useMemo(
    () => scheduledCreatives.filter((c) => c.status === 'queued' || c.status === 'scheduled').length,
    [scheduledCreatives]
  );

  const activeTestCount = useMemo(
    () => tests.filter((t) => t.status === 'running').length,
    [tests]
  );

  const winnersFound = useMemo(
    () => tests.filter((t) => t.status === 'winner_found').length,
    [tests]
  );

  const queueCreatives = useMemo(
    () => scheduledCreatives.filter((c) => c.status !== 'completed' && c.status !== 'cancelled'),
    [scheduledCreatives]
  );

  const completedCreatives = useMemo(
    () => scheduledCreatives.filter((c) => c.status === 'completed' || c.status === 'cancelled'),
    [scheduledCreatives]
  );

  const activeTests = useMemo(
    () => tests.filter((t) => t.status === 'running'),
    [tests]
  );

  const completedTests = useMemo(
    () => tests.filter((t) => t.status !== 'running'),
    [tests]
  );

  const handleCancel = (id: string) => {
    cancelSchedule(id);
    const creative = scheduledCreatives.find((c) => c.id === id);
    if (creative) {
      toast.success(`"${creative.name}" cancelled`);
    }
  };

  const handleLaunchNow = (id: string) => {
    updateScheduleStatus(id, 'active');
    const creative = scheduledCreatives.find((c) => c.id === id);
    if (creative) {
      toast.success(`"${creative.name}" launched!`);
    }
  };

  const handleSaveCreative = (creative: Omit<ScheduledCreative, 'id' | 'createdAt' | 'status'>) => {
    addScheduledCreative(creative);
    toast.success('Creative scheduled successfully');
  };

  const handleToggleRule = (id: string) => {
    toggleTestRule(id);
    const rule = testRules.find((r) => r.id === id);
    if (rule) {
      toast.success(`Rule "${rule.name}" ${rule.isActive ? 'disabled' : 'enabled'}`);
    }
  };

  if (!mounted) {
    return (
      <div className="space-y-6">
        <div className="h-20 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
        <div className="h-64 rounded-lg bg-gray-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Queued"
          value={queuedCount}
          color="text-gray-600"
          bg="bg-gray-100"
        />
        <StatCard
          icon={FlaskConical}
          label="Active Tests"
          value={activeTestCount}
          color="text-blue-600"
          bg="bg-blue-100"
        />
        <StatCard
          icon={Trophy}
          label="Winners Found"
          value={winnersFound}
          color="text-green-600"
          bg="bg-green-100"
        />
        <StatCard
          icon={CalendarDays}
          label="Total Scheduled"
          value={scheduledCreatives.length}
          color="text-purple-600"
          bg="bg-purple-100"
        />
      </div>

      {/* Tabs + action button */}
      <div className="flex items-center justify-between">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Schedule Creative
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'queue' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ScheduleQueue
              creatives={queueCreatives}
              onCancel={handleCancel}
              onLaunchNow={handleLaunchNow}
            />
          </div>
          <div>
            <CreativeCalendar creatives={scheduledCreatives} />
          </div>
        </div>
      )}

      {activeTab === 'active' && <ActiveTests tests={activeTests} />}

      {activeTab === 'completed' && (
        <div className="space-y-6">
          {completedTests.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Completed Tests</h3>
              <ActiveTests tests={completedTests} />
            </div>
          )}
          {completedCreatives.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Completed / Cancelled Schedules</h3>
              <ScheduleQueue
                creatives={completedCreatives}
                onCancel={handleCancel}
                onLaunchNow={handleLaunchNow}
              />
            </div>
          )}
          {completedTests.length === 0 && completedCreatives.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <Trophy className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-4 text-sm text-gray-500">No completed tests or schedules yet</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'rules' && (
        <TestRulesConfig rules={testRules} onToggle={handleToggleRule} />
      )}

      {/* Schedule modal */}
      <ScheduleCreativeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveCreative}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: typeof Clock;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className={cn('rounded-lg p-2', bg)}>
        <Icon className={cn('h-5 w-5', color)} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
