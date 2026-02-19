import type { MetricKey } from './metrics';

export type WidgetType =
  | 'metric_card'
  | 'line_chart'
  | 'area_chart'
  | 'bar_chart'
  | 'pie_chart'
  | 'table'
  | 'funnel'
  | 'custom_metric';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetConfig {
  id: string;
  type: WidgetType;
  title: string;
  position: WidgetPosition;
  settings: {
    metrics?: MetricKey[];
    dateRange?: string;
    chartColor?: string;
  };
}

export interface FormulaToken {
  type: 'metric' | 'operator' | 'number';
  value: string;
}

export interface CustomMetric {
  id: string;
  name: string;
  formula: FormulaToken[];
  resultFormat: 'currency' | 'percentage' | 'number';
}
