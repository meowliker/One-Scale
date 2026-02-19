'use client';

import { useState, useMemo } from 'react';
import { Search, ArrowUpDown, Calendar, Import } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import type { ClickUpTask } from '@/types/integrations';

interface ClickUpPanelProps {
  tasks: ClickUpTask[];
  onImportTask: (task: ClickUpTask) => void;
}

const statusConfig: Record<
  ClickUpTask['status'],
  { label: string; className: string }
> = {
  open: { label: 'Open', className: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'In Progress', className: 'bg-blue-50 text-blue-700' },
  review: { label: 'Review', className: 'bg-yellow-50 text-yellow-700' },
  done: { label: 'Done', className: 'bg-green-50 text-green-700' },
};

const priorityConfig: Record<
  ClickUpTask['priority'],
  { label: string; className: string }
> = {
  urgent: { label: 'Urgent', className: 'bg-red-50 text-red-700' },
  high: { label: 'High', className: 'bg-orange-50 text-orange-700' },
  normal: { label: 'Normal', className: 'bg-blue-50 text-blue-700' },
  low: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
};

const creativeTypeConfig: Record<
  ClickUpTask['creativeType'],
  { label: string; className: string }
> = {
  image: { label: 'Image', className: 'bg-purple-50 text-purple-700' },
  video: { label: 'Video', className: 'bg-pink-50 text-pink-700' },
  carousel: { label: 'Carousel', className: 'bg-indigo-50 text-indigo-700' },
};

type StatusFilter = ClickUpTask['status'] | 'all';

export function ClickUpPanel({ tasks, onImportTask }: ClickUpPanelProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<'dueDate' | 'priority'>('dueDate');

  const filteredTasks = useMemo(() => {
    let result = tasks;

    if (statusFilter !== 'all') {
      result = result.filter((t) => t.status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.assignee.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    result = [...result].sort((a, b) => {
      if (sortField === 'dueDate') {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      }
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return result;
  }, [tasks, search, statusFilter, sortField]);

  const handleImport = (task: ClickUpTask) => {
    onImportTask(task);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="review">Review</option>
          <option value="done">Done</option>
        </select>

        <button
          onClick={() =>
            setSortField((f) => (f === 'dueDate' ? 'priority' : 'dueDate'))
          }
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort by {sortField === 'dueDate' ? 'Due Date' : 'Priority'}
        </button>
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Task Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Assignee
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Due Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Priority
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">
                Type
              </th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredTasks.map((task) => {
              const status = statusConfig[task.status];
              const priority = priorityConfig[task.priority];
              const creative = creativeTypeConfig[task.creativeType];

              return (
                <tr
                  key={task.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{task.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {task.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        status.className
                      )}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{task.assignee}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(task.dueDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        priority.className
                      )}
                    >
                      {priority.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                        creative.className
                      )}
                    >
                      {creative.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleImport(task)}
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <Import className="h-3 w-3" />
                      Import to Schedule
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredTasks.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            No tasks found matching your filters.
          </div>
        )}
      </div>
    </div>
  );
}
