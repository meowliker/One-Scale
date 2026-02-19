'use client';

import { BarChart3, TrendingUp, Activity, BarChart, PieChart, Table, Filter, Calculator, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetType } from '@/types/dashboard';

export interface AddWidgetPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (type: WidgetType) => void;
}

const widgetOptions: { type: WidgetType; label: string; icon: React.ElementType }[] = [
  { type: 'metric_card', label: 'Metric Card', icon: BarChart3 },
  { type: 'line_chart', label: 'Line Chart', icon: TrendingUp },
  { type: 'area_chart', label: 'Area Chart', icon: Activity },
  { type: 'bar_chart', label: 'Bar Chart', icon: BarChart },
  { type: 'pie_chart', label: 'Pie Chart', icon: PieChart },
  { type: 'table', label: 'Table', icon: Table },
  { type: 'funnel', label: 'Funnel', icon: Filter },
  { type: 'custom_metric', label: 'Custom Metric', icon: Calculator },
];

export function AddWidgetPanel({ isOpen, onClose, onAddWidget }: AddWidgetPanelProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={cn(
          'fixed right-0 top-0 z-50 h-full w-80 transform bg-white shadow-2xl transition-transform duration-300',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Add Widget</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Widget Grid */}
        <div className="grid grid-cols-2 gap-3 p-6">
          {widgetOptions.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => {
                onAddWidget(type);
                onClose();
              }}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4 text-center transition-colors hover:border-blue-300 hover:bg-blue-50"
            >
              <Icon className="h-6 w-6 text-gray-600" />
              <span className="text-xs font-medium text-gray-700">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
