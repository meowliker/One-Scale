/**
 * Chargeback Calculator
 *
 * From V4.4: Only chargebacks with status = 'lost' are deducted from net profit.
 * Pending and won disputes are tracked separately and shown in the P&L
 * but NOT deducted from profit calculations.
 */

export interface DisputeData {
  id: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'lost' | 'won';
  createdAt: string;
}

export interface DisputeEntry {
  id: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'lost' | 'won';
  createdAt: string;
}

export interface ChargebackBreakdown {
  totalLost: number;      // Only lost chargebacks deducted from net profit
  totalPending: number;   // Shown separately, NOT deducted
  totalWon: number;       // Shown separately, NOT deducted
  disputes: DisputeEntry[];
}

/**
 * Calculate chargeback breakdown from dispute data.
 *
 * Only lost chargebacks are deducted from net profit.
 * Pending and won disputes are shown separately in P&L for visibility
 * but do not affect profit calculations.
 */
export function calculateChargebacks(disputes: DisputeData[]): ChargebackBreakdown {
  let totalLost = 0;
  let totalPending = 0;
  let totalWon = 0;

  const entries: DisputeEntry[] = [];

  for (const dispute of disputes) {
    const entry: DisputeEntry = {
      id: dispute.id,
      orderId: dispute.orderId,
      amount: dispute.amount,
      status: dispute.status,
      createdAt: dispute.createdAt,
    };

    entries.push(entry);

    switch (dispute.status) {
      case 'lost':
        totalLost += dispute.amount;
        break;
      case 'pending':
        totalPending += dispute.amount;
        break;
      case 'won':
        totalWon += dispute.amount;
        break;
    }
  }

  return {
    totalLost,
    totalPending,
    totalWon,
    disputes: entries,
  };
}
