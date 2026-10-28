"use client";
import { getQueryClient } from "@/lib/queryClient";
import type { SheetConfig } from "./model";

// Integrations and Profit Sheet use different state stores. Install the server's
// committed config before navigation, and cancel reads started before the edit.
export async function refreshLinkedSheet(storeId: string, config?: SheetConfig) {
  const client = getQueryClient();
  const key = ["profit-sheet-config", storeId];
  await client.cancelQueries({ queryKey: key });
  if (config) client.setQueryData(key, config);
  else await client.invalidateQueries({ queryKey: key });
  await Promise.all([
    client.invalidateQueries({ queryKey: ["profit-sheet-daily", storeId] }),
    client.invalidateQueries({ queryKey: ["profit-sheet-discovery", storeId] }),
    client.invalidateQueries({ queryKey: ["profit-sheet-status", storeId] }),
    client.invalidateQueries({ queryKey: ["profit-sheet-accounts", storeId] }),
  ]);
}
