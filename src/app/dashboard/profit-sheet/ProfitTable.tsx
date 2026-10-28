"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Columns3, GripVertical, RefreshCw, Save, X } from "lucide-react";
import {
  COLUMNS,
  availableColumns,
  columnValue,
  defaultColumns,
  moveColumn,
  needsExtendedMeta,
  needsAttribution,
  type ColumnId,
  type SheetLayout,
} from "@/lib/profit-sheet/columns";
import type { StoreSheetDay } from "@/lib/profit-sheet";
import { formatSheetDate } from "@/lib/profit-sheet/date-label";
import { buttonClass, inputClass, request } from "./shared";
type Props = {
  storeId: string;
  scope: string;
  rows: StoreSheetDay[];
  total: StoreSheetDay;
  currency: string | null;
  busy: boolean;
  onRefresh: (date: string) => void;
  onMetaRequired: (scope: string, required: boolean) => void;
  onAttributionRequired: (scope: string, required: boolean) => void;
};
export function ProfitTable(props: Props) {
  const query = useQuery({
    queryKey: ["profit-sheet-layout", props.storeId, props.scope],
    queryFn: ({ signal }) =>
      request<SheetLayout>(
        `/api/profit-sheet/views?${new URLSearchParams({ storeId: props.storeId, scope: props.scope })}`,
        { signal },
      ),
    refetchOnWindowFocus: false,
    refetchOnMount: "always",
    retry: false,
  });
  if (!query.data)
    return (
      <div className="p-4 text-sm text-text-muted">
        {query.error ? (
          <span role="alert">
            Could not load saved columns.{" "}
            <button className="underline" onClick={() => void query.refetch()}>
              Retry
            </button>
          </span>
        ) : (
          "Loading saved columns and views…"
        )}
      </div>
    );
  return (
    <LayoutTable
      key={`${props.storeId}:${props.scope}:${query.data.revision}`}
      {...props}
      initial={query.data}
      loading={query.isFetching}
      reload={() => void query.refetch()}
    />
  );
}
function LayoutTable({
  initial,
  loading,
  reload,
  ...props
}: Props & { initial: SheetLayout; loading: boolean; reload: () => void }) {
  const [layout, setLayout] = useState(initial);
  const latest = useRef(initial),
    revision = useRef(initial.revision);
  const pending = useRef<SheetLayout | null>(null),
    saving = useRef(false);
  const [saveState, setSaveState] = useState(
    initial.revision ? "Saved to Supabase" : "Default layout",
  );
  const [saveError, setSaveError] = useState("");
  const [picker, setPicker] = useState(false),
    [name, setName] = useState(""),
    [naming, setNaming] = useState(false),
    [search, setSearch] = useState("");
  const [dragged, setDragged] = useState<ColumnId | null>(null),
    [slot, setSlot] = useState<number | null>(null);
  const draggedRef = useRef<ColumnId | null>(null);
  const { storeId, scope, onMetaRequired } = props;
  const needsMeta = needsExtendedMeta(layout.columns);
  useEffect(() => {
    if (!loading) onMetaRequired(scope, needsMeta);
  }, [scope, needsMeta, onMetaRequired, loading]);
  const needsOrders = needsAttribution(layout.columns);
  const onAttributionRequired = props.onAttributionRequired;
  useEffect(() => {
    if (!loading) onAttributionRequired(scope, needsOrders);
  }, [scope, needsOrders, onAttributionRequired, loading]);
  // Serialize rapid reorder/toggle changes. The last queued snapshot always uses
  // the revision returned by the prior write, avoiding lost saves and races.
  async function flush() {
    if (saving.current) return;
    saving.current = true;
    setSaveError("");
    setSaveState("Saving…");
    try {
      while (pending.current) {
        const snapshot = pending.current;
        pending.current = null;
        const saved = await request<SheetLayout>("/api/profit-sheet/views", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeId,
            scope,
            layout: { ...snapshot, revision: revision.current },
          }),
          keepalive: true,
        });
        revision.current = saved.revision;
      }
      setSaveState("Saved to Supabase");
    } catch (e) {
      pending.current = null;
      setSaveState("Not saved");
      setSaveError(
        e instanceof Error ? e.message : "Could not save this layout.",
      );
    } finally {
      saving.current = false;
    }
  }
  function change(next: SheetLayout) {
    latest.current = next;
    setLayout(next);
    pending.current = next;
    void flush();
  }
  function reorder(id: ColumnId, insertion: number) {
    const columns = moveColumn(latest.current.columns, id, insertion);
    if (columns.join() !== latest.current.columns.join())
      change({ ...latest.current, columns });
  }
  function dragOver(e: DragEvent<HTMLTableCellElement>, index: number) {
    if (!draggedRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    setSlot(index + (e.clientX > rect.left + rect.width / 2 ? 1 : 0));
    const scroller = e.currentTarget.closest(".overflow-x-auto");
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (e.clientX > bounds.right - 50) scroller.scrollLeft += 22;
      else if (e.clientX < bounds.left + 50) scroller.scrollLeft -= 22;
    }
  }
  function endDrag() {
    draggedRef.current = null;
    setDragged(null);
    setSlot(null);
  }
  const selected = layout.views.find((v) => v.id === layout.activeView);
  const modified =
    selected && selected.columns.join() !== layout.columns.join();
  const disabled = loading || !!saveError;
  function saveNew() {
    const trimmed = name.trim();
    if (
      !trimmed ||
      layout.views.some((v) => v.name.toLowerCase() === trimmed.toLowerCase())
    )
      return;
    const view = {
      id: crypto.randomUUID(),
      name: trimmed,
      columns: [...layout.columns],
    };
    change({ ...layout, views: [...layout.views, view], activeView: view.id });
    setNaming(false);
    setName("");
  }
  const duplicate = layout.views.some(
    (v) => v.name.toLowerCase() === name.trim().toLowerCase(),
  );
  const number = (v: number, id: ColumnId) => {
    const format = COLUMNS[id].format;
    if (format === "money")
      return props.currency
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: props.currency,
          }).format(Object.is(v, -0) ? 0 : v)
        : "—";
    if (format === "percent") return `${v.toFixed(2)}%`;
    if (format === "ratio") return `${v.toFixed(2)}×`;
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
      v,
    );
  };
  function renderRow(row: StoreSheetDay, total = false) {
    return (
      <tr
        key={row.date}
        className={`border-t border-border ${total ? "bg-surface-hover font-semibold" : "text-text-secondary"}`}
      >
        {layout.columns.map((id, index) => {
          const classes = `px-4 py-3 tabular-nums ${index === 0 ? `sticky left-0 z-10 ${total ? "bg-surface-hover" : "bg-surface"}` : ""}`;
          if (id === "date")
            return (
              <th
                key={id}
                scope="row"
                className={`${classes} text-left font-medium`}
              >
                <span className="inline-flex items-center gap-2">
                  {total
                    ? "Total"
                    : formatSheetDate(row.date)}
                  {!total && (
                    <button
                      disabled={props.busy}
                      className="rounded p-1 text-text-muted hover:text-primary disabled:opacity-40"
                      aria-label={`Refresh ${row.date}`}
                      onClick={() => props.onRefresh(row.date)}
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                  )}
                </span>
              </th>
            );
          const value = columnValue(id, row, scope);
          return (
            <td
              key={id}
              className={`${classes} ${id === "profit" && value != null ? (value < 0 ? "text-red-500" : "text-emerald-500") : ""}`}
            >
              {value == null || !Number.isFinite(value)
                ? "—"
                : number(value, id)}
            </td>
          );
        })}
      </tr>
    );
  }
  return (
    <>
      <div className="space-y-3 border-b border-border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label
            className="text-sm text-text-secondary"
            htmlFor={`view-${scope}`}
          >
            View
          </label>
          <select
            id={`view-${scope}`}
            aria-label="Saved view"
            disabled={disabled}
            className={`${inputClass} !w-auto min-w-44`}
            value={layout.activeView || ""}
            onChange={(e) => {
              const v = layout.views.find((v) => v.id === e.target.value);
              change({
                ...layout,
                activeView: v?.id || null,
                columns: v ? [...v.columns] : layout.columns,
              });
            }}
          >
            <option value="">Current layout</option>
            {layout.views.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {modified && v.id === layout.activeView ? " · modified" : ""}
              </option>
            ))}
          </select>
          <button
            disabled={disabled}
            className={buttonClass}
            aria-expanded={picker}
            onClick={() => setPicker(!picker)}
          >
            <Columns3 className="h-4 w-4" />
            Columns
          </button>
          <button
            disabled={disabled || layout.views.length >= 30}
            className={buttonClass}
            onClick={() => {
              setNaming(!naming);
              setName("");
            }}
          >
            <Save className="h-4 w-4" />
            Save as new view
          </button>
          {selected && (
            <>
              <button
                disabled={disabled || !modified}
                className={buttonClass}
                onClick={() =>
                  change({
                    ...layout,
                    views: layout.views.map((v) =>
                      v.id === selected.id
                        ? { ...v, columns: [...layout.columns] }
                        : v,
                    ),
                  })
                }
              >
                Update view
              </button>
              <button
                disabled={disabled}
                className="px-2 text-xs text-text-muted hover:text-red-400"
                onClick={() =>
                  change({
                    ...layout,
                    views: layout.views.filter((v) => v.id !== selected.id),
                    activeView: null,
                  })
                }
              >
                Delete view
              </button>
            </>
          )}
          <button
            disabled={disabled}
            className="px-2 text-xs text-text-muted underline"
            onClick={() =>
              change({
                ...layout,
                columns: defaultColumns(scope),
                activeView: null,
              })
            }
          >
            Reset columns
          </button>
          <span
            role="status"
            className={`ml-auto text-xs ${saveError ? "text-red-400" : "text-text-muted"}`}
          >
            {loading ? "Loading saved settings…" : saveState}
          </span>
        </div>
        {saveError && (
          <p role="alert" className="text-sm text-red-400">
            {saveError}{" "}
            <button className="underline" onClick={reload}>
              Reload saved settings
            </button>
          </p>
        )}
        {naming && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveNew();
            }}
          >
            <input
              autoFocus
              maxLength={60}
              aria-label="View name"
              placeholder="e.g. Meta performance"
              className={`${inputClass} !w-64`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              disabled={disabled || !name.trim() || duplicate}
              className={buttonClass}
              type="submit"
            >
              Save view
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setNaming(false)}
            >
              Cancel
            </button>
            {duplicate && (
              <span role="alert" className="text-xs text-red-400">
                A view with this name already exists.
              </span>
            )}
          </form>
        )}
        {picker && (
          <div className="rounded-xl border border-border bg-surface-hover p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <input
                aria-label="Search columns"
                placeholder="Search columns…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} max-w-sm`}
              />
              <button
                aria-label="Close column picker"
                onClick={() => setPicker(false)}
                className={buttonClass}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(["Store", "Meta"] as const).map((group) => (
              <fieldset key={group} className="mb-3">
                <legend
                  className={`mb-2 text-xs font-semibold uppercase tracking-wide ${group === "Meta" ? "text-cyan-400" : "text-text-muted"}`}
                >
                  {group === "Meta" ? "Meta Ads metrics" : "Store metrics"}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {availableColumns(scope)
                    .filter(
                      (id) =>
                        COLUMNS[id].group === group &&
                        COLUMNS[id].label
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    )
                    .map((id) => (
                      <label
                        key={id}
                        className="flex items-center gap-2 text-sm text-text-secondary"
                      >
                        <input
                          type="checkbox"
                          disabled={disabled || id === "date"}
                          checked={layout.columns.includes(id)}
                          onChange={(e) =>
                            change({
                              ...layout,
                              columns: e.target.checked
                                ? [...layout.columns, id]
                                : layout.columns.filter((c) => c !== id),
                            })
                          }
                        />
                        {COLUMNS[id].label}
                        {id === "date" && (
                          <span className="text-xs text-text-muted">
                            required
                          </span>
                        )}
                      </label>
                    ))}
                </div>
              </fieldset>
            ))}
            <p className="text-xs text-text-muted">
              Meta values follow the assigned accounts, campaigns and reporting
              hours. Meta ROAS uses Meta purchase value; Shopify ROAS uses
              UTM-matched Shopify revenue. Blended ROAS uses all Shopify revenue
              and is optional. Reach and frequency are not added across
              campaigns. Missing saved metrics are fetched automatically.
            </p>
          </div>
        )}
        <p className="text-xs text-text-muted">
          Hold and drag a column header to move it. The cyan/green line marks
          where it will land. Keyboard: focus a header and use Alt + ← / →.
          Column settings save for this{" "}
          {scope === "store" ? "store" : "product"}.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table
          className="w-full whitespace-nowrap text-right text-sm"
          style={{ minWidth: Math.max(700, layout.columns.length * 145) }}
        >
          <thead className="bg-surface-hover text-xs text-text-secondary">
            <tr>
              {layout.columns.map((id, index) => (
                <th
                  key={id}
                  scope="col"
                  data-column-id={id}
                  draggable={!disabled}
                  onDragStart={(e) => {
                    draggedRef.current = id;
                    setDragged(id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", id);
                  }}
                  onDragOver={(e) => dragOver(e, index)}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedRef.current) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      reorder(
                        draggedRef.current,
                        index +
                          (e.clientX > rect.left + rect.width / 2 ? 1 : 0),
                      );
                    }
                    endDrag();
                  }}
                  onDragEnd={endDrag}
                  className={`relative px-4 py-3 ${index === 0 ? "sticky left-0 z-20 bg-surface-hover" : ""} ${dragged === id ? "opacity-50" : ""}`}
                >
                  {slot === index && (
                    <span
                      aria-hidden="true"
                      data-drop-indicator="before"
                      className="pointer-events-none absolute -left-px top-0 z-30 h-full w-[3px] bg-gradient-to-b from-cyan-300 to-emerald-400 shadow-[0_0_9px_#22d3ee]"
                    />
                  )}
                  <button
                    disabled={disabled}
                    className={`inline-flex w-full cursor-grab items-center ${id === "date" ? "justify-start" : "justify-end"} gap-2 rounded py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400 active:cursor-grabbing`}
                    aria-label={`Move ${COLUMNS[id].label}`}
                    onKeyDown={(e) => {
                      if (
                        e.altKey &&
                        (e.key === "ArrowLeft" || e.key === "ArrowRight")
                      ) {
                        e.preventDefault();
                        reorder(id, index + (e.key === "ArrowLeft" ? -1 : 2));
                      }
                    }}
                  >
                    <GripVertical className={`h-3 w-3 shrink-0 text-text-muted ${id === "date" ? "order-last" : ""}`} />
                    {COLUMNS[id].label}
                  </button>
                  {slot === layout.columns.length &&
                    index === layout.columns.length - 1 && (
                      <span
                        aria-hidden="true"
                        data-drop-indicator="after"
                        className="pointer-events-none absolute right-0 top-0 z-30 h-full w-[3px] bg-gradient-to-b from-cyan-300 to-emerald-400 shadow-[0_0_9px_#22d3ee]"
                      />
                    )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{props.rows.map((row) => renderRow(row))}</tbody>
          <tfoot>{renderRow(props.total, true)}</tfoot>
        </table>
      </div>
    </>
  );
}
