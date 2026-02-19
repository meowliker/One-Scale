'use client';

import { useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockIndustryBenchmarks } from '@/data/mockBenchmarks';
import { BenchmarkCard } from './BenchmarkCard';
import { BenchmarkChart } from './BenchmarkChart';

export function BenchmarksClient() {
  const [selectedIndustry, setSelectedIndustry] = useState(
    mockIndustryBenchmarks[0].industry
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const currentBenchmarks = mockIndustryBenchmarks.find(
    (ib) => ib.industry === selectedIndustry
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BarChart3 className="h-6 w-6 text-blue-600" />
            Industry Benchmarks
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Compare your ad performance against industry averages and top
            performers
          </p>
        </div>

        {/* Industry Selector */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            {selectedIndustry}
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                dropdownOpen && 'rotate-180'
              )}
            />
          </button>
          {dropdownOpen && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              {mockIndustryBenchmarks.map((ib) => (
                <button
                  key={ib.industry}
                  onClick={() => {
                    setSelectedIndustry(ib.industry);
                    setDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full px-4 py-2 text-left text-sm hover:bg-gray-50',
                    selectedIndustry === ib.industry
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-700'
                  )}
                >
                  {ib.industry}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Benchmark Cards Grid */}
      {currentBenchmarks && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {currentBenchmarks.benchmarks.map((b) => (
              <BenchmarkCard key={b.metric} data={b} />
            ))}
          </div>

          {/* Chart */}
          <BenchmarkChart benchmarks={currentBenchmarks.benchmarks} />
        </>
      )}
    </div>
  );
}
