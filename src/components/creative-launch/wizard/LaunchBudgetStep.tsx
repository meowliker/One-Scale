'use client';

import { cn } from '@/lib/utils';
import { Calendar, DollarSign, Info } from 'lucide-react';

interface BudgetConfig {
  budgetType: 'daily' | 'lifetime';
  dailyBudget: number;
  lifetimeBudget: number;
  bidStrategy: string;
  startDate: string;
  endDate: string;
  noEndDate: boolean;
}

interface LaunchBudgetStepProps {
  config: BudgetConfig;
  onConfigChange: (config: BudgetConfig) => void;
}

const BID_STRATEGIES = [
  { value: 'LOWEST_COST_WITHOUT_CAP', label: 'Lowest Cost', description: 'Get the most results for your budget' },
  { value: 'LOWEST_COST_WITH_BID_CAP', label: 'Bid Cap', description: 'Control your bid in each auction' },
  { value: 'COST_CAP', label: 'Cost Cap', description: 'Get the most results while keeping cost per result around your target' },
  { value: 'LOWEST_COST_WITH_MIN_ROAS', label: 'Minimum ROAS', description: 'Optimize for a minimum return on ad spend' },
];

export function LaunchBudgetStep({
  config,
  onConfigChange,
}: LaunchBudgetStepProps) {
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Set Your Budget and Schedule</h2>
        <p className="mt-1 text-sm text-slate-600">
          Control how much you spend and when your ads run.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Budget */}
        <div className="space-y-6">
          {/* Budget Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Budget Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, budgetType: 'daily' })}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.budgetType === 'daily'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => onConfigChange({ ...config, budgetType: 'lifetime' })}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                  config.budgetType === 'lifetime'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                )}
              >
                Lifetime
              </button>
            </div>
          </div>

          {/* Budget Amount */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {config.budgetType === 'daily' ? 'Daily Budget' : 'Lifetime Budget'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
              <input
                type="number"
                min={1}
                value={config.budgetType === 'daily' ? config.dailyBudget : config.lifetimeBudget}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  if (config.budgetType === 'daily') {
                    onConfigChange({ ...config, dailyBudget: value });
                  } else {
                    onConfigChange({ ...config, lifetimeBudget: value });
                  }
                }}
                className="w-full rounded-lg border border-slate-200 pl-7 pr-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">
              {config.budgetType === 'daily'
                ? 'The average amount you want to spend per day'
                : 'The total amount you want to spend over the campaign lifetime'}
            </p>
          </div>

          {/* Bid Strategy */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Bid Strategy</label>
            <select
              value={config.bidStrategy}
              onChange={(e) => onConfigChange({ ...config, bidStrategy: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            >
              {BID_STRATEGIES.map(strategy => (
                <option key={strategy.value} value={strategy.value}>
                  {strategy.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              {BID_STRATEGIES.find(s => s.value === config.bidStrategy)?.description}
            </p>
          </div>
        </div>

        {/* Right Column - Schedule */}
        <div className="space-y-6">
          {/* Schedule Header */}
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-slate-400" />
            <h3 className="text-sm font-medium text-slate-700">Schedule</h3>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
            <input
              type="date"
              value={config.startDate}
              min={today}
              onChange={(e) => onConfigChange({ ...config, startDate: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
            <input
              type="date"
              value={config.endDate}
              min={config.startDate || today}
              disabled={config.noEndDate}
              onChange={(e) => onConfigChange({ ...config, endDate: e.target.value })}
              className={cn(
                'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500',
                config.noEndDate && 'bg-slate-100 text-slate-400 cursor-not-allowed'
              )}
            />
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.noEndDate}
                onChange={(e) => onConfigChange({ ...config, noEndDate: e.target.checked, endDate: '' })}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-600">No End Date</span>
            </label>
          </div>

          {/* Budget Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-slate-700">Budget Summary</p>
                <p className="text-xs text-slate-500 mt-1">
                  {config.budgetType === 'daily' ? (
                    <>
                      You'll spend approximately <strong>${config.dailyBudget}/day</strong>.
                      {!config.noEndDate && config.endDate && config.startDate && (
                        <>
                          {' '}Total estimated spend: <strong>
                            ${config.dailyBudget * Math.ceil((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24))}
                          </strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Total budget: <strong>${config.lifetimeBudget}</strong>
                      {!config.noEndDate && config.endDate && config.startDate && (
                        <>
                          {' '}over{' '}
                          <strong>
                            {Math.ceil((new Date(config.endDate).getTime() - new Date(config.startDate).getTime()) / (1000 * 60 * 60 * 24))} days
                          </strong>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
