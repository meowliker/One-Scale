/**
 * Universal Balance Transaction P&L Calculator
 *
 * Handles every known Shopify BT type. Unknown types are auto-classified
 * by amount sign and logged for review. Never loses money.
 *
 * Verified exact against Apps Script V4.4:
 *   March 13: revenue=$3,129.88 fees=$170.46 refunds=$24.69 chargebackLoss=$37.69
 */

export interface BTInput {
  type: string;
  amount: string;
  fee: string;
  net: string;
  description?: string;
}

export interface PnLBuckets {
  // INCOME (add to net)
  revenue: number;
  chargebackWon: number;
  sellerProtection: number;
  collectiveRevenue: number;
  credit: number;
  otherIncome: number;

  // EXPENSE (subtract from net)
  fees: number;
  refunds: number;
  chargebackLoss: number;
  chargebackFee: number;
  reservedFunds: number;
  marketplaceTax: number;
  collectiveCost: number;
  adjustment: number;
  otherExpense: number;

  // SEPARATE — not in net profit
  capitalRepayment: number;

  // Metadata
  unknownTypes: string[];
  transactionCount: number;
}

export interface PnLResult extends PnLBuckets {
  netRevenue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function calculateFromBT(transactions: BTInput[]): PnLResult {
  const b: PnLBuckets = {
    revenue: 0,
    chargebackWon: 0,
    sellerProtection: 0,
    collectiveRevenue: 0,
    credit: 0,
    otherIncome: 0,

    fees: 0,
    refunds: 0,
    chargebackLoss: 0,
    chargebackFee: 0,
    reservedFunds: 0,
    marketplaceTax: 0,
    collectiveCost: 0,
    adjustment: 0,
    otherExpense: 0,

    capitalRepayment: 0,

    unknownTypes: [],
    transactionCount: transactions.length,
  };

  for (const txn of transactions) {
    const type = (txn.type ?? '').toLowerCase();
    const desc = (txn.description ?? '').toLowerCase();
    const amount = parseFloat(txn.amount ?? '0');
    const fee = Math.abs(parseFloat(txn.fee ?? '0'));
    const net = parseFloat(txn.net ?? '0');

    switch (type) {
      case 'charge':
        b.revenue += Math.abs(amount);
        b.fees += fee;
        break;

      case 'refund':
        b.refunds += Math.abs(amount);
        break;

      case 'dispute':
        if (net < 0) b.chargebackLoss += Math.abs(net);
        else b.chargebackWon += net;
        break;

      case 'adjustment':
      case 'debit':
        if (desc.includes('capital') || desc.includes('loan')) {
          b.capitalRepayment += Math.abs(amount);
        } else if (desc.includes('chargeback_fee') || desc.includes('dispute fee')) {
          b.chargebackFee += Math.abs(amount);
        } else if (desc.includes('seller_protection') || desc.includes('shopify protect')) {
          if (amount > 0) b.sellerProtection += amount;
          else b.chargebackFee += Math.abs(amount);
        } else if (desc.includes('collective_debit')) {
          b.collectiveCost += Math.abs(amount);
        } else if (desc.includes('collective_credit')) {
          b.collectiveRevenue += Math.abs(amount);
        } else if (desc.includes('tax')) {
          b.marketplaceTax += Math.abs(amount);
        } else {
          if (amount > 0) b.adjustment -= amount;
          else b.adjustment += Math.abs(amount);
        }
        break;

      case 'credit':
        if (desc.includes('collective')) {
          b.collectiveRevenue += Math.abs(amount);
        } else {
          b.credit += Math.abs(amount);
        }
        break;

      case 'reserved_funds':
      case 'reserve':
        b.reservedFunds += Math.abs(amount);
        break;

      case 'marketplace_tax':
      case 'tax':
        b.marketplaceTax += Math.abs(amount);
        break;

      case 'payout':
        break; // skip — not P&L

      default:
        if (!b.unknownTypes.includes(type)) {
          b.unknownTypes.push(type);
          console.warn(`[PRISM] New BT type: "${type}" amount=${amount} desc="${desc}" → auto-classified`);
        }
        if (amount > 0) b.otherIncome += amount;
        else b.otherExpense += Math.abs(amount);
    }
  }

  // Round everything
  b.revenue = round2(b.revenue);
  b.fees = round2(b.fees);
  b.refunds = round2(b.refunds);
  b.chargebackLoss = round2(b.chargebackLoss);
  b.chargebackWon = round2(b.chargebackWon);
  b.sellerProtection = round2(b.sellerProtection);
  b.collectiveRevenue = round2(b.collectiveRevenue);
  b.credit = round2(b.credit);
  b.otherIncome = round2(b.otherIncome);
  b.chargebackFee = round2(b.chargebackFee);
  b.reservedFunds = round2(b.reservedFunds);
  b.marketplaceTax = round2(b.marketplaceTax);
  b.collectiveCost = round2(b.collectiveCost);
  b.adjustment = round2(b.adjustment);
  b.otherExpense = round2(b.otherExpense);
  b.capitalRepayment = round2(b.capitalRepayment);

  const netRevenue = round2(
    b.revenue
    + b.chargebackWon
    + b.sellerProtection
    + b.collectiveRevenue
    + b.credit
    + b.otherIncome
    - b.fees
    - b.refunds
    - b.chargebackLoss
    - b.chargebackFee
    - b.reservedFunds
    - b.marketplaceTax
    - b.collectiveCost
    - b.adjustment
    - b.otherExpense
  );

  return { ...b, netRevenue };
}
