import type { SheetAccount } from "@/lib/profit-sheet";

export type SavedSheetAccount = SheetAccount & { accessToken: string };

export async function loadSheetAccounts(
  storeId: string,
): Promise<SavedSheetAccount[]> {
  const { loadConfig } = await import("./profit-sheet-repository");
  return (await loadConfig(storeId)).accounts;
}

export function publicSheetAccounts(
  accounts: SavedSheetAccount[],
): SheetAccount[] {
  return accounts.map(({ accessToken, ...account }) => ({
    ...account,
    hasToken: !!accessToken,
  }));
}

export async function saveSheetAccounts(
  storeId: string,
  accounts: SavedSheetAccount[],
  expectedVersion?: number,
): Promise<void> {
  const { loadConfig, saveConfig } = await import("./profit-sheet-repository");
  const { validateProducts } = await import("@/lib/profit-sheet/model");
  const config = await loadConfig(storeId);
  if (expectedVersion !== undefined && config.version !== expectedVersion)
    throw new Error("Settings changed. Reload and retry.");
  const retained = new Set(accounts.map(a => a.adAccountId));
  const products = config.products.map(p => ({
    ...p, assignments: p.assignments.filter(a => retained.has(a.accountId)),
  }));
  validateProducts(products, accounts);
  await saveConfig(storeId, config, { accounts, products });
}
