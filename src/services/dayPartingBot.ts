import type { DayPartingSchedule, DayPartingPreset, RuleStatus } from '@/types/automation';
import { mockDayPartingSchedules, mockDayPartingPresets } from '@/data/mockDayPartingSchedules';

// In-memory copy so mutations reflect immediately within the same session
let schedules = [...mockDayPartingSchedules];

export async function getDayPartingSchedules(): Promise<DayPartingSchedule[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return schedules;
}

export async function getDayPartingPresets(): Promise<DayPartingPreset[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockDayPartingPresets;
}

export async function createDayPartingSchedule(
  schedule: DayPartingSchedule
): Promise<DayPartingSchedule> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  schedules = [schedule, ...schedules];
  return schedule;
}

export async function updateDayPartingScheduleStatus(
  id: string,
  status: RuleStatus
): Promise<DayPartingSchedule | null> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const index = schedules.findIndex((s) => s.id === id);
  if (index === -1) return null;
  schedules[index] = { ...schedules[index], status };
  return schedules[index];
}

export async function deleteDayPartingSchedule(id: string): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const before = schedules.length;
  schedules = schedules.filter((s) => s.id !== id);
  return schedules.length < before;
}
