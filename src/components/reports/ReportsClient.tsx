'use client';

import { useState } from 'react';
import {
  FileText,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Clock,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReportBuilder } from './ReportBuilder';
import toast from 'react-hot-toast';

interface SavedReport {
  id: string;
  name: string;
  lastRun: string;
  schedule: string | null;
  metrics: string[];
  breakdown: string;
}

const mockSavedReports: SavedReport[] = [
  {
    id: 'rpt-1',
    name: 'Weekly Campaign Performance',
    lastRun: '2025-03-10',
    schedule: 'Weekly',
    metrics: ['spend', 'revenue', 'roas', 'conversions'],
    breakdown: 'campaign',
  },
  {
    id: 'rpt-2',
    name: 'Daily Ad Set Breakdown',
    lastRun: '2025-03-10',
    schedule: 'Daily',
    metrics: ['spend', 'impressions', 'clicks', 'ctr', 'cpc'],
    breakdown: 'ad_set',
  },
  {
    id: 'rpt-3',
    name: 'Monthly Revenue Report',
    lastRun: '2025-03-01',
    schedule: 'Monthly',
    metrics: ['revenue', 'roas', 'aov', 'conversions'],
    breakdown: 'campaign',
  },
  {
    id: 'rpt-4',
    name: 'Creative Performance Analysis',
    lastRun: '2025-03-08',
    schedule: null,
    metrics: ['spend', 'impressions', 'ctr', 'cpc', 'conversions', 'cpa'],
    breakdown: 'ad',
  },
  {
    id: 'rpt-5',
    name: 'Cost Efficiency Report',
    lastRun: '2025-03-05',
    schedule: null,
    metrics: ['spend', 'cpc', 'cpm', 'cpa'],
    breakdown: 'campaign',
  },
];

export function ReportsClient() {
  const [reports, setReports] = useState(mockSavedReports);
  const [view, setView] = useState<'list' | 'builder'>('list');

  const handleDelete = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
    toast.success('Report deleted');
  };

  if (view === 'builder') {
    return <ReportBuilder onBack={() => setView('list')} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <FileText className="h-6 w-6 text-blue-600" />
            Reports
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Create, schedule, and export custom reports
          </p>
        </div>
        <button
          onClick={() => setView('builder')}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Create Report
        </button>
      </div>

      {/* Reports list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                  Report Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                  Metrics
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                  Last Run
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500">
                  Schedule
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr
                  key={report.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {report.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {report.metrics.slice(0, 4).map((m) => (
                        <span
                          key={m}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-600"
                        >
                          {m}
                        </span>
                      ))}
                      {report.metrics.length > 4 && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          +{report.metrics.length - 4}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-gray-600">
                      <Calendar className="h-3.5 w-3.5" />
                      {report.lastRun}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {report.schedule ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <Clock className="h-3.5 w-3.5" />
                        {report.schedule}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not scheduled</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setView('builder')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setView('builder')}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(report.id)}
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {reports.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="mx-auto mb-3 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">No reports yet</p>
            <button
              onClick={() => setView('builder')}
              className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Create your first report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
