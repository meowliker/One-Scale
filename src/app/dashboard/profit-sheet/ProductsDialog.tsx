"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Unlink, Pencil, ChevronUp, X } from "lucide-react";
import {
  type SheetConfig,
  type SheetProduct,
  validateProducts,
  reportingDay,
} from "@/lib/profit-sheet/model";
import { DiscoveryPanel } from "./DiscoveryPanel";
import { request, inputClass, buttonClass } from "./shared";
type Campaign = { id: string; name: string; status: string };
function Campaigns({
  storeId,
  accountId,
  selected,
  onChange,
  automatic = false,
}: {
  storeId: string;
  accountId: string;
  selected: string[];
  automatic?: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["sheet-campaigns", storeId, accountId],
    queryFn: async ({ signal }) => {
      const all: Campaign[] = [];
      let after: string | null = null;
      const seen = new Set<string>();
      for (let page = 0; page < 100; page++) {
        const result: { campaigns: Campaign[]; next: string | null } =
          await request(
            `/api/profit-sheet/campaigns?${new URLSearchParams({ storeId, accountId, ...(after ? { after } : {}) })}`,
            { signal },
          );
        all.push(...result.campaigns);
        if (!result.next) return all;
        if (seen.has(result.next))
          throw new Error("Campaign pagination failed.");
        seen.add(result.next);
        after = result.next;
      }
      throw new Error("Too many campaigns.");
    },
    retry: false,
    staleTime: 60000,
  });
  const visibleCampaigns = (query.data || []).filter(
    (campaign) =>
      campaign.name.toLowerCase().includes(search.toLowerCase()) ||
      campaign.id.includes(search),
  );
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs text-text-muted">
        {selected.length
          ? `${selected.length} campaigns selected`
          : "No campaigns selected · no ad spend will be included."}
      </p>
      <input
        aria-label={`Search campaigns ${accountId}`}
        className={inputClass}
        placeholder="Search campaigns…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={
            automatic ||
            !visibleCampaigns.length ||
            visibleCampaigns.every((c) => selected.includes(c.id))
          }
          onClick={() =>
            onChange([
              ...new Set([...selected, ...visibleCampaigns.map((c) => c.id)]),
            ])
          }
          className="text-primary underline disabled:opacity-40 disabled:no-underline"
        >
          Select all{search ? " results" : ""}
        </button>
        <button
          type="button"
          disabled={!selected.length}
          onClick={() => onChange([])}
          className="text-primary underline disabled:opacity-40 disabled:no-underline"
        >
          Clear all
        </button>
      </div>
      {query.isPending && <p className="text-xs">Loading campaigns…</p>}
      {query.error && (
        <p role="alert" className="text-xs text-red-500">
          {query.error.message}{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="underline"
          >
            Retry
          </button>
        </p>
      )}
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {visibleCampaigns.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              disabled={automatic && !selected.includes(c.id)}
              checked={selected.includes(c.id)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, c.id]
                    : selected.filter((id) => id !== c.id),
                )
              }
            />
            {c.name} · {c.status}
          </label>
        ))}
      </div>
    </div>
  );
}
export function ProductsDialog({
  storeId,
  config,
  onClose,
}: {
  storeId: string;
  config: SheetConfig;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [products, setProducts] = useState<SheetProduct[]>(() =>
    config.products.map((p) => ({ ...p })),
  );
  const [expanded, setExpanded] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState(config.version);
  const [baseline, setBaseline] = useState(() =>
    JSON.stringify(config.products),
  );
  const dirty = JSON.stringify(products) !== baseline;
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const client = useQueryClient();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  const update = (id: string, change: Partial<SheetProduct>) =>
    setProducts((all) =>
      all.map((p) => (p.id === id ? { ...p, ...change } : p)),
    );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      // The server resolves links before validating product identity and overlapping assignments.
      validateProducts(
        products.map((p) => ({
          ...p,
          shopifyIds: p.shopifyIds.length ? p.shopifyIds : [`new-${p.id}`],
        })),
        config.accounts,
      );
      const saved = await request<SheetConfig>("/api/profit-sheet/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, products, version: currentVersion }),
        signal: AbortSignal.timeout(65000),
      });
      await client.invalidateQueries({
        queryKey: ["profit-sheet-config", storeId],
      });
      await client.invalidateQueries({
        queryKey: ["profit-sheet-daily", storeId],
      });
      setProducts(saved.products);
      setBaseline(JSON.stringify(saved.products));
      setCurrentVersion(saved.version);
      setExpanded([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save products.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={ref}
      aria-labelledby="products-title"
      onCancel={(e) => {
        if (saving || scanning) e.preventDefault();
        else onClose();
      }}
      className="fixed inset-0 m-auto max-h-[90vh] w-[min(950px,95vw)] overflow-auto rounded-2xl border border-border bg-surface p-0 text-text-primary backdrop:bg-black/60"
    >
      <form onSubmit={save}>
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <h2 id="products-title" className="text-lg font-semibold">
            Products & campaign assignments
          </h2>
          <button
            type="button"
            disabled={saving || scanning}
            aria-label="Close products"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="space-y-4 p-6">
          <p className="text-sm text-text-secondary">
            Products and campaign links are saved for this store. Unlinked items
            stay excluded from automatic discovery.
          </p>
          <DiscoveryPanel
            onBusy={setScanning}
            storeId={storeId}
            disabled={dirty || saving}
            onUpdated={(next) => {
              setProducts(next.products);
              setBaseline(JSON.stringify(next.products));
              setCurrentVersion(next.version);
              setExpanded([]);
            }}
          />
          <fieldset disabled={saving || scanning} className="space-y-4">
            {products.map((p) => (
              <section
                key={p.id}
                className="space-y-3 rounded-xl border border-border p-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{p.name || "New product"}</h3>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-primary"
                      aria-label={`Edit ${p.name}`}
                      aria-expanded={expanded.includes(p.id)}
                      onClick={() =>
                        setExpanded((all) =>
                          all.includes(p.id)
                            ? all.filter((id) => id !== p.id)
                            : [...all, p.id],
                        )
                      }
                    >
                      {expanded.includes(p.id) ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <Pencil className="h-4 w-4" />
                      )}
                      {expanded.includes(p.id) ? "Collapse" : "Edit"}
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-text-muted hover:text-red-400"
                      aria-label={`Unlink ${p.name || "product"}`}
                      onClick={() =>
                        setProducts((all) =>
                          all.filter((item) => item.id !== p.id),
                        )
                      }
                    >
                      <Unlink className="h-4 w-4" /> Unlink
                    </button>
                  </div>
                </div>
                <p className="text-xs text-text-muted">
                  {p.source === "auto" && !p.manualOverride
                    ? "Automatic matching"
                    : "Manual mapping"}{" "}
                  · {p.links.filter(Boolean).length} links ·{" "}
                  {p.assignments.length} ad accounts ·{" "}
                  {p.assignments.reduce((n, a) => n + a.campaignIds.length, 0)}{" "}
                  selected campaigns · From {p.startDate || "all dates"}
                </p>
                {!expanded.includes(p.id) && (
                  <p className="truncate text-xs text-text-secondary">
                    {p.links.filter(Boolean).join(" · ")}
                  </p>
                )}
                {expanded.includes(p.id) && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <label className="block space-y-1 text-xs">
                      Product name
                      <input
                        className={inputClass}
                        required
                        maxLength={160}
                        value={p.name}
                        onChange={(e) => update(p.id, { name: e.target.value })}
                      />
                    </label>
                    <label className="block space-y-1 text-xs">
                      Product start date (IST reporting day)
                      <input
                        type="date"
                        className={inputClass}
                        max={reportingDay()}
                        value={p.startDate || ""}
                        onChange={(e) =>
                          update(p.id, { startDate: e.target.value || null })
                        }
                      />
                    </label>
                    <p className="text-xs text-text-muted">
                      Only include this product from this date, starting at
                      11:30 AM IST. Leave blank to include all selected dates.
                    </p>
                    <label className="block space-y-1 text-xs">
                      Product links (one per line)
                      <textarea
                        required
                        rows={3}
                        className={inputClass}
                        placeholder="https://your-store.com/products/product-name"
                        value={p.links.join("\n")}
                        onChange={(e) =>
                          update(p.id, { links: e.target.value.split("\n") })
                        }
                      />
                    </label>
                    <p className="text-xs text-text-muted">
                      Multiple links can map to one product tab. Shopify
                      products cannot overlap between tabs.
                    </p>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={p.source === "auto" && !p.manualOverride}
                        onChange={(e) =>
                          update(p.id, {
                            source: e.target.checked ? "auto" : "manual",
                            manualOverride: !e.target.checked,
                            assignments: e.target.checked ? [] : p.assignments,
                          })
                        }
                      />
                      Match campaigns automatically using ad destination links
                    </label>
                    <p className="text-xs text-text-muted">
                      Enabling automatic matching replaces manual selections on
                      save. Run discovery to find matching ads; new mappings
                      start from the day they are first verified. You can unlink
                      individual campaigns below.
                    </p>
                    {config.accounts.map((a) => {
                      const assignment = p.assignments.find(
                        (b) => b.accountId === a.adAccountId,
                      );
                      return (
                        <div
                          key={a.adAccountId}
                          className="rounded-lg border border-border p-3"
                        >
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!assignment}
                              onChange={(e) =>
                                update(p.id, {
                                  assignments: e.target.checked
                                    ? [
                                        ...p.assignments,
                                        {
                                          accountId: a.adAccountId,
                                          campaignIds: [],
                                          mode: "selected",
                                        },
                                      ]
                                    : p.assignments.filter(
                                        (b) => b.accountId !== a.adAccountId,
                                      ),
                                })
                              }
                            />
                            {a.name} · {a.adAccountId}
                          </label>
                          {assignment && (
                            <label className="mt-3 flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                disabled={assignment.mode === "ads"}
                                checked={
                                  assignment.mode === "all" ||
                                  (!assignment.mode &&
                                    !assignment.campaignIds.length)
                                }
                                onChange={(e) =>
                                  update(p.id, {
                                    manualOverride: true,
                                    assignments: p.assignments.map((b) =>
                                      b.accountId === a.adAccountId
                                        ? {
                                            ...b,
                                            mode: e.target.checked
                                              ? "all"
                                              : "selected",
                                            campaignIds: [],
                                            adLinks: undefined,
                                          }
                                        : b,
                                    ),
                                  })
                                }
                              />
                              Include all campaigns in this account
                            </label>
                          )}
                          {assignment &&
                            assignment.mode !== "all" &&
                            (assignment.mode ||
                              assignment.campaignIds.length > 0) && (
                              <Campaigns
                                storeId={storeId}
                                accountId={a.adAccountId}
                                selected={assignment.campaignIds.filter(
                                  (id) =>
                                    !assignment.excludedCampaignIds?.includes(
                                      id,
                                    ),
                                )}
                                automatic={assignment.mode === "ads"}
                                onChange={(ids) =>
                                  update(p.id, {
                                    ...(assignment.mode !== "ads"
                                      ? { manualOverride: true }
                                      : {}),
                                    assignments: p.assignments.map((b) =>
                                      b.accountId === a.adAccountId
                                        ? {
                                            ...b,
                                            mode:
                                              b.mode === "ads"
                                                ? "ads"
                                                : "selected",
                                            campaignIds: ids,
                                            adLinks: b.adLinks?.filter((l) =>
                                              ids.includes(l.campaignId),
                                            ),
                                            excludedCampaignIds: [
                                              ...new Set([
                                                ...(b.excludedCampaignIds ||
                                                  []),
                                                ...b.campaignIds.filter(
                                                  (id) => !ids.includes(id),
                                                ),
                                              ]),
                                            ].filter((id) => !ids.includes(id)),
                                          }
                                        : b,
                                    ),
                                  })
                                }
                              />
                            )}
                        </div>
                      );
                    })}
                    {p.source === "auto" && !p.manualOverride && (
                      <p className="text-xs text-text-muted">
                        Only ads with an unambiguous product URL are assigned.
                        Shared campaigns use each product’s matched ads.
                      </p>
                    )}
                    {!config.accounts.length && (
                      <p className="text-xs text-text-muted">
                        Add ad accounts using Manage ad accounts before
                        assigning campaigns.
                      </p>
                    )}
                    <button
                      type="submit"
                      className={`${buttonClass} text-primary`}
                    >
                      Save changes
                    </button>
                  </div>
                )}
              </section>
            ))}
            <button
              type="button"
              className={buttonClass}
              disabled={products.length >= 30}
              onClick={() => {
                const id = crypto.randomUUID();
                setProducts((all) => [
                  ...all,
                  {
                    id,
                    name: "",
                    source: "manual",
                    manualOverride: true,
                    links: [""],
                    shopifyIds: [],
                    startDate: `${reportingDay().slice(0, 7)}-01`,
                    assignments: [],
                  },
                ]);
                setExpanded((all) => [...all, id]);
              }}
            >
              <Plus className="h-4 w-4" />
              Add manually
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
        </div>
        <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-border bg-surface p-4">
          <button
            type="button"
            disabled={saving || scanning}
            onClick={onClose}
            className={buttonClass}
          >
            Cancel
          </button>
          <button
            disabled={saving || scanning || !dirty}
            className={`${buttonClass} bg-primary text-white`}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "Verifying & saving…" : "Save products"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
