'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface SurveyResponse {
  channel: string;
  responseCount: number;
  percentage: number;
  attributedRevenue: number;
}

const mockSurveyResults: SurveyResponse[] = [
  { channel: 'Facebook/Instagram Ad', responseCount: 205, percentage: 41.0, attributedRevenue: 48250 },
  { channel: 'Google Search', responseCount: 85, percentage: 17.0, attributedRevenue: 22100 },
  { channel: 'TikTok', responseCount: 65, percentage: 13.0, attributedRevenue: 14300 },
  { channel: 'Friend/Family', responseCount: 55, percentage: 11.0, attributedRevenue: 12650 },
  { channel: 'Email', responseCount: 40, percentage: 8.0, attributedRevenue: 9800 },
  { channel: 'Influencer', responseCount: 30, percentage: 6.0, attributedRevenue: 7200 },
  { channel: 'Other', responseCount: 20, percentage: 4.0, attributedRevenue: 3900 },
];

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#000000',
  '#8b5cf6',
  '#f59e0b',
  '#ec4899',
  '#6b7280',
];

const totalResponses = mockSurveyResults.reduce((a, r) => a + r.responseCount, 0);

export function SurveyResults() {
  const chartData = mockSurveyResults.map((r) => ({
    name: r.channel,
    value: r.responseCount,
  }));

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total Responses</p>
          <p className="text-2xl font-bold text-gray-900">{totalResponses}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Top Channel</p>
          <p className="text-2xl font-bold text-gray-900">
            {mockSurveyResults[0].channel}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Total Attributed Revenue</p>
          <p className="text-2xl font-bold text-gray-900">
            $
            {mockSurveyResults
              .reduce((a, r) => a + r.attributedRevenue, 0)
              .toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie chart */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">
            Response Distribution
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) =>
                  `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value?: number) => [value ?? 0, 'Responses']}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '12px',
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Results table */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">
            Detailed Results
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-medium text-gray-500">Channel</th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Responses
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    %
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {mockSurveyResults.map((r, i) => (
                  <tr
                    key={r.channel}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: COLORS[i % COLORS.length],
                          }}
                        />
                        <span className="text-gray-900">{r.channel}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-gray-700">
                      {r.responseCount}
                    </td>
                    <td className="py-2.5 text-right text-gray-700">
                      {r.percentage}%
                    </td>
                    <td className="py-2.5 text-right font-medium text-gray-900">
                      ${r.attributedRevenue.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
