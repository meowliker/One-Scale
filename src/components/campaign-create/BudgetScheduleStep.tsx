'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useCampaignCreateStore } from '@/stores/campaignCreateStore';
import { formatDateInTimezone } from '@/lib/timezone';
import type { BidStrategy } from '@/types/campaign';

const BID_STRATEGY_OPTIONS: { value: BidStrategy; label: string }[] = [
  { value: 'LOWEST_COST', label: 'Lowest Cost' },
  { value: 'COST_CAP', label: 'Cost Cap' },
  { value: 'BID_CAP', label: 'Bid Cap' },
  { value: 'MINIMUM_ROAS', label: 'Minimum ROAS' },
];

export function BudgetScheduleStep() {
  const { budget, schedule, setBudget, setSchedule } = useCampaignCreateStore();
  const [noEndDate, setNoEndDate] = useState(schedule.endDate === null);

  const showBidAmount = budget.bidStrategy === 'COST_CAP' || budget.bidStrategy === 'BID_CAP';

  const handleNoEndDateChange = (checked: boolean) => {
    setNoEndDate(checked);
    if (checked) {
      setSchedule({ endDate: null });
    } else {
      // Default to 30 days from start
      const start = new Date(schedule.startDate);
      start.setDate(start.getDate() + 30);
      setSchedule({ endDate: formatDateInTimezone(start) });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Set your budget and schedule</h2>
        <p className="text-sm text-gray-500 mt-1">
          Control how much you spend and when your ads run.
        </p>
      </div>

      {/* Budget Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Budget Type</label>
        <div className="flex gap-2">
          {(['daily', 'lifetime'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setBudget({ type })}
              className={cn(
                'px-5 py-2 text-sm font-medium rounded-lg border transition-colors capitalize',
                budget.type === type
                  ? 'bg-blue-50 border-blue-500 text-blue-700'
                  : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Budget Amount */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {budget.type === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
          <input
            type="number"
            min={1}
            step={1}
            value={budget.amount}
            onChange={(e) => setBudget({ amount: Number(e.target.value) })}
            className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Bid Strategy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Bid Strategy</label>
        <select
          value={budget.bidStrategy}
          onChange={(e) => {
            const strategy = e.target.value as BidStrategy;
            setBudget({
              bidStrategy: strategy,
              bidAmount: strategy === 'COST_CAP' || strategy === 'BID_CAP' ? budget.bidAmount ?? 0 : null,
            });
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {BID_STRATEGY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Bid Amount (conditional) */}
      {showBidAmount && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {budget.bidStrategy === 'COST_CAP' ? 'Cost Cap Amount' : 'Bid Cap Amount'}
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={budget.bidAmount ?? 0}
              onChange={(e) => setBudget({ bidAmount: Number(e.target.value) })}
              className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Schedule */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Schedule</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
            <input
              type="date"
              value={schedule.startDate}
              onChange={(e) => setSchedule({ startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
            <input
              type="date"
              value={schedule.endDate ?? ''}
              onChange={(e) => setSchedule({ endDate: e.target.value })}
              disabled={noEndDate}
              min={schedule.startDate}
              className={cn(
                'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
                noEndDate && 'bg-gray-100 text-gray-400 cursor-not-allowed'
              )}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            type="checkbox"
            checked={noEndDate}
            onChange={(e) => handleNoEndDateChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-600">No End Date</span>
        </label>
      </div>
    </div>
  );
}
