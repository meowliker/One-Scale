import type { DayPartingSchedule, DayPartingPreset, HourlyBudgetRule } from '@/types/automation';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function makeHourRule(hour: number, multiplier: number, days: string[] = ['All']): HourlyBudgetRule {
  let action: HourlyBudgetRule['action'] = 'normal';
  if (multiplier > 1) action = 'scale_up';
  else if (multiplier < 1 && multiplier > 0) action = 'scale_down';
  else if (multiplier === 0) action = 'pause';
  return { hour, days, action, budgetMultiplier: multiplier };
}

// ---------------------------------------------------------------------------
// Peak Hours Strategy schedule rules
// +30% during 8-11am, -30% during 1-5am, normal otherwise
// ---------------------------------------------------------------------------
const peakHoursRules: HourlyBudgetRule[] = [
  // Off-peak: 1am-5am at -30%
  makeHourRule(1, 0.7),
  makeHourRule(2, 0.7),
  makeHourRule(3, 0.7),
  makeHourRule(4, 0.7),
  makeHourRule(5, 0.7),
  // Peak: 8am-11am at +30%
  makeHourRule(8, 1.3),
  makeHourRule(9, 1.3),
  makeHourRule(10, 1.3),
  makeHourRule(11, 1.3),
];

export const mockDayPartingSchedules: DayPartingSchedule[] = [
  {
    id: 'dp-001',
    name: 'Peak Hours Strategy',
    description: 'Scale up +30% during peak morning hours (8-11am) and reduce -30% during off-peak hours (1-5am).',
    status: 'active',
    appliesTo: 'campaigns',
    schedule: peakHoursRules,
    createdAt: '2025-01-12T09:00:00Z',
    lastExecuted: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    executionCount: 47,
  },
];

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

// 1. Peak Hours Scaler — +30% 8-11am, -30% 1-5am, normal rest
const peakHoursScalerRules: HourlyBudgetRule[] = [
  makeHourRule(1, 0.7),
  makeHourRule(2, 0.7),
  makeHourRule(3, 0.7),
  makeHourRule(4, 0.7),
  makeHourRule(5, 0.7),
  makeHourRule(8, 1.3),
  makeHourRule(9, 1.3),
  makeHourRule(10, 1.3),
  makeHourRule(11, 1.3),
];

// 2. Weekday Optimizer — +20% Tue-Wed all day, -15% Sat-Sun all day
const weekdayOptimizerRules: HourlyBudgetRule[] = [];
for (let h = 0; h < 24; h++) {
  weekdayOptimizerRules.push(makeHourRule(h, 1.2, ['Tue', 'Wed']));
  weekdayOptimizerRules.push(makeHourRule(h, 0.85, ['Sat', 'Sun']));
}

// 3. Smart Schedule — performance curve: +20% 9-11am, +10% 7-9pm, -30% midnight-5am, -10% 2-4pm
const smartScheduleRules: HourlyBudgetRule[] = [
  // Off-peak midnight-5am at -30%
  makeHourRule(0, 0.7),
  makeHourRule(1, 0.7),
  makeHourRule(2, 0.7),
  makeHourRule(3, 0.7),
  makeHourRule(4, 0.7),
  makeHourRule(5, 0.7),
  // Morning peak 9-11am at +20%
  makeHourRule(9, 1.2),
  makeHourRule(10, 1.2),
  makeHourRule(11, 1.2),
  // Afternoon dip 2-4pm at -10%
  makeHourRule(14, 0.9),
  makeHourRule(15, 0.9),
  makeHourRule(16, 0.9),
  // Evening peak 7-9pm at +10%
  makeHourRule(19, 1.1),
  makeHourRule(20, 1.1),
  makeHourRule(21, 1.1),
];

export const mockDayPartingPresets: DayPartingPreset[] = [
  {
    id: 'dp-preset-peak',
    name: 'Peak Hours Scaler',
    description: 'Boost budget during peak morning hours and reduce during late night off-peak.',
    icon: 'Zap',
    schedule: peakHoursScalerRules,
    appliesTo: 'campaigns',
  },
  {
    id: 'dp-preset-weekday',
    name: 'Weekday Optimizer',
    description: 'Increase spend on high-performing weekdays (Tue-Wed) and reduce on weekends.',
    icon: 'Calendar',
    schedule: weekdayOptimizerRules,
    appliesTo: 'adsets',
  },
  {
    id: 'dp-preset-smart',
    name: 'Smart Schedule',
    description: 'AI-informed schedule based on typical e-commerce performance curves throughout the day.',
    icon: 'Brain',
    schedule: smartScheduleRules,
    appliesTo: 'campaigns',
  },
];
