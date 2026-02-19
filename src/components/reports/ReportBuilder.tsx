'use client';

import { useState } from 'react';
import { ArrowLeft, Save, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportPreview } from './ReportPreview';
import { ScheduleReportModal } from './ScheduleReportModal';
import toast from 'react-hot-toast';

const allMetrics = [
  'spend',
  'revenue',
  'roas',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'conversions',
  'cpa',
  'aov',
];

const breakdowns = [
  { key: 'campaign', label: 'By Campaign' },
  { key: 'ad_set', label: 'By Ad Set' },
  { key: 'ad', label: 'By Ad' },
  { key: 'day', label: 'By Day' },
];

const dateRanges = [
  { key: 'last_7', label: 'Last 7 Days' },
  { key: 'last_14', label: 'Last 14 Days' },
  { key: 'last_30', label: 'Last 30 Days' },
  { key: 'last_90', label: 'Last 90 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

interface ReportBuilderProps {
  onBack: () => void;
}

export function ReportBuilder({ onBack }: ReportBuilderProps) {
  const [step, setStep] = useState(1);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    'spend',
    'revenue',
    'roas',
    'conversions',
  ]);
  const [dateRange, setDateRange] = useState('last_30');
  const [breakdown, setBreakdown] = useState('campaign');
  const [reportName, setReportName] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric)
        ? prev.filter((m) => m !== metric)
        : [...prev, metric]
    );
  };

  const handleSave = () => {
    const name = reportName.trim() || 'Untitled Report';
    toast.success(`Report "${name}" saved`);
    onBack();
  };

  return (
    <div className="space-y-6">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <input
            type="text"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
            placeholder="Untitled Report"
            className="text-xl font-bold text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Clock className="h-4 w-4" />
            Schedule
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Save className="h-4 w-4" />
            Save Report
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {[
          { n: 1, label: 'Select Metrics' },
          { n: 2, label: 'Date Range' },
          { n: 3, label: 'Breakdown' },
          { n: 4, label: 'Preview' },
        ].map((s) => (
          <button
            key={s.n}
            onClick={() => setStep(s.n)}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              step === s.n
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {s.n}. {s.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Step 1: Select Metrics */}
        {step === 1 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              Select Metrics
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {allMetrics.map((metric) => (
                <label
                  key={metric}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm',
                    selectedMetrics.includes(metric)
                      ? 'border-blue-300 bg-blue-50 font-medium text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedMetrics.includes(metric)}
                    onChange={() => toggleMetric(metric)}
                    className="rounded border-gray-300"
                  />
                  <span className="uppercase">{metric}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Date Range */}
        {step === 2 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              Select Date Range
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {dateRanges.map((dr) => (
                <button
                  key={dr.key}
                  onClick={() => setDateRange(dr.key)}
                  className={cn(
                    'rounded-lg border p-3 text-sm font-medium',
                    dateRange === dr.key
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {dr.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep(1)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Breakdown */}
        {step === 3 && (
          <div>
            <h3 className="mb-4 text-sm font-semibold text-gray-900">
              Select Breakdown
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {breakdowns.map((bd) => (
                <button
                  key={bd.key}
                  onClick={() => setBreakdown(bd.key)}
                  className={cn(
                    'rounded-lg border p-3 text-sm font-medium',
                    breakdown === bd.key
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {bd.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep(4)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Preview
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div>
            <ReportPreview
              metrics={selectedMetrics}
              breakdown={breakdown}
              dateRange={
                dateRanges.find((dr) => dr.key === dateRange)?.label ||
                'Last 30 Days'
              }
            />
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep(3)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSchedule(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Clock className="h-4 w-4" />
                  Schedule
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  <Save className="h-4 w-4" />
                  Save Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ScheduleReportModal
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        reportName={reportName || 'Untitled Report'}
      />
    </div>
  );
}
