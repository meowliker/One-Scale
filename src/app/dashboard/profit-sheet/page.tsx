"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fromZonedTime } from "date-fns-tz";
import {
  Loader2,
  Package,
  RefreshCw,
  Save,
  Settings2,
  Table2,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useStoreStore } from "@/stores/storeStore";
import { formatDateInTimezone } from "@/lib/timezone";
import { type StoreSheetDay } from "@/lib/profit-sheet";
import {
  defaultRange,
  currentSavedDay,
  runnableJob,
  reportingDay,
  REPORTING_ZONE,
  sheetDates,
  type SheetConfig,
  type SavedDay,
  type SheetJob,
} from "@/lib/profit-sheet/model";
import { AttributionPanel } from "./AttributionPanel";
import { ProfitTable } from "./ProfitTable";
import { AccountsDialog } from "./AccountsDialog";
import { ProductsDialog } from "./ProductsDialog";
import { buttonClass, inputClass, request } from "./shared";
type Report = { days: SavedDay[]; jobs: SheetJob[] };
function Workspace({
  storeId,
  storeName,
  config,
}: {
  storeId: string;
  storeName: string;
  config: SheetConfig;
}) {
  const client = useQueryClient();
  const [range, setRange] = useState(() => defaultRange(config.settings));
  const [endToday, setEndToday] = useState(config.settings.endToday);
  const [scope, setScope] = useState("store");
  const [metaRequirement, setMetaRequirement] = useState({
    scope: "store",
    required: false,
  });
  const onMetaRequired = useCallback(
    (scope: string, required: boolean) =>
      setMetaRequirement((previous) =>
        previous.scope === scope && previous.required === required
          ? previous
          : { scope, required },
      ),
    [],
  );
  const [attributionRequirement, setAttributionRequirement] = useState({
    scope: "store",
    required: false,
  });
  const onAttributionRequired = useCallback(
    (scope: string, required: boolean) =>
      setAttributionRequirement((p) =>
        p.scope === scope && p.required === required ? p : { scope, required },
      ),
    [],
  );
  const [showAttribution, setShowAttribution] = useState(false);
  const [dialog, setDialog] = useState<"accounts" | "products" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const queued = useRef(new Set<string>());
  const [currentDay, setCurrentDay] = useState(reportingDay);
  useEffect(() => {
    const timer = setInterval(() => setCurrentDay(reportingDay()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (endToday)
      setRange((r) => (r.to === currentDay ? r : { ...r, to: currentDay }));
  }, [currentDay, endToday]);
  const actualScope = config.products.some((p) => p.id === scope)
    ? scope
    : "store";
  const attributionRequired =
    showAttribution ||
    (attributionRequirement.scope === actualScope &&
      attributionRequirement.required);
  const metaRequired =
    metaRequirement.scope === actualScope && metaRequirement.required;
  const productStart = config.products.find(
    (p) => p.id === actualScope,
  )?.startDate;
  const reportFrom =
    productStart && productStart > range.from ? productStart : range.from;
  const hasDates = reportFrom <= range.to;
  const daily = useQuery({
    queryKey: [
      "profit-sheet-daily",
      storeId,
      reportFrom,
      range.to,
      actualScope,
    ],
    queryFn: ({ signal }) =>
      request<Report>(
        `/api/profit-sheet/daily?${new URLSearchParams({ storeId, from: reportFrom, to: range.to, scope: actualScope })}`,
        { signal },
      ),
    retry: false,
    enabled: hasDates,
    refetchInterval: (query) =>
      query.state.data?.jobs.some(
        (j) => j.status === "queued" || j.status === "running",
      )
        ? 4000
        : false,
  });
  const dates = hasDates ? sheetDates(reportFrom, range.to) : [];
  const missing = dates.filter(
    (d) =>
      !daily.data?.days.some(
        (row) =>
          row.date === d &&
          currentSavedDay(
            row,
            config.version,
            actualScope,
            metaRequired,
            attributionRequired,
          ),
      ),
  );
  async function reload() {
    await client.invalidateQueries({
      queryKey: ["profit-sheet-daily", storeId],
    });
    await client.invalidateQueries({
      queryKey: ["profit-sheet-config", storeId],
    });
  }
  async function queueRange() {
    setError("");
    setBusy(true);
    try {
      await request("/api/profit-sheet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          action: "queue",
          from: reportFrom,
          to: range.to,
          force: true,
          scope: actualScope,
          metaVersion: metaRequired ? 1 : 0,
          attributionVersion: attributionRequired ? 1 : 0,
        }),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not queue sync.");
    } finally {
      setBusy(false);
    }
  }
  // First visit/new range/configuration: fill missing days without requiring a trip to another page.
  useEffect(() => {
    if (!daily.data || !missing.length) return;
    const key = `${storeId}:${reportFrom}:${range.to}:${actualScope}:${config.version}:finance1:meta${metaRequired ? 1 : 0}:attribution${attributionRequired ? 1 : 0}`;
    if (queued.current.has(key)) return;
    queued.current.add(key);
    void request("/api/profit-sheet/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        action: "queue",
        from: reportFrom,
        to: range.to,
        scope: actualScope,
        metaVersion: metaRequired ? 1 : 0,
        attributionVersion: attributionRequired ? 1 : 0,
      }),
    })
      .then(() =>
        client.invalidateQueries({ queryKey: ["profit-sheet-daily", storeId] }),
      )
      .catch((e) => setError(e.message));
  }, [
    daily.data,
    missing.length,
    storeId,
    reportFrom,
    range.to,
    config.version,
    actualScope,
    metaRequired,
    attributionRequired,
    client,
  ]);
  // The durable queue continues on cron; while this page is open it can also process a day immediately.
  useEffect(() => {
    const job = runnableJob(daily.data?.jobs || []);
    if (processing || !job) return;
    setProcessing(true);
    void request("/api/profit-sheet/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId, date: job.date }),
      signal: AbortSignal.timeout(290000),
    })
      .catch((e) => setError(e.message))
      .finally(async () => {
        // Always deliver completion, even if polling or range navigation
        // replaced the effect while the provider request was in flight.
        await client.invalidateQueries({
          queryKey: ["profit-sheet-daily", storeId],
        });
        setProcessing(false);
      });
  }, [daily.data, storeId, client, processing]);
  async function refreshDate(date: string) {
    setBusy(true);
    setError("");
    try {
      await request("/api/profit-sheet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          action: "queue",
          from: date,
          to: date,
          force: true,
        }),
      });
      await request("/api/profit-sheet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, date }),
        signal: AbortSignal.timeout(290000),
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("/api/profit-sheet/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, ...range, endToday }),
      });
      await client.invalidateQueries({
        queryKey: ["profit-sheet-config", storeId],
      });
      setNotice("Settings saved for this store.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }
  function chooseRange(selected: { start: Date; end: Date }) {
    const next = {
      from: formatDateInTimezone(selected.start, REPORTING_ZONE),
      to: formatDateInTimezone(selected.end, REPORTING_ZONE),
    };
    try {
      sheetDates(next.from, next.to);
      setRange(next);
      setEndToday(next.to === reportingDay());
      setNotice("Range changed. Save settings to remember it for this store.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid range.");
    }
  }
  const rows = dates.map(
    (date) =>
      daily.data?.days.find((d) => d.date === date)?.metrics || {
        date,
        orders: null,
        revenue: null,
        shopifyFees: null,
        otherFees: null,
        adSpend: null,
        clicks: null,
        purchases: null,
        linkClicks: null,
      },
  );
  const total: StoreSheetDay = {
    date: "Total",
    attributedRevenue: 0,
    impressions: 0,
    purchaseValue: 0,
    addToCart: 0,
    checkouts: 0,
    landingViews: 0,
    chargebackLoss: 0,
    chargebackWon: 0,
    adjustment: 0,
    refunds: 0,
    orders: 0,
    revenue: 0,
    shopifyFees: 0,
    otherFees: 0,
    adSpend: 0,
    clicks: 0,
    purchases: 0,
    linkClicks: 0,
  };
  for (const row of rows)
    for (const key of [
      "attributedRevenue",
      "impressions",
      "purchaseValue",
      "addToCart",
      "checkouts",
      "landingViews",
      "chargebackLoss",
      "chargebackWon",
      "adjustment",
      "refunds",
      "orders",
      "revenue",
      "shopifyFees",
      "otherFees",
      "adSpend",
      "clicks",
      "purchases",
      "linkClicks",
    ] as const)
      total[key] =
        total[key] == null || row[key] == null ? null : total[key]! + row[key]!;
  const pending =
    daily.data?.jobs.filter(
      (j) => j.status === "queued" || j.status === "running",
    ).length || 0;
  const failures = daily.data?.jobs.filter((j) => j.status === "error") || [];
  const warnings = [
    ...new Set(daily.data?.days.flatMap((d) => d.warnings) || []),
  ];
  const currency = daily.data?.days[0]?.currency || config.currency;
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {storeName}
          </h2>
          <p className="text-sm text-text-muted">
            {config.accounts.length} ad accounts · {config.products.length}{" "}
            products · {currency || "Loading currency"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={buttonClass} onClick={() => setDialog("products")}>
            <Package className="h-4 w-4" />
            Manage products
          </button>
          <button className={buttonClass} onClick={() => setDialog("accounts")}>
            <Settings2 className="h-4 w-4" />
            Manage ad accounts
          </button>
          <button
            disabled={busy}
            className={buttonClass}
            onClick={() => void refreshDate(reportingDay())}
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            Refresh today
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <DateRangePicker
          calendarDays
          currentDay={currentDay}
          timezone={REPORTING_ZONE}
          align="left"
          dateRange={{
            start: fromZonedTime(`${range.from}T12:00:00`, REPORTING_ZONE),
            end: fromZonedTime(`${range.to}T12:00:00`, REPORTING_ZONE),
            preset: "custom",
          }}
          onRangeChange={chooseRange}
        />
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={endToday}
            onChange={(e) => {
              setEndToday(e.target.checked);
              if (e.target.checked)
                setRange((r) => ({ ...r, to: reportingDay() }));
            }}
          />
          End at current reporting day
        </label>
        <button
          disabled={busy}
          className={buttonClass}
          onClick={() => void saveSettings()}
        >
          <Save className="h-4 w-4" />
          Save settings
        </button>
        <button
          disabled={busy || !hasDates}
          className={buttonClass}
          onClick={() => void queueRange()}
        >
          Sync selected range
        </button>
      </div>
      <p className="text-xs text-text-muted">
        A reporting day runs from 11:30 AM IST to 11:29:59 AM IST the following
        day. Saved reports load directly from Supabase.
      </p>
      {productStart && (
        <p className="text-xs text-text-muted">
          Product reporting starts {productStart} at 11:30 AM IST.
          {!hasDates &&
            " Choose a range on or after this date to view its data."}
        </p>
      )}
      <div
        role="tablist"
        aria-label="Profit sheet views"
        className="flex gap-2 overflow-x-auto border-b border-border pb-2"
      >
        {[{ id: "store", name: "Complete store" }, ...config.products].map(
          (p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={actualScope === p.id}
              onClick={() => setScope(p.id)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm ${actualScope === p.id ? "bg-primary text-white" : "text-text-secondary hover:bg-surface-hover"}`}
            >
              {p.name}
            </button>
          ),
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm text-emerald-500">
          {notice}
        </p>
      )}
      {(error || daily.error) && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500"
        >
          {error || daily.error?.message}
        </p>
      )}
      {pending > 0 && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-text-secondary"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {pending}{" "}
          {missing.length
            ? "reporting days queued or syncing in this range."
            : "saved reporting days refreshing in the background."}{" "}
          Cached figures remain visible.
        </p>
      )}
      {missing.length > 0 && !pending && !daily.isPending && (
        <p className="text-sm text-text-muted">
          {missing.length} days need an initial sync or updated report. Sync the
          selected range to fill them.
        </p>
      )}
      {failures.length > 0 && (
        <div
          role="alert"
          className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500"
        >
          {failures.slice(0, 3).map((j) => (
            <p key={j.date}>
              {j.date}: {j.error} Use that row’s refresh button to retry.
            </p>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border p-4">
          <h3 className="font-semibold text-text-primary">
            {actualScope === "store"
              ? "Complete store"
              : config.products.find((p) => p.id === actualScope)?.name}{" "}
            · Daily profit sheet
          </h3>
          <p className="mt-1 text-xs text-text-muted">
            {actualScope === "store"
              ? "All store products and all configured ad accounts, without counting a campaign twice."
              : "Full order revenue, including add-ons and shipping, matched using saved Shopify product links. Ads follow assigned accounts and campaigns."}
          </p>
        </div>
        <ProfitTable
          key={`${storeId}:${actualScope}`}
          storeId={storeId}
          scope={actualScope}
          rows={rows}
          total={total}
          currency={currency}
          busy={busy}
          onRefresh={(date) => void refreshDate(date)}
          onMetaRequired={onMetaRequired}
          onAttributionRequired={onAttributionRequired}
        />
      </div>
      <button
        className={buttonClass}
        aria-expanded={showAttribution}
        onClick={() => setShowAttribution(!showAttribution)}
      >
        {showAttribution ? "Hide" : "Show"} campaign ROAS & order matching
      </button>
      {showAttribution && hasDates && (
        <AttributionPanel
          key={`${storeId}:${actualScope}:${reportFrom}:${range.to}`}
          storeId={storeId}
          scope={actualScope}
          from={reportFrom}
          to={range.to}
          refreshKey={daily.dataUpdatedAt}
        />
      )}
      {warnings.length > 0 && (
        <details className="text-xs text-text-muted">
          <summary className="cursor-pointer">
            Report notes ({warnings.length})
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-text-muted">
        {actualScope === "store"
          ? "Actual Sales = Total Revenue − Shopify Fees − Chargeback Loss − Refunds + Chargeback Won + Adjustment. Profit = Actual Sales − Ad Cost. Fees are displayed as signed deductions; adjustments retain their sign. Financial movements use their processing date within the reporting day. Missing data shows —."
          : "Profit = revenue − ads − Shopify fees. Each matched order’s revenue and fees go to its product tab; multi-product orders are split without duplicating revenue. Conversion Rate uses Meta purchases ÷ link clicks. Missing data shows —."}
      </p>
      {dialog === "accounts" && (
        <AccountsDialog
          storeId={storeId}
          storeName={storeName}
          accounts={config.accounts}
          version={config.version}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "products" && (
        <ProductsDialog
          storeId={storeId}
          config={config}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}
function StoreSheet({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const config = useQuery({
    queryKey: ["profit-sheet-config", storeId],
    queryFn: ({ signal }) =>
      request<SheetConfig>(
        `/api/profit-sheet/config?storeId=${encodeURIComponent(storeId)}`,
        { signal },
      ),
    retry: false,
    refetchInterval: 30000,
  });
  if (config.isPending)
    return (
      <p className="text-sm text-text-muted">Loading saved store settings…</p>
    );
  if (config.error)
    return (
      <p role="alert" className="text-sm text-red-500">
        {config.error.message}{" "}
        <button onClick={() => void config.refetch()} className="underline">
          Retry
        </button>
      </p>
    );
  return (
    <Workspace storeId={storeId} storeName={storeName} config={config.data} />
  );
}
export default function ProfitSheetPage() {
  const storeId = useStoreStore((s) => s.activeStoreId),
    stores = useStoreStore((s) => s.stores),
    setActiveStore = useStoreStore((s) => s.setActiveStore),
    loading = useStoreStore((s) => s.loading),
    error = useStoreStore((s) => s.error);
  const store = stores.find((s) => s.id === storeId);
  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-border bg-surface px-6 py-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
            <Table2 className="h-4 w-4" />
            Store & product reporting
          </div>
          <h1 className="text-2xl font-bold text-text-primary">Profit Sheet</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Saved daily reports for each store and product.
          </p>
        </div>
        <label className="w-full space-y-1.5 text-xs font-medium text-text-secondary sm:w-72">
          Store
          <select
            aria-label="Store"
            value={storeId}
            onChange={(e) => setActiveStore(e.target.value)}
            className={inputClass}
            disabled={!stores.length}
          >
            <option value="" disabled>
              Select a store
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      {store ? (
        <StoreSheet key={store.id} storeId={store.id} storeName={store.name} />
      ) : (
        <p className="p-8 text-sm text-text-muted">
          {loading
            ? "Loading stores…"
            : error || "Connect a store in Settings."}
        </p>
      )}
    </div>
  );
}
