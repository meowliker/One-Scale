"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { formatDateInTimezone } from "@/lib/timezone";
import {
  validateSchedule,
  type SheetAccount,
  type SheetDraft,
} from "@/lib/profit-sheet";
import type { DiscoveredAccount } from "@/lib/profit-sheet/discovery";
import { request, inputClass, buttonClass } from "./shared";
export function AccountsDialog({
  storeId,
  storeName,
  accounts,
  version,
  onClose,
}: {
  storeId: string;
  storeName: string;
  accounts: SheetAccount[];
  version: number;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState<SheetDraft[]>(() =>
    accounts.map((a) => ({ ...a, accessToken: "" })),
  );
  const [baseVersion] = useState(version);
  const [search, setSearch] = useState("");
  const [business, setBusiness] = useState("");
  const connected = useQuery({
    queryKey: ["profit-sheet-connected-accounts", storeId],
    queryFn: ({ signal }) =>
      request<{
        accounts: DiscoveredAccount[];
        businesses: Array<{ id: string; name: string }>;
        warnings: string[];
      }>(
        `/api/profit-sheet/connected-accounts?storeId=${encodeURIComponent(storeId)}`,
        { signal },
      ),
    staleTime: 60000,
    retry: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  function update(index: number, change: Partial<SheetDraft>) {
    setDrafts((all) =>
      all.map((a, i) => (i === index ? { ...a, ...change } : a)),
    );
  }
  function addAccount() {
    setDrafts((all) => [
      ...all,
      {
        adAccountId: "",
        name: "",
        currency: "",
        timezone: "",
        active: true,
        start: `${formatDateInTimezone(new Date(), "UTC")}T00:00`,
        end: "",
        hasToken: false,
        accessToken: "",
      },
    ]);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    for (const draft of drafts) {
      const message = validateSchedule(draft);
      if (message) {
        setError(message);
        return;
      }
    }
    setSaving(true);
    try {
      const result = await request<{ accounts: SheetAccount[] }>(
        "/api/profit-sheet",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storeId, accounts: drafts, version: baseVersion }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      queryClient.setQueryData(["profit-sheet-accounts", storeId], result);
      await queryClient.invalidateQueries({
        queryKey: ["profit-sheet-config", storeId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["profit-sheet-daily", storeId],
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save accounts. Retry.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="accounts-title"
      onCancel={(e) => {
        if (saving) e.preventDefault();
        else onClose();
      }}
      onClose={onClose}
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(900px,95vw)] overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text-primary shadow-2xl backdrop:bg-black/60"
    >
      <form onSubmit={save} autoComplete="off">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div>
            <h2 id="accounts-title" className="text-lg font-semibold">
              Ad accounts
            </h2>
            <p className="text-sm text-text-muted">{storeName}</p>
          </div>
          <button
            type="button"
            aria-label="Close ad accounts"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-surface-hover"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm text-text-secondary">
            Removing an account also unlinks it from product assignments and Integrations. Add every Meta account used by this store. Active accounts run from
            their start time through now. Uncheck Active to set an end time.
          </p>
          <p className="text-xs text-text-muted">
            Times use each Meta ad account’s timezone, confirmed when you save.
            Meta reports whole hours; the end hour is excluded. Tokens are
            encrypted on the server.
          </p>
          <section className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium">
                From your connected Meta account
              </h3>
              <button
                type="button"
                className="text-xs text-primary underline"
                disabled={connected.isFetching}
                onClick={() => void connected.refetch()}
              >
                Refresh accounts
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Choose accounts for this store. Their access token comes from
              Settings → Integrations.
            </p>
            {connected.isPending && (
              <p className="text-xs">Loading businesses and ad accounts…</p>
            )}
            {connected.error && (
              <p role="alert" className="text-xs text-amber-400">
                {connected.error.message} You can still add an account manually
                below.
              </p>
            )}
            {connected.data && (
              <>
                <p className="text-xs text-text-muted">
                  {connected.data.businesses.length} accessible businesses ·{" "}
                  {connected.data.accounts.length} accessible accounts
                </p>
                {connected.data.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-400">
                    {w}
                  </p>
                ))}
                <select
                  className={inputClass}
                  aria-label="Business manager"
                  value={business}
                  onChange={(e) => setBusiness(e.target.value)}
                >
                  <option value="">All businesses</option>
                  {[
                    ...new Map(
                      [
                        ...connected.data.businesses,
                        ...connected.data.accounts.flatMap((a) =>
                          a.business ? [a.business] : [],
                        ),
                      ].map((b) => [b.id, b]),
                    ).values(),
                  ].map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {business &&
                  !connected.data.accounts.some(
                    (a) => a.business?.id === business,
                  ) && (
                    <p className="text-xs text-text-muted">
                      No ad accounts are accessible for this business with the
                      connected permissions.
                    </p>
                  )}
                <input
                  className={inputClass}
                  aria-label="Search businesses and ad accounts"
                  placeholder="Search business, account or ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="max-h-56 overflow-auto space-y-2">
                  {connected.data.accounts
                    .filter((a) => !business || a.business?.id === business)
                    .filter((a) =>
                      `${a.name} ${a.id} ${a.business?.name || ""}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .sort((a, b) =>
                      (a.business?.name || "").localeCompare(
                        b.business?.name || "",
                      ),
                    )
                    .map((a) => {
                      const selected = drafts.some(
                        (d) => d.adAccountId === a.id,
                      );
                      const canConnect =
                        selected &&
                        drafts.find((d) => d.adAccountId === a.id)
                          ?.credentialSource !== "integration";
                      return (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm">{a.name}</p>
                            <p className="text-xs text-text-muted">
                              {a.business?.name || "Personal / shared account"}{" "}
                              · {a.id} · {a.currency}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-primary"
                            disabled={
                              saving ||
                              (selected && !canConnect) ||
                              (!selected && drafts.length >= 30)
                            }
                            onClick={() =>
                              canConnect
                                ? setDrafts((all) =>
                                    all.map((d) =>
                                      d.adAccountId === a.id
                                        ? {
                                            ...d,
                                            credentialSource: "integration",
                                            hasToken: true,
                                            accessToken: "",
                                            business: a.business,
                                          }
                                        : d,
                                    ),
                                  )
                                : setDrafts((all) => [
                                    ...all,
                                    {
                                      adAccountId: a.id,
                                      name: a.name,
                                      currency: a.currency,
                                      timezone: a.timezone_name,
                                      credentialSource: "integration",
                                      business: a.business,
                                      active: true,
                                      start: `${formatDateInTimezone(new Date(), a.timezone_name || "UTC").slice(0, 7)}-01T00:00`,
                                      end: "",
                                      hasToken: true,
                                      accessToken: "",
                                    },
                                  ])
                            }
                          >
                            {canConnect
                              ? "Use connection"
                              : selected
                                ? "Selected"
                                : "Add"}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </>
            )}
          </section>
          <fieldset disabled={saving} className="space-y-4">
            {drafts.map((account, index) => (
              <section
                key={index}
                className="space-y-4 rounded-xl border border-border bg-surface-hover/30 p-4"
                aria-label={`Ad account ${index + 1}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {account.name || `Account ${index + 1}`}
                  </h3>
                  <button
                    type="button"
                    className="p-2 text-text-muted hover:text-red-500"
                    aria-label={`Remove account ${index + 1}`}
                    onClick={() =>
                      setDrafts((all) => all.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-xs font-medium">
                    Ad account ID
                    <input
                      required
                      readOnly={account.credentialSource === "integration"}
                      autoComplete="off"
                      name={`meta-account-${index}`}
                      data-1p-ignore
                      data-lpignore="true"
                      value={account.adAccountId}
                      onChange={(e) =>
                        update(index, {
                          adAccountId: e.target.value,
                          hasToken: false,
                          name: "",
                          timezone: "",
                        })
                      }
                      placeholder="act_123456789"
                      className={inputClass}
                    />
                  </label>
                  {account.credentialSource === "integration" ? (
                    <div className="space-y-2 text-xs">
                      <p className="text-cyan-400">
                        Connected through Meta integration
                      </p>
                      <p className="text-text-muted">
                        {account.business?.name || "Shared or personal account"}{" "}
                        · Token updates automatically when you reconnect Meta.
                      </p>
                    </div>
                  ) : (
                    <label className="space-y-1.5 text-xs font-medium">
                      Access token
                      <input
                        required={!account.hasToken}
                        type="password"
                        autoComplete="new-password"
                        name={`meta-token-${index}`}
                        data-1p-ignore
                        data-lpignore="true"
                        value={account.accessToken || ""}
                        onChange={(e) =>
                          update(index, { accessToken: e.target.value })
                        }
                        placeholder={
                          account.hasToken
                            ? "Saved securely · leave blank to keep"
                            : "Meta access token"
                        }
                        className={inputClass}
                      />
                    </label>
                  )}
                  <label className="space-y-1.5 text-xs font-medium">
                    Start date & time
                    <input
                      required
                      type="datetime-local"
                      step={3600}
                      value={account.start}
                      onChange={(e) => update(index, { start: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <div>
                    <label className="mb-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={account.active}
                        onChange={(e) =>
                          update(index, { active: e.target.checked })
                        }
                        className="accent-primary"
                      />
                      Active
                    </label>
                    {account.active ? (
                      <p className="py-2 text-xs text-text-muted">
                        End: now, updated each time data is refreshed
                      </p>
                    ) : (
                      <label className="space-y-1.5 text-xs font-medium">
                        End date & time
                        <input
                          required
                          type="datetime-local"
                          step={3600}
                          min={account.start}
                          value={account.end}
                          onChange={(e) =>
                            update(index, { end: e.target.value })
                          }
                          className={inputClass}
                        />
                      </label>
                    )}
                  </div>
                </div>
                <p className="text-xs text-text-muted">
                  Timezone:{" "}
                  {account.timezone ||
                    "Meta ad account timezone (verified on save)"}
                </p>
              </section>
            ))}
            {!drafts.length && (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
                No ad accounts yet. Add an account to begin.
              </p>
            )}
            <button
              type="button"
              disabled={drafts.length >= 30}
              onClick={addAccount}
              className={buttonClass}
            >
              <Plus className="h-4 w-4" />
              Add manually
            </button>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500"
            >
              {error}
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-surface p-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className={buttonClass}
          >
            Cancel
          </button>
          <button
            disabled={saving}
            className={`${buttonClass} border-transparent bg-primary text-white hover:bg-primary/90`}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Verifying & saving…" : "Save accounts"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
