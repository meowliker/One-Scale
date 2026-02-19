'use client';

import { useState, useEffect } from 'react';
import { CopyGeneratorForm } from '@/components/ai/CopyGeneratorForm';
import { GeneratedCopyCard } from '@/components/ai/GeneratedCopyCard';
import { CopyInsightsPanel } from '@/components/ai/CopyInsightsPanel';
import { TopPerformingCopy } from '@/components/ai/TopPerformingCopy';
import { generateCopy, getWinningCopy, getCopyInsights } from '@/services/aiCopy';
import type { GeneratedCopy, WinningCopy, CopyInsights } from '@/data/mockAICopy';

export function AICopyGenerator() {
  const [generated, setGenerated] = useState<GeneratedCopy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [winningCopies, setWinningCopies] = useState<WinningCopy[]>([]);
  const [insights, setInsights] = useState<CopyInsights | null>(null);

  useEffect(() => {
    async function loadData() {
      const [winning, insightsData] = await Promise.all([
        getWinningCopy(),
        getCopyInsights(),
      ]);
      setWinningCopies(winning);
      setInsights(insightsData);
    }
    loadData();
  }, []);

  async function handleGenerate(params: {
    product: string;
    tone: string;
    framework: string;
    count: number;
  }) {
    setIsLoading(true);
    try {
      const results = await generateCopy(params);
      setGenerated(results);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column — Generator + Results */}
      <div className="lg:col-span-2 space-y-6">
        {/* Generator Form */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Generate Ad Copy</h2>
          <CopyGeneratorForm onGenerate={handleGenerate} isLoading={isLoading} />
        </div>

        {/* Generated Results */}
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
              <p className="text-sm text-gray-500">
                Generating high-converting copy variations...
              </p>
            </div>
          </div>
        )}

        {!isLoading && generated.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Generated Variations
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({generated.length} results)
                </span>
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {generated.map((copy) => (
                <GeneratedCopyCard key={copy.id} copy={copy} />
              ))}
            </div>
          </div>
        )}

        {!isLoading && generated.length === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8">
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <div className="rounded-full bg-gray-100 p-3">
                <svg
                  className="h-6 w-6 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
                  />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-600">No copy generated yet</p>
              <p className="text-xs text-gray-400">
                Enter a product or topic above and click Generate Copy to get started
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right Column — Insights + Top Performers */}
      <div className="space-y-6">
        {insights && <CopyInsightsPanel insights={insights} />}
        {winningCopies.length > 0 && <TopPerformingCopy copies={winningCopies} />}
      </div>
    </div>
  );
}
