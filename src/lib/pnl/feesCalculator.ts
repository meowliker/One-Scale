/**
 * Fees Calculator
 *
 * Calculates Shopify payment processing and transaction fees from actual
 * GraphQL transaction data. Never estimates based on Shopify plan -- always
 * uses real fee data from transactions.
 */

export interface OrderTransaction {
  orderId: string;
  fees: Array<{
    amount: number;
    type: 'payment_processing' | 'transaction' | 'other';
    currency: string;
  }>;
}

export type OrderWithTransactions = OrderTransaction;

export interface OrderFee {
  orderId: string;
  fees: number;
}

export interface FeeBreakdown {
  totalFees: number;
  paymentProcessingFees: number;
  transactionFees: number;
  perOrder: OrderFee[];
}

/**
 * Calculate fees from actual Shopify GraphQL transaction data.
 *
 * Reads actual fees from transactions.fees -- never estimates based on plan.
 * Stores per-order fees for granular P&L reporting.
 */
export function calculateFees(orders: OrderWithTransactions[]): FeeBreakdown {
  let totalFees = 0;
  let paymentProcessingFees = 0;
  let transactionFees = 0;
  const perOrder: OrderFee[] = [];

  for (const order of orders) {
    let orderFees = 0;

    for (const fee of order.fees) {
      const amount = Math.abs(fee.amount); // fees are always positive costs
      orderFees += amount;

      switch (fee.type) {
        case 'payment_processing':
          paymentProcessingFees += amount;
          break;
        case 'transaction':
          transactionFees += amount;
          break;
        default:
          // 'other' fees still count toward total
          break;
      }
    }

    totalFees += orderFees;
    perOrder.push({ orderId: order.orderId, fees: orderFees });
  }

  return {
    totalFees,
    paymentProcessingFees,
    transactionFees,
    perOrder,
  };
}
