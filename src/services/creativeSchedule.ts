import type { ScheduledCreative, CreativeTest, TestRule } from '@/types/creativeSchedule';
import { mockScheduledCreatives, mockCreativeTests, mockTestRules } from '@/data/mockSchedules';

const USE_MOCK = true;

export async function getScheduledCreatives(): Promise<ScheduledCreative[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockScheduledCreatives;
  }

  return [];
}

export async function getCreativeTests(): Promise<CreativeTest[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockCreativeTests;
  }

  return [];
}

export async function getTestRules(): Promise<TestRule[]> {
  if (USE_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return mockTestRules;
  }

  return [];
}
