import type { ShopifyOrder, ShopifyProduct, ShopifyCustomer } from '@/types/shopify';
import { mockShopifyOrders, mockShopifyProducts, mockShopifyCustomers } from '@/data/mockShopifyData';
import { createServiceFn } from '@/services/withMockFallback';
import { apiClient } from '@/services/api';

async function mockGetOrders(): Promise<ShopifyOrder[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockShopifyOrders;
}

async function mockGetProducts(): Promise<ShopifyProduct[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockShopifyProducts;
}

async function mockGetCustomers(): Promise<ShopifyCustomer[]> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockShopifyCustomers;
}

async function realGetOrders(): Promise<ShopifyOrder[]> {
  const response = await apiClient<{ data: ShopifyOrder[] }>('/api/shopify/orders', {
    params: { limit: '250' },
    timeoutMs: 60_000,
  });
  return response.data;
}

async function realGetProducts(): Promise<ShopifyProduct[]> {
  const response = await apiClient<{ data: ShopifyProduct[] }>('/api/shopify/products');
  return response.data;
}

async function realGetCustomers(): Promise<ShopifyCustomer[]> {
  const response = await apiClient<{ data: ShopifyCustomer[] }>('/api/shopify/customers');
  return response.data;
}

export const getShopifyOrders = createServiceFn<ShopifyOrder[]>(
  'shopify',
  mockGetOrders,
  realGetOrders
);

export const getShopifyProducts = createServiceFn<ShopifyProduct[]>(
  'shopify',
  mockGetProducts,
  realGetProducts
);

export const getShopifyCustomers = createServiceFn<ShopifyCustomer[]>(
  'shopify',
  mockGetCustomers,
  realGetCustomers
);
