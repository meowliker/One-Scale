import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ScheduledCreative, CreativeTest, TestRule, ScheduleStatus } from '@/types/creativeSchedule';
import { mockScheduledCreatives, mockCreativeTests, mockTestRules } from '@/data/mockSchedules';

interface CreativeScheduleState {
  scheduledCreatives: ScheduledCreative[];
  tests: CreativeTest[];
  testRules: TestRule[];
  addScheduledCreative: (creative: Omit<ScheduledCreative, 'id' | 'createdAt' | 'status'>) => void;
  updateScheduleStatus: (id: string, status: ScheduleStatus) => void;
  cancelSchedule: (id: string) => void;
  toggleTestRule: (id: string) => void;
}

export const useCreativeScheduleStore = create<CreativeScheduleState>()(
  persist(
    (set, get) => ({
      scheduledCreatives: mockScheduledCreatives,
      tests: mockCreativeTests,
      testRules: mockTestRules,

      addScheduledCreative: (creative) => {
        const newCreative: ScheduledCreative = {
          ...creative,
          id: `sched-${Date.now()}`,
          status: 'queued',
          createdAt: new Date().toISOString(),
        };
        set({ scheduledCreatives: [newCreative, ...get().scheduledCreatives] });
      },

      updateScheduleStatus: (id, status) => {
        set({
          scheduledCreatives: get().scheduledCreatives.map((sc) =>
            sc.id === id ? { ...sc, status } : sc
          ),
        });
      },

      cancelSchedule: (id) => {
        set({
          scheduledCreatives: get().scheduledCreatives.map((sc) =>
            sc.id === id ? { ...sc, status: 'cancelled' as ScheduleStatus } : sc
          ),
        });
      },

      toggleTestRule: (id) => {
        set({
          testRules: get().testRules.map((rule) =>
            rule.id === id ? { ...rule, isActive: !rule.isActive } : rule
          ),
        });
      },
    }),
    { name: 'creative-schedule' }
  )
);
