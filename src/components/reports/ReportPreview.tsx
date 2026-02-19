'use client';

import { Download, FileText } from 'lucide-react';
import toast from 'react-hot-toast';

interface ReportPreviewProps {
  metrics: string[];
  breakdown: string;
  dateRange: string;
}

interface MockRow {
  name: string;
  spend: number;
  revenue: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  cpa: number;
  aov: number;
  [key: string]: string | number;
}

const mockRows: MockRow[] = [
  { name: 'Summer Sale 2025', spend: 4520, revenue: 15680, roas: 3.47, impressions: 320000, clicks: 6400, ctr: 2.0, cpc: 0.71, cpm: 14.13, conversions: 156, cpa: 28.97, aov: 100.51 },
  { name: 'New Collection Launch', spend: 3200, revenue: 11840, roas: 3.70, impressions: 245000, clicks: 5100, ctr: 2.08, cpc: 0.63, cpm: 13.06, conversions: 128, cpa: 25.0, aov: 92.50 },
  { name: 'Retargeting - Cart', spend: 1800, revenue: 8640, roas: 4.80, impressions: 95000, clicks: 2850, ctr: 3.0, cpc: 0.63, cpm: 18.95, conversions: 108, cpa: 16.67, aov: 80.0 },
  { name: 'Lookalike 1% - US', spend: 5100, revenue: 14280, roas: 2.80, impressions: 420000, clicks: 7560, ctr: 1.8, cpc: 0.67, cpm: 12.14, conversions: 142, cpa: 35.92, aov: 100.56 },
  { name: 'Interest - Yoga', spend: 2400, revenue: 9120, roas: 3.80, impressions: 180000, clicks: 4320, ctr: 2.4, cpc: 0.56, cpm: 13.33, conversions: 114, cpa: 21.05, aov: 80.0 },
];

const metricFormatters: Record<string, (v: number) => string> = {
  spend: (v) => `$${v.toLocaleString()}`,
  revenue: (v) => `$${v.toLocaleString()}`,
  roas: (v) => `${v.toFixed(2)}x`,
  impressions: (v) => v.toLocaleString(),
  clicks: (v) => v.toLocaleString(),
  ctr: (v) => `${v.toFixed(2)}%`,
  cpc: (v) => `$${v.toFixed(2)}`,
  cpm: (v) => `$${v.toFixed(2)}`,
  conversions: (v) => v.toString(),
  cpa: (v) => `$${v.toFixed(2)}`,
  aov: (v) => `$${v.toFixed(2)}`,
};

export function ReportPreview({ metrics, breakdown, dateRange }: ReportPreviewProps) {
  const handleExport = (format: 'csv' | 'pdf') => {
    toast.success(`Report exported as ${format.toUpperCase()}`);
  };

  const visibleMetrics = metrics.length > 0 ? metrics : ['spend', 'revenue', 'roas', 'conversions'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Report Preview
          </h3>
          <p className="text-xs text-gray-500">
            Breakdown by {breakdown} | {dateRange}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                {breakdown === 'campaign' ? 'Campaign' : breakdown === 'ad_set' ? 'Ad Set' : breakdown === 'ad' ? 'Ad' : 'Date'}
              </th>
              {visibleMetrics.map((m) => (
                <th
                  key={m}
                  className="px-4 py-2.5 text-right text-xs font-medium uppercase text-gray-500"
                >
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mockRows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
              >
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {row.name}
                </td>
                {visibleMetrics.map((m) => (
                  <td
                    key={m}
                    className="px-4 py-2.5 text-right text-gray-700"
                  >
                    {metricFormatters[m]
                      ? metricFormatters[m](row[m] as number)
                      : row[m]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
              <td className="px-4 py-2.5 text-gray-900">Total</td>
              {visibleMetrics.map((m) => {
                const total = mockRows.reduce((a, r) => a + (r[m] as number), 0);
                const isAvg = ['roas', 'ctr', 'cpc', 'cpm', 'cpa', 'aov'].includes(m);
                const value = isAvg ? total / mockRows.length : total;
                return (
                  <td
                    key={m}
                    className="px-4 py-2.5 text-right text-gray-900"
                  >
                    {metricFormatters[m] ? metricFormatters[m](value) : value}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
