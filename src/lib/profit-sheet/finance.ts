export type BalanceEntry = {
  id: string | number;
  type: string;
  amount: string | number;
  fee: string | number;
  net: string | number;
  currency: string;
  processed_at: string;
  test?: boolean;
  source_order_id?: string | number | null;
  source_type?: string;
  payout_id?: string | number | null;
};
// Payouts and temporary reserves move cash, not sales. Refunds/disputes use
// principal amounts; their signed fees are included separately exactly once.
export function balanceDay(
  entries: BalanceEntry[],
  start: number,
  end: number,
  currency: string,
) {
  const result = {
    shopifyFees: 0,
    refunds: 0,
    chargebackLoss: 0,
    chargebackWon: 0,
    adjustment: 0,
  };
  const seen = new Set<string>();
  for (const entry of entries) {
    const time = Date.parse(entry.processed_at);
    if (!Number.isFinite(time))
      throw new Error("Invalid payment transaction date");
    if (entry.test || time < start || time >= end || seen.has(String(entry.id)))
      continue;
    seen.add(String(entry.id));
    if (
      [
        "payout",
        "payout_failure",
        "payout_cancellation",
        "reserve",
        "reserved_funds",
      ].includes(entry.type)
    )
      continue;
    if (entry.currency.toUpperCase() !== currency)
      throw new Error("Payment currency differs from store currency");
    const amount = Number(entry.amount),
      fee = Number(entry.fee);
    if (![amount, fee].every(Number.isFinite))
      throw new Error("Invalid payment transaction amount");
    if (entry.type === "charge") {
      /* revenue comes from orders */
    } else if (entry.type === "refund") result.refunds -= amount;
    else if (entry.type === "dispute") {
      if (amount < 0) result.chargebackLoss -= amount;
      else result.chargebackWon += amount;
    } else if (["adjustment", "credit", "debit"].includes(entry.type))
      result.adjustment += amount;
    else throw new Error("Unsupported payment transaction type");
    result.shopifyFees += fee;
  }
  return result;
}
