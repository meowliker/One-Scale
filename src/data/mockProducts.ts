import type { ProductCOGS } from '@/types/pnl';

function makeProduct(
  id: string,
  title: string,
  cost: number,
  price: number,
  requiresShipping = true,
  vendor = 'Mock Vendor',
  productType = '',
): any {
  return {
    id,
    title,
    image: null,
    product_type: productType || null,
    requires_shipping: requiresShipping,
    vendor,
    status: 'active',
    variant_count: 1,
    cost: requiresShipping ? cost : 0,
    price,
    currency: 'USD',
  };
}

export const mockProducts: ProductCOGS[] = [
  makeProduct('prod-001', 'Hydrating Face Serum', 8.50, 42.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-002', 'Vitamin C Brightening Cream', 6.75, 38.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-003', 'Retinol Night Repair Oil', 12.00, 58.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-004', 'Gentle Foaming Cleanser', 5.20, 24.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-005', 'SPF 50 Daily Sunscreen', 7.80, 32.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-006', 'Hyaluronic Acid Moisturizer', 9.40, 46.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-007', 'Niacinamide Pore Refiner', 6.10, 28.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-008', 'Collagen Boosting Eye Cream', 14.50, 62.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-009', 'Exfoliating AHA/BHA Toner', 5.90, 26.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-010', 'Bakuchiol Anti-Aging Serum', 18.00, 78.00, true, 'GlowLab', 'Skincare'),
  makeProduct('prod-011', 'Skincare Masterclass Course', 0, 97.00, false, 'GlowLab', 'Digital'),
  makeProduct('prod-012', 'Luxury Overnight Recovery Mask', 22.50, 89.00, true, 'GlowLab', 'Skincare'),
];
