'use client';

import { TrendingUp, TrendingDown, Minus, Hash, FileText, MousePointerClick, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CopyInsights } from '@/data/mockAICopy';

interface CopyInsightsPanelProps {
  insights: CopyInsights;
}

const performanceIcon = {
  above: TrendingUp,
  below: TrendingDown,
  average: Minus,
};

const performanceColor = {
  above: 'text-green-600',
  below: 'text-red-600',
  average: 'text-gray-500',
};

const performanceBg = {
  above: 'bg-green-50',
  below: 'bg-red-50',
  average: 'bg-gray-50',
};

export function CopyInsightsPanel({ insights }: CopyInsightsPanelProps) {
  return (
    <div className="space-y-6">
      {/* Top Phrases */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Hash className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Top Performing Phrases</h3>
        </div>
        <div className="space-y-2">
          {insights.topPhrases.slice(0, 6).map((phrase) => (
            <div
              key={phrase.phrase}
              className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2"
            >
              <span className="text-sm text-gray-700 font-medium">
                &ldquo;{phrase.phrase}&rdquo;
              </span>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{phrase.frequency}x used</span>
                <span className="font-semibold text-green-600">{phrase.avgCtr}% CTR</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Word Count Stats */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-purple-600" />
          <h3 className="text-sm font-semibold text-gray-900">Avg Word Count</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md bg-purple-50 px-3 py-3 text-center">
            <p className="text-lg font-bold text-purple-700">{insights.avgWordCount.primaryText}</p>
            <p className="text-xs text-purple-500 mt-0.5">Primary Text</p>
          </div>
          <div className="rounded-md bg-blue-50 px-3 py-3 text-center">
            <p className="text-lg font-bold text-blue-700">{insights.avgWordCount.headline}</p>
            <p className="text-xs text-blue-500 mt-0.5">Headline</p>
          </div>
          <div className="rounded-md bg-green-50 px-3 py-3 text-center">
            <p className="text-lg font-bold text-green-700">{insights.avgWordCount.description}</p>
            <p className="text-xs text-green-500 mt-0.5">Description</p>
          </div>
        </div>
      </div>

      {/* Top CTAs */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <MousePointerClick className="h-4 w-4 text-green-600" />
          <h3 className="text-sm font-semibold text-gray-900">Top CTAs by Conversion Rate</h3>
        </div>
        <div className="space-y-2">
          {insights.topCTAs.map((item, index) => (
            <div key={item.cta} className="flex items-center gap-3">
              <span className="text-xs font-bold text-gray-400 w-5">#{index + 1}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{item.cta}</span>
                  <span className="text-xs font-semibold text-green-600">
                    {item.conversionRate}%
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-green-500 transition-all"
                    style={{ width: `${(item.conversionRate / 5) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tone Analysis */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette className="h-4 w-4 text-orange-600" />
          <h3 className="text-sm font-semibold text-gray-900">Tone Distribution & Performance</h3>
        </div>
        <div className="space-y-3">
          {insights.toneAnalysis.map((item) => {
            const Icon = performanceIcon[item.performance];
            return (
              <div key={item.tone} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{item.tone}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">{item.percentage}%</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        performanceBg[item.performance],
                        performanceColor[item.performance]
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {item.performance}
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100">
                  <div
                    className={cn(
                      'h-2 rounded-full transition-all',
                      item.performance === 'above'
                        ? 'bg-green-500'
                        : item.performance === 'below'
                        ? 'bg-red-400'
                        : 'bg-gray-400'
                    )}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
