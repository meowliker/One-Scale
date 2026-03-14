import { NextRequest, NextResponse } from 'next/server';
import { calculatePnL } from '@/lib/pnl/universalCalculator';

export const dynamic = 'force-dynamic';

/**
 * GET /api/debug/verify-pnl?storeId=xxx&date=2026-03-13
 *
 * Computes P&L for a single date and compares against expected values.
 * Used to verify that balance-transaction-based P&L matches the Apps Script V4.4 output.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get('storeId');
  const date = searchParams.get('date');

  if (!storeId || !date) {
    return NextResponse.json(
      { error: 'storeId and date query params required' },
      { status: 400 },
    );
  }

  const pnl = await calculatePnL(storeId, date, date, {
    includeProductBreakdown: true,
  });

  // Expected values for Mar 13 verification (from Apps Script V4.4)
  const expected = {
    revenue: 3129.88,
    fees: 170.46,
    adSpend: 3085.04,
    refunds: 24.69,
    chargebackLoss: 37.69,
    netProfit: -188.00,
  };

  const computed = {
    revenue: pnl.totalRevenue,
    fees: pnl.totalFees,
    adSpend: pnl.totalAdSpend,
    refunds: pnl.totalRefunds,
    chargebackLoss: pnl.totalChargebackLoss,
    chargebackWon: pnl.totalChargebackWon,
    cogs: pnl.totalCogs,
    shipping: pnl.totalShipping,
    netProfit: pnl.totalNetProfit,
    margin: pnl.totalMargin,
    orderCount: pnl.orderCount,
    revenueSource: pnl.revenueSource,
    feeMethod: pnl.feeMethod,
    dataCompleteness: pnl.dataCompleteness,
  };

  const matches = {
    revenue: Math.abs(pnl.totalRevenue - expected.revenue) < 1,
    fees: Math.abs(pnl.totalFees - expected.fees) < 1,
    refunds: Math.abs(pnl.totalRefunds - expected.refunds) < 1,
    chargebackLoss: Math.abs(pnl.totalChargebackLoss - expected.chargebackLoss) < 1,
    netProfit: Math.abs(pnl.totalNetProfit - expected.netProfit) < 1,
  };

  const allMatch = Object.values(matches).every(Boolean);

  return NextResponse.json({
    date,
    storeId,
    allMatch,
    matches,
    computed,
    expected,
    warnings: pnl.warnings,
    productCount: pnl.products.length,
  });
}
