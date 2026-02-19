import { create } from 'zustand';
import type { DateRange, DateRangePreset } from '@/types/analytics';
import { getDateRange, getPreviousPeriod } from '@/lib/dateUtils';

interface DateRangeState {
  dateRange: DateRange;
  comparisonEnabled: boolean;
  comparisonRange: DateRange | null;
  setDateRange: (range: DateRange) => void;
  setPreset: (preset: DateRangePreset) => void;
  toggleComparison: () => void;
}

const defaultRange = getDateRange('last30');

export const useDateRangeStore = create<DateRangeState>()((set, get) => ({
  dateRange: defaultRange,
  comparisonEnabled: false,
  comparisonRange: null,

  setDateRange: (range) => {
    const { comparisonEnabled } = get();
    set({
      dateRange: range,
      comparisonRange: comparisonEnabled ? getPreviousPeriod(range) : null,
    });
  },

  setPreset: (preset) => {
    const range = getDateRange(preset);
    const { comparisonEnabled } = get();
    set({
      dateRange: range,
      comparisonRange: comparisonEnabled ? getPreviousPeriod(range) : null,
    });
  },

  toggleComparison: () => {
    const { comparisonEnabled, dateRange } = get();
    set({
      comparisonEnabled: !comparisonEnabled,
      comparisonRange: !comparisonEnabled ? getPreviousPeriod(dateRange) : null,
    });
  },
}));
