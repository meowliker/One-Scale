"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ScanSearch } from "lucide-react";
import type { SheetConfig } from "@/lib/profit-sheet/model";
import type { DiscoveryFinding } from "@/lib/profit-sheet/discovery";
import { buttonClass, request } from "./shared";
type Result = {
  job: null | {
    status: string;
    checked_at: string | null;
    error: string | null;
    retry_at: string | null;
    report: {
      findings?: DiscoveryFinding[];
      warnings?: string[];
      from?: string;
      to?: string;
    };
  };
  exclusions: Array<{ key: string; label: string }>;
};
export function DiscoveryPanel({
  storeId,
  disabled,
  onUpdated,
  onBusy,
}: {
  onBusy: (busy: boolean) => void;
  storeId: string;
  disabled: boolean;
  onUpdated: (config: SheetConfig) => void;
}) {
  const client = useQueryClient();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const seenCheck = useRef<string | null>(null);
  const query = useQuery({
    queryKey: ["profit-sheet-discovery", storeId],
    queryFn: ({ signal }) =>
      request<Result>(
        `/api/profit-sheet/discovery?storeId=${encodeURIComponent(storeId)}`,
        { signal },
      ),
    refetchInterval: (q) =>
      ["queued", "running"].includes(q.state.data?.job?.status || "")
        ? 5000
        : false,
  });
  // A cron scan can finish while the dialog is open. Refresh the saved cards
  // without replacing unsaved edits; their version check still prevents races.
  const checkedAt = query.data?.job?.checked_at;
  useEffect(() => {
    if (!checkedAt || disabled || seenCheck.current === checkedAt) return;
    let cancelled = false;
    void request<SheetConfig>(`/api/profit-sheet/config?storeId=${encodeURIComponent(storeId)}`).then(config => {
      if (cancelled) return;
      seenCheck.current = checkedAt;
      onUpdated(config);
      void client.invalidateQueries({ queryKey: ["profit-sheet-config", storeId] });
      void client.invalidateQueries({ queryKey: ["profit-sheet-daily", storeId] });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [checkedAt, disabled, storeId, onUpdated, client]);
  async function run() {
    setRunning(true);
    setError("");
    try {
      const r = await request<{ ok: boolean; error?: string }>(
        "/api/profit-sheet/discovery",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId }),
          signal: AbortSignal.timeout(290000),
        },
      );
      if (!r.ok) throw new Error(r.error || "Discovery failed");
      const config = await request<SheetConfig>(
        `/api/profit-sheet/config?storeId=${encodeURIComponent(storeId)}`,
      );
      onUpdated(config);
      await client.invalidateQueries({
        queryKey: ["profit-sheet-config", storeId],
      });
      await client.invalidateQueries({
        queryKey: ["profit-sheet-daily", storeId],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run discovery");
    } finally {
      setRunning(false);
      void query.refetch();
    }
  }
  async function restore(key: string) {
    setError("");
    try {
      await request("/api/profit-sheet/discovery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, key }),
      });
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore");
    }
  }
  const job = query.data?.job;
  const busy = running || job?.status === "running";
  const waiting = job?.status === "queued";
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  return (
    <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">Automatic discovery</h3>
          <p className="mt-1 text-xs text-text-muted">
            Runs after account or product changes, on refresh, and daily at 11:30 AM IST
          </p>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || busy || waiting}
          onClick={() => void run()}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          {busy ? "Checking products & ads…" : waiting ? "Matching queued" : "Discover now"}
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        Products qualify with sessions on at least 3 of 5 days and a paid order.
        Existing manual selections stay protected.{" "}
        {disabled
          ? "Save your changes before running discovery."
          : job?.checked_at
            ? `Last checked ${new Date(job.checked_at).toLocaleString()}.`
            : "No discovery check saved yet."}
      </p>
      {waiting && (
        <p className="text-xs text-cyan-300" role="status">
          {job?.retry_at && Date.parse(job.retry_at) > Date.now()
            ? `Meta scan will retry automatically after ${new Date(job.retry_at).toLocaleTimeString()}. Saved mappings remain available.`
            : "Automatic matching is queued. You can close this window; the background worker will save the results."}
        </p>
      )}
      {(error || query.error || job?.error) && (
        <p role="alert" className="text-xs text-red-400">
          {error || query.error?.message || job?.error}
        </p>
      )}
      {!!job?.report?.warnings?.length && (
        <details className="text-xs text-amber-400">
          <summary className="cursor-pointer">
            Discovery notices ({job.report.warnings.length})
          </summary>
          {job.report.warnings.map((w, i) => (
            <p className="mt-2" key={i}>
              {w}
            </p>
          ))}
        </details>
      )}
      {!!job?.report?.findings?.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-secondary">
            Products & mapping review ({job.report.findings.length}) ·{" "}
            {job.report.from} – {job.report.to}
          </summary>
          <div className="mt-3 max-h-64 overflow-auto space-y-2">
            {job.report.findings.map((f) => (
              <div key={f.key} className="rounded-lg border border-border p-3">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{f.title}</span>
                  <span
                    className={
                      f.status === "review" ? "text-amber-400" : "text-cyan-400"
                    }
                  >
                    {f.status}
                  </span>
                </div>
                <p className="mt-1 text-text-muted">{f.detail}</p>
                {f.links?.filter(link => /^https?:\/\//i.test(link)).map(link => (
                  <a key={link} href={link} target="_blank" rel="noopener noreferrer"
                    className="mt-2 block break-all text-cyan-300 underline underline-offset-2">{link}</a>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
      {!!query.data?.exclusions.length && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-secondary">
            Unlinked items ({query.data.exclusions.length})
          </summary>
          <p className="my-2 text-text-muted">
            Restore allows discovery to consider the item again. It does not
            change your current manual selections.
          </p>
          <div className="max-h-40 overflow-auto space-y-2">
            {query.data.exclusions.map((e) => (
              <div key={e.key} className="flex justify-between gap-3">
                <span className="truncate">
                  {e.label} · {e.key.split(":")[0]} {e.key.split(":").at(-1)}
                </span>
                <button
                  type="button"
                  disabled={busy || disabled}
                  className="text-primary underline"
                  onClick={() => void restore(e.key)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
