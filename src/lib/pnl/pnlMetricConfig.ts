export type PnLMetricKey =
  | 'revenue' | 'cogs' | 'adSpend' | 'shipping'
  | 'fees' | 'refunds' | 'chargebacks' | 'customExpenses'
  | 'netProfit' | 'margin' | 'orderCount';

export type Polarity = 'up_good' | 'down_good' | 'neutral';
export type MetricFormat = 'currency' | 'percentage' | 'number';

export interface PnLMetricDef {
  key: PnLMetricKey;
  label: string;
  polarity: Polarity;
  format: MetricFormat;
}

export const PNL_METRICS: Record<PnLMetricKey, PnLMetricDef> = {
  revenue:        { key: 'revenue',        label: 'Revenue',         polarity: 'up_good',   format: 'currency' },
  cogs:           { key: 'cogs',           label: 'COGS',            polarity: 'down_good', format: 'currency' },
  adSpend:        { key: 'adSpend',        label: 'Ad Spend',        polarity: 'down_good', format: 'currency' },
  shipping:       { key: 'shipping',       label: 'Shipping',        polarity: 'down_good', format: 'currency' },
  fees:           { key: 'fees',           label: 'Fees',            polarity: 'down_good', format: 'currency' },
  refunds:        { key: 'refunds',        label: 'Refunds',         polarity: 'down_good', format: 'currency' },
  chargebacks:    { key: 'chargebacks',    label: 'Chargebacks',     polarity: 'down_good', format: 'currency' },
  customExpenses: { key: 'customExpenses', label: 'Custom Expenses', polarity: 'down_good', format: 'currency' },
  netProfit:      { key: 'netProfit',      label: 'Net Profit',      polarity: 'up_good',   format: 'currency' },
  margin:         { key: 'margin',         label: 'Margin',          polarity: 'up_good',   format: 'percentage' },
  orderCount:     { key: 'orderCount',     label: 'Orders',          polarity: 'neutral',   format: 'number' },
};
