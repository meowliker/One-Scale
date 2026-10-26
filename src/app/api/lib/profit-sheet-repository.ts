import { getMetaToken } from "./tokens";
import { rest } from "./supabase-persistence";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "./crypto";
import type { SavedSheetAccount } from "./profit-sheet-storage";
import type {
  SheetConfig,
  SheetProduct,
  SheetSettings,
} from "@/lib/profit-sheet/model";
import { publicSheetAccounts } from "./profit-sheet-storage";
export type PrivateConfig = Omit<SheetConfig, "accounts"> & {
  accounts: SavedSheetAccount[];
};
export async function loadConfig(storeId: string): Promise<PrivateConfig> {
  await rest("/profit_sheet_stores?on_conflict=store_id", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ store_id: storeId }),
  });
  const config = await rest<
    Omit<PrivateConfig, "accounts"> & {
      accounts: Array<{
        details: Omit<SavedSheetAccount, "accessToken">;
        token_ciphertext: string;
      }>;
    }
  >("/rpc/profit_sheet_config", {
    method: "POST",
    body: JSON.stringify({ p_store: storeId }),
  });
  const integrated = config.accounts.some(
    (a) => a.details.credentialSource === "integration",
  )
    ? await getMetaToken(storeId)
    : null;
  return {
    ...config,
    accounts: config.accounts.map((a) => ({
      ...a.details,
      accessToken:
        a.details.credentialSource === "integration"
          ? integrated?.accessToken || ""
          : decryptSecret(a.token_ciphertext),
    })),
  };
}
export function publicConfig(config: PrivateConfig): SheetConfig {
  return { ...config, accounts: publicSheetAccounts(config.accounts) };
}
export async function saveConfig(
  storeId: string,
  config: PrivateConfig,
  changes: {
    settings?: SheetSettings;
    accounts?: SavedSheetAccount[];
    products?: SheetProduct[];
  },
): Promise<void> {
  if (!isEncryptionConfigured())
    throw new Error("Token encryption is not configured.");
  await rest("/rpc/profit_sheet_save", {
    method: "POST",
    body: JSON.stringify({
      p_store: storeId,
      p_version: config.version,
      p_settings: changes.settings || null,
      p_accounts: (changes.accounts || config.accounts).map(
        ({ accessToken, ...a }) => ({
          ...a,
          tokenCiphertext: encryptSecret(accessToken),
        }),
      ),
      p_products: changes.products || config.products,
    }),
  });
}
