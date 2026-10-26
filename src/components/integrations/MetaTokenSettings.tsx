"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { useConnectionStore } from "@/stores/connectionStore";
import {
  request,
  buttonClass,
  inputClass,
} from "@/app/dashboard/profit-sheet/shared";
type Health = {
  saved: boolean;
  status: string;
  expiresAt: number | null;
  tokenType: string;
  checkedAt: string | null;
  expiringSoon: boolean;
  noScheduledExpiry: boolean;
};
export function MetaTokenSettings({ storeId }: { storeId: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [token, setToken] = useState("");
  const refresh = useConnectionStore((s) => s.refreshStatus);
  const q = useQuery({
    queryKey: ["meta-token-health", storeId],
    queryFn: ({ signal }) =>
      request<{
        health: Health;
        savedAccounts: Array<{ id: string; name: string }>;
      }>(`/api/auth/meta/token?storeId=${encodeURIComponent(storeId)}`, {
        signal,
      }),
    staleTime: 15000,
  });
  async function act(action: string, accountId?: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await request<{ health: Health }>("/api/auth/meta/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          action,
          ...(accountId ? { accountId } : {}),
          ...(action === "save" ? { token } : {}),
        }),
        signal: AbortSignal.timeout(55000),
      });
      setToken("");
      await q.refetch();
      await refresh(storeId);
      setMessage(
        r.health.status === "connected"
          ? "Connection verified and saved in Supabase."
          : "Meta requires reconnection. Your saved credentials have been retained.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update connection");
    } finally {
      setBusy(false);
    }
  }
  const h = q.data?.health;
  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold">Meta connection storage</h3>
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || !h?.saved}
          onClick={() => void act("check")}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}Check connection
        </button>
      </div>
      {q.isPending ? (
        <p className="text-sm text-text-muted">Checking saved connection…</p>
      ) : (
        h && (
          <div className="text-sm space-y-1">
            <p
              className={
                h.status === "connected" ? "text-emerald-400" : "text-amber-400"
              }
            >
              {h.status === "missing"
                ? "No Meta integration saved for this store"
                : h.status === "connected"
                  ? "Saved securely · connected"
                  : h.status === "expired"
                    ? "Saved securely · token expired"
                    : "Saved securely · Meta rejected this token"}
            </p>
            <p className="text-text-muted">
              {h.expiresAt
                ? `Meta access expires ${new Date(h.expiresAt).toLocaleString()}.`
                : h.noScheduledExpiry
                  ? "System-user token · no scheduled expiry. Meta can still revoke access."
                  : h.saved
                    ? "Expiry has not been verified. Click Check connection."
                    : "Profit Sheet ad-account tokens may already be saved separately below."}{" "}
              {h.expiringSoon
                ? "Reconnect before this date to avoid interrupted syncing."
                : ""}
            </p>
          </div>
        )
      )}
      <p className="text-xs text-text-muted">
        Credentials are encrypted in Supabase and survive server restarts and
        deployments. Saving a token does not extend its Meta expiry.
      </p>
      {h?.status !== "connected" && !!q.data?.savedAccounts.length && (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">
            Reuse an existing token without pasting it again:
          </p>
          <div className="flex flex-wrap gap-2">
            {q.data.savedAccounts.map((a) => (
              <button
                type="button"
                key={a.id}
                className={buttonClass}
                disabled={busy}
                onClick={() => void act("restore", a.id)}
              >
                Use saved token · {a.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm">
          Use an access token for a lasting connection
        </summary>
        <p className="mt-3 text-xs text-text-muted">
          For unattended access, use a Meta Business system-user token with
          “Never” expiry if your business supports it. Assign the needed ad
          accounts and permissions in Meta, then paste the token here. Ordinary
          Facebook user tokens keep their original expiry. Permissions or tokens
          can still be revoked.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            autoComplete="new-password"
            aria-label="Meta integration access token"
            className={inputClass}
            placeholder="Meta access token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            type="button"
            className={`${buttonClass} whitespace-nowrap`}
            disabled={busy || token.trim().length < 20}
            onClick={() => void act("save")}
          >
            Verify & save
          </button>
        </div>
      </details>
      {(error || q.error) && (
        <p role="alert" className="text-sm text-red-400">
          {error || q.error?.message}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-400">
          {message}
        </p>
      )}
    </section>
  );
}
