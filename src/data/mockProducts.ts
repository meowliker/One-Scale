import type { ProductCOGS } from '@/types/pnl';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function makeProduct(
  productId: string,
  productName: string,
  sku: string,
  costPerUnit: number,
  sellingPrice: number,
): ProductCOGS {
  return {
    productId,
    productName,
    sku,
    costPerUnit,
    sellingPrice,
    margin: round2(((sellingPrice - costPerUnit) / sellingPrice) * 100),
  };
}

export const mockProducts: ProductCOGS[] = [
  makeProduct('prod-001', 'Hydrating Face Serum', 'SKU-001', 8.50, 42.00),
  makeProduct('prod-002', 'Vitamin C Brightening Cream', 'SKU-002', 6.75, 38.00),
  makeProduct('prod-003', 'Retinol Night Repair Oil', 'SKU-003', 12.00, 58.00),
  makeProduct('prod-004', 'Gentle Foaming Cleanser', 'SKU-004', 5.20, 24.00),
  makeProduct('prod-005', 'SPF 50 Daily Sunscreen', 'SKU-005', 7.80, 32.00),
  makeProduct('prod-006', 'Hyaluronic Acid Moisturizer', 'SKU-006', 9.40, 46.00),
  makeProduct('prod-007', 'Niacinamide Pore Refiner', 'SKU-007', 6.10, 28.00),
  makeProduct('prod-008', 'Collagen Boosting Eye Cream', 'SKU-008', 14.50, 62.00),
  makeProduct('prod-009', 'Exfoliating AHA/BHA Toner', 'SKU-009', 5.90, 26.00),
  makeProduct('prod-010', 'Bakuchiol Anti-Aging Serum', 'SKU-010', 18.00, 78.00),
  makeProduct('prod-011', 'Calming Aloe Vera Gel', 'SKU-011', 4.80, 19.00),
  makeProduct('prod-012', 'Luxury Overnight Recovery Mask', 'SKU-012', 22.50, 89.00),
];
