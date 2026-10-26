"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { request, buttonClass } from "./shared";
import type {
  AttributedOrder,
  CampaignReport,
} from "@/lib/profit-sheet/attribution";
type Report = {
  completedDays: number;
  campaigns: CampaignReport[];
  revenue: number;
  matchedRevenue: number;
  unmatchedRevenue: number;
  matchedOrders: number;
  orderCount: number;
  coverage: number | null;
  missing: string[];
  currency: string | null;
  orders?: Array<
    AttributedOrder & { scopedRevenue: number; scopedMatch: boolean }
  >;
  totalOrders?: number;
  nextOffset?: number | null;
};
export function AttributionPanel({
  storeId,
  scope,
  from,
  to,
  refreshKey,
}: {
  storeId: string;
  scope: string;
  from: string;
  to: string;
  refreshKey: number;
}) {
  const [selection, setSelection] = useState<string | null>(null),
    [offset, setOffset] = useState(0);
  const report = useQuery({
    queryKey: [
      "profit-sheet-attribution",
      storeId,
      scope,
      from,
      to,
      selection,
      offset,
    ],
    queryFn: ({ signal }) =>
      request<Report>(
        `/api/profit-sheet/attribution?${new URLSearchParams({ storeId, scope, from, to, ...(selection ? { campaign: selection, offset: String(offset) } : {}) })}`,
        { signal },
      ),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const { refetch } = report;
  useEffect(() => {
    void refetch();
  }, [refreshKey, refetch]);
  const data = report.data;
  const money = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: data?.currency || "USD",
    }).format(n);
  const roas = (n: number, d: number) =>
    d > 0 ? `${(n / d).toFixed(2)}×` : "—";
  const choose = (key: string) => {
    setSelection(key);
    setOffset(0);
  };
  return (
    <section
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
      aria-label="Campaign ROAS"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-text-primary">
          Campaign ROAS & order matching
        </h3>
        <span className="text-xs text-text-muted">
          Saved Shopify order evidence · UTM matching v1
        </span>
      </div>
      <p className="text-xs text-text-muted">
        Shopify ROAS = matched Shopify revenue ÷ campaign ad cost. Meta ROAS =
        Meta purchase value ÷ ad cost. Revenue uses the order’s reporting day;
        fees are not deducted. Meta attribution timing can differ. Product tabs
        show their allocated order revenue and assigned campaigns.
      </p>
      {report.error && (
        <p role="alert" className="text-sm text-red-400">
          {report.error.message}{" "}
          <button onClick={() => void report.refetch()} className="underline">
            Retry
          </button>
        </p>
      )}
      {!data && report.isPending && (
        <p className="text-sm text-text-muted">Loading saved attribution…</p>
      )}
      {data && (
        <>
          {data.missing.length > 0 && (
            <p
              role="status"
              className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-400"
            >
              {data.missing.length} reporting days need attribution sync.
              Figures below cover only completed days. Use Sync selected range
              or refresh the affected day if its sync failed.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-text-muted">Matched Shopify revenue</p>
              <p className="mt-1 text-lg font-semibold text-emerald-400">
                {data.completedDays ? money(data.matchedRevenue) : "—"}
              </p>
              <p className="text-xs text-text-muted">
                {data.matchedOrders} of {data.orderCount} orders
              </p>
            </div>
            <button
              onClick={() => choose("unmatched")}
              className="rounded-xl border border-border p-3 text-left hover:border-cyan-400"
            >
              <p className="text-xs text-text-muted">Unattributed revenue</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {data.completedDays ? money(data.unmatchedRevenue) : "—"}
              </p>
              <p className="text-xs text-cyan-400">
                Inspect unmatched orders →
              </p>
            </button>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-text-muted">
                Revenue attribution coverage
              </p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {data.coverage == null ? "—" : `${data.coverage.toFixed(1)}%`}
              </p>
              <p className="text-xs text-text-muted">
                Unmatched sales stay in Total Revenue
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-right text-sm">
              <thead className="bg-surface-hover text-xs text-text-secondary">
                <tr>
                  {[
                    "Campaign",
                    "Ad Cost",
                    "Meta Purchase Value",
                    "Meta ROAS",
                    "Shopify Orders",
                    "Shopify Revenue",
                    "Shopify ROAS",
                  ].map((c) => (
                    <th key={c} className="px-3 py-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.campaigns.map((c) => (
                  <tr
                    key={c.key}
                    className="border-b border-border text-text-secondary"
                  >
                    <th className="max-w-96 truncate px-3 py-3 text-left font-normal">
                      <button
                        className="text-cyan-400 hover:underline"
                        onClick={() => choose(c.key)}
                      >
                        {c.name}
                      </button>
                      <span className="block text-xs text-text-muted">
                        {c.accountId} · {c.campaignId}
                      </span>
                    </th>
                    <td className="px-3">{money(c.spend)}</td>
                    <td className="px-3">{money(c.metaValue)}</td>
                    <td className="px-3">{roas(c.metaValue, c.spend)}</td>
                    <td className="px-3">{c.orders}</td>
                    <td className="px-3">{money(c.revenue)}</td>
                    <td className="px-3 font-semibold text-emerald-400">
                      {roas(c.revenue, c.spend)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.campaigns.length && (
              <p className="p-3 text-sm text-text-muted">
                No campaign spend or matched campaigns in the completed days.
              </p>
            )}
          </div>
          {selection && (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">
                  {selection === "unmatched"
                    ? "Unattributed orders"
                    : data.campaigns.find((c) => c.key === selection)?.name ||
                      "Campaign orders"}{" "}
                  · {data.totalOrders || 0} orders
                </h4>
                <button
                  className={buttonClass}
                  onClick={() => {
                    setSelection(null);
                    setOffset(0);
                  }}
                >
                  Close orders
                </button>
              </div>
              {report.isPlaceholderData && (
                <p className="text-sm text-text-muted">Loading orders…</p>
              )}
              {!report.isPlaceholderData &&
                data.orders?.map((o) => (
                  <details
                    key={o.orderId}
                    className="rounded-lg border border-border p-3 text-sm text-text-secondary"
                  >
                    <summary className="cursor-pointer">
                      <strong>{o.name}</strong> · {money(o.scopedRevenue)} ·{" "}
                      {o.reason}
                    </summary>
                    <div className="mt-3 space-y-2 text-xs">
                      <p>
                        Source: {o.source} · Touch:{" "}
                        {o.timestamp || "Timestamp unavailable"} · Order:{" "}
                        {o.evidence.createdAt}
                      </p>
                      <p>
                        Campaign: {o.campaignId || "Unmatched"} · Ad set:{" "}
                        {o.adsetId || "Unknown"} · Ad: {o.adId || "Unknown"}
                      </p>
                      <p>
                        Order revenue: {money(o.revenue)} · Revenue in this tab:{" "}
                        {money(o.scopedRevenue)}
                      </p>
                      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-surface-hover p-3">
                        {JSON.stringify(
                          {
                            selectedUtms: o.utm,
                            shopifyJourney: o.evidence.journey,
                            upsellGenie: o.evidence.ug,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  </details>
                ))}
              {!report.isPlaceholderData && !data.orders?.length && (
                <p className="text-sm text-text-muted">
                  No orders in this selection.
                </p>
              )}
              <div className="flex gap-2">
                <button
                  disabled={offset === 0}
                  className={buttonClass}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  Previous orders
                </button>
                <button
                  disabled={data.nextOffset == null}
                  className={buttonClass}
                  onClick={() => setOffset(data.nextOffset!)}
                >
                  Next orders
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
