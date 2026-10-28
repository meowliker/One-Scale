"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./shared";

type SyncStatus = {
  stage: "accounts" | "products" | "reports" | "attention" | "complete";
  lastCompletedAt: string | null;
  lastCompletedFrom: string | null;
  lastCompletedTo: string | null;
};
const stages = {
  accounts: "Waiting for an ad account",
  products: "Discovering products and campaign links",
  reports: "Syncing the latest three reporting days",
  attention: "Sync needs attention; see the discovery or report errors",
  complete: "Accounts, products and the latest three days are synced",
};
export function StoreSyncStatus({ storeId }: { storeId: string }) {
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["profit-sheet-status", storeId],
    queryFn: ({ signal }) => request<SyncStatus>(`/api/profit-sheet/status?storeId=${encodeURIComponent(storeId)}`, { signal }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: q => ["products", "reports"].includes(q.state.data?.stage || "") ? 4000 : 15000,
    retry: false,
  });
  const lastCompletedAt = status.data?.lastCompletedAt;
  useEffect(() => {
    if (lastCompletedAt) void client.invalidateQueries({ queryKey: ["profit-sheet-daily", storeId] });
  }, [client, storeId, lastCompletedAt]);
  if (status.error) return <p className="text-xs text-amber-500">Could not load the last full sync time.</p>;
  if (!status.data) return <p className="text-xs text-text-muted">Checking store sync status…</p>;
  const data = status.data;
  const timestamp = data.lastCompletedAt && new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(data.lastCompletedAt));
  return (
    <div className="mt-1 space-y-1 text-xs text-text-muted" role="status">
      <p>Last full store sync: {timestamp ? <time dateTime={data.lastCompletedAt!}>{timestamp} IST</time> : "Not completed yet"}</p>
      <p>{stages[data.stage]}.</p>
      {data.lastCompletedFrom && <p>Last completed report range: {data.lastCompletedFrom} – {data.lastCompletedTo}.</p>}
    </div>
  );
}
