import { rest } from "./supabase-persistence";
export async function loadExclusions(storeId: string) {
  const all: Array<{ key: string; label: string; created_at: string }> = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const page = await rest<typeof all>(
      `/profit_sheet_exclusions?store_id=eq.${encodeURIComponent(storeId)}&select=key,label,created_at&order=key&limit=1000&offset=${offset}`,
    );
    all.push(...page);
    if (page.length < 1000) return all;
  }
  throw new Error("Exclusion pagination limit exceeded");
}
