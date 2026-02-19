'use client';

import { useState, useRef, useMemo, useEffect, type DragEvent, type ReactNode } from 'react';
import { Plus, Loader2, Save, RotateCcw, ChevronDown, X } from 'lucide-react';
import type { TimeSeriesDataPoint, DateRangePreset } from '@/types/analytics';
import type { Campaign } from '@/types/campaign';
import type { WidgetType, WidgetConfig } from '@/types/dashboard';
import { cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import { getDateRange } from '@/lib/dateUtils';
import { useDashboardLayoutStore } from '@/stores/dashboardLayoutStore';
import { useSectionOrderStore } from '@/stores/sectionOrderStore';
import { EditModeToggle } from '@/components/dashboard-builder/EditModeToggle';
import { AddWidgetPanel } from '@/components/dashboard-builder/AddWidgetPanel';
import { CustomMetricBuilder } from '@/components/dashboard-builder/CustomMetricBuilder';
import { DraggableSection } from './DraggableSection';
import { mockShopifyFunnel, mockBlendedFunnel } from '@/data/mockAnalytics';
import { LivePerformanceStrip } from './LivePerformanceStrip';
import { MetricsSummaryRow } from './MetricsSummaryRow';
import { SpendRevenueChart } from './SpendRevenueChart';
import { RoasChart } from './RoasChart';
import { ConversionFunnel } from './ConversionFunnel';
import { TopCampaignsTable } from './TopCampaignsTable';
import { AccountHealthScore } from './AccountHealthScore';
import { AccountAudit } from './AccountAudit';
import { FunnelStageBreakdown } from './FunnelStageBreakdown';
import { CrossChannelView } from './CrossChannelView';

export interface AnalyticsDashboardClientProps {
  blendedMetrics: Record<string, number>;
  timeSeries: TimeSeriesDataPoint[];
  topCampaigns: Campaign[];
  datePreset?: DateRangePreset;
  onDatePresetChange?: (preset: DateRangePreset) => void;
  loading?: boolean;
}

const widgetTypeLabels: Record<WidgetType, string> = {
  metric_card: 'Metric Card',
  line_chart: 'Line Chart',
  area_chart: 'Area Chart',
  bar_chart: 'Bar Chart',
  pie_chart: 'Pie Chart',
  table: 'Table',
  funnel: 'Funnel',
  custom_metric: 'Custom Metric',
};

export function AnalyticsDashboardClient({
  blendedMetrics,
  timeSeries,
  topCampaigns,
  datePreset = 'today',
  onDatePresetChange,
  loading = false,
}: AnalyticsDashboardClientProps) {
  const [dateRange, setDateRange] = useState(() => getDateRange(datePreset));
  const [isAddPanelOpen, setIsAddPanelOpen] = useState(false);
  const [isCustomMetricOpen, setIsCustomMetricOpen] = useState(false);
  const [isSavePopoverOpen, setIsSavePopoverOpen] = useState(false);
  const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const draggedSectionRef = useRef<string | null>(null);

  const { isEditMode, addWidget } = useDashboardLayoutStore();
  const {
    sectionOrder,
    savedViews,
    activeViewId,
    setSectionOrder,
    saveView,
    loadView,
    deleteView,
    resetToDefault,
  } = useSectionOrderStore();

  // Build the sections map — each section ID maps to its rendered component
  const sectionsMap = useMemo<Record<string, ReactNode>>(
    () => ({
      'live-strip': <LivePerformanceStrip metrics={blendedMetrics} />,
      'metrics-row': <MetricsSummaryRow metrics={blendedMetrics} />,
      charts: (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <SpendRevenueChart data={timeSeries} datePreset={datePreset} />
          </div>
          <div className="lg:col-span-2">
            <RoasChart data={timeSeries} datePreset={datePreset} />
          </div>
        </div>
      ),
      'conversion-funnel': (
        <ConversionFunnel metrics={blendedMetrics} shopifyFunnel={mockShopifyFunnel} blendedFunnel={mockBlendedFunnel} datePreset={datePreset} />
      ),
      'campaigns-table': <TopCampaignsTable campaigns={topCampaigns} datePreset={datePreset} />,
      'health-audit': (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <AccountHealthScore metrics={blendedMetrics} />
          </div>
          <div className="lg:col-span-2">
            <AccountAudit metrics={blendedMetrics} topCampaigns={topCampaigns} />
          </div>
        </div>
      ),
      'funnel-breakdown': (
        <FunnelStageBreakdown metrics={blendedMetrics} topCampaigns={topCampaigns} />
      ),
      'cross-channel': <CrossChannelView metrics={blendedMetrics} />,
    }),
    [blendedMetrics, timeSeries, topCampaigns, datePreset]
  );

  // Keep picker UI in sync with externally controlled preset from page state.
  useEffect(() => {
    setDateRange(getDateRange(datePreset));
  }, [datePreset]);

  // --- Widget handlers ---
  const handleAddWidget = (type: WidgetType) => {
    if (type === 'custom_metric') {
      setIsCustomMetricOpen(true);
      return;
    }
    const newWidget: WidgetConfig = {
      id: `widget-${Date.now()}`,
      type,
      title: widgetTypeLabels[type],
      position: { x: 0, y: 0, w: 1, h: 1 },
      settings: {},
    };
    addWidget(newWidget);
  };

  const handleDateRangeChange = (range: { start: Date; end: Date; preset?: DateRangePreset }) => {
    setDateRange(range);
    if (range.preset && onDatePresetChange) {
      onDatePresetChange(range.preset);
    }
  };

  // --- Drag-and-drop handlers ---
  const handleDragStart = (_e: DragEvent<HTMLDivElement>, id: string) => {
    draggedSectionRef.current = id;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, _id: string) => {
    e.preventDefault();
  };

  const handleDrop = (_e: DragEvent<HTMLDivElement>, targetId: string) => {
    const draggedId = draggedSectionRef.current;
    if (!draggedId || draggedId === targetId) return;

    const newOrder = [...sectionOrder];
    const draggedIndex = newOrder.indexOf(draggedId);
    const targetIndex = newOrder.indexOf(targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Remove dragged item and insert at target position
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedId);

    setSectionOrder(newOrder);
    draggedSectionRef.current = null;
  };

  const handleDragEnd = () => {
    draggedSectionRef.current = null;
  };

  // --- Save View handlers ---
  const handleSaveView = () => {
    if (!viewName.trim()) return;
    saveView(viewName.trim());
    setViewName('');
    setIsSavePopoverOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Controls bar: Date Range + Edit Mode + View Management */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating...
          </div>
        )}

        {/* View management controls — only shown in edit mode */}
        {isEditMode && (
          <>
            {/* Saved Views pills */}
            {savedViews.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {activeViewId
                    ? savedViews.find((v) => v.id === activeViewId)?.name ?? 'Load View'
                    : 'Load View'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>

                {isViewDropdownOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    {savedViews.map((view) => (
                      <div
                        key={view.id}
                        className={cn(
                          'flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-gray-50',
                          activeViewId === view.id && 'bg-blue-50 text-blue-700'
                        )}
                      >
                        <button
                          onClick={() => {
                            loadView(view.id);
                            setIsViewDropdownOpen(false);
                          }}
                          className="flex-1 text-left"
                        >
                          {view.name}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteView(view.id);
                          }}
                          className="ml-2 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Save View button + popover */}
            <div className="relative">
              <button
                onClick={() => setIsSavePopoverOpen(!isSavePopoverOpen)}
                className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
              >
                <Save className="h-4 w-4" />
                Save View
              </button>

              {isSavePopoverOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    View Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={viewName}
                      onChange={(e) => setViewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveView()}
                      placeholder="e.g. Weekly Review"
                      className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    <button
                      onClick={handleSaveView}
                      disabled={!viewName.trim()}
                      className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reset button */}
            <button
              onClick={resetToDefault}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>

            {/* Add Widget button */}
            <button
              onClick={() => setIsAddPanelOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary-light transition-colors hover:bg-primary/20"
            >
              <Plus className="h-4 w-4" />
              Add Widget
            </button>
          </>
        )}

        <EditModeToggle />
        <DateRangePicker dateRange={dateRange} onRangeChange={handleDateRangeChange} />
      </div>

      {/* Saved views pills (always visible when views exist and in edit mode) */}
      {isEditMode && savedViews.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Views:</span>
          {savedViews.map((view) => (
            <button
              key={view.id}
              onClick={() => loadView(view.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all',
                activeViewId === view.id
                  ? 'border-2 border-blue-500 bg-blue-50 text-blue-700'
                  : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-gray-100'
              )}
            >
              {view.name}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteView(view.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    deleteView(view.id);
                  }
                }}
                className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-gray-200"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Dashboard sections — rendered in store-driven order */}
      {sectionOrder.map((sectionId) => {
        const component = sectionsMap[sectionId];
        if (!component) return null;

        return (
          <DraggableSection
            key={sectionId}
            id={sectionId}
            isEditMode={isEditMode}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          >
            {component}
          </DraggableSection>
        );
      })}

      {/* Add Widget Panel */}
      <AddWidgetPanel
        isOpen={isAddPanelOpen}
        onClose={() => setIsAddPanelOpen(false)}
        onAddWidget={handleAddWidget}
      />

      {/* Custom Metric Builder */}
      <CustomMetricBuilder
        isOpen={isCustomMetricOpen}
        onClose={() => setIsCustomMetricOpen(false)}
      />
    </div>
  );
}
