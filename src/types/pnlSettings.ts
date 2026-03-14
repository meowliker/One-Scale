// ------ P&L Cost Settings Types ------

export type ProductType = 'physical' | 'digital';

export interface StoreProductType {
  productType: ProductType;
}

export interface ProductCost {
  id?: number;
  productId: string;
  productName: string;
  sku: string;
  costPerUnit: number;
  costType: 'fixed' | 'percentage';
  effectiveDate: string;
}

export type ShippingMethod = 'flat_rate' | 'percentage' | 'equal_charged' | 'per_item';

export interface ShippingSettings {
  method: ShippingMethod;
  flatRate: number;
  percentage: number;
  perItemRate: number;
}

export interface PaymentFee {
  id?: number;
  gatewayName: string;
  feePercentage: number;
  feeFixed: number;
  isActive: boolean;
}

export type ExpenseCategory = 'fixed' | 'variable';
export type ExpenseFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'one_time';
export type ExpenseDistribution = 'daily' | 'hourly' | 'smart';

export interface CustomExpense {
  id?: number;
  name: string;
  category: ExpenseCategory;
  amount: number;
  frequency: ExpenseFrequency;
  distribution: ExpenseDistribution;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
}

export type HandlingFeeType = 'per_order' | 'per_item' | 'percentage';

export interface HandlingFees {
  feeType: HandlingFeeType;
  amount: number;
}

export interface PnLSettings {
  productType: ProductType;
  productCosts: ProductCost[];
  shipping: ShippingSettings;
  paymentFees: PaymentFee[];
  customExpenses: CustomExpense[];
  handling: HandlingFees;
}

// Default settings
export const defaultShippingSettings: ShippingSettings = {
  method: 'flat_rate',
  flatRate: 0,
  percentage: 5,
  perItemRate: 0,
};

export const defaultHandlingFees: HandlingFees = {
  feeType: 'per_order',
  amount: 0,
};

// Common payment gateways presets
export const commonPaymentGateways: { name: string; defaultPct: number; defaultFixed: number }[] = [
  { name: 'Shopify Payments', defaultPct: 2.9, defaultFixed: 0.30 },
  { name: 'PayPal', defaultPct: 2.99, defaultFixed: 0.49 },
  { name: 'Stripe', defaultPct: 2.9, defaultFixed: 0.30 },
  { name: 'Klarna', defaultPct: 3.29, defaultFixed: 0.30 },
  { name: 'Afterpay', defaultPct: 6.0, defaultFixed: 0.30 },
  { name: 'Apple Pay', defaultPct: 2.9, defaultFixed: 0.30 },
  { name: 'Google Pay', defaultPct: 2.9, defaultFixed: 0.30 },
];
