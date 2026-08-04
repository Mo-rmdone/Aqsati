import { egp } from "../../lib/format";

export interface AgingRow {
  bucket: string;
  outstanding: number;
}

// Fixed left-to-right-of-severity order (dataviz skill: "compare magnitude" ->
// bar chart; a status/severity axis is ordered, never re-sorted by value) —
// matches v_aging's (and Task 11's v_installment_aging's) own bucket CASE
// expression (0007_credit_invoices.sql / 0010_installment_aging.sql).
// Exported so the Task 11 aging report and customer-360 view reuse this exact
// bucket vocabulary/order instead of redefining a second one.
export const BUCKET_ORDER = ["current", "b1_30", "b31_60", "b61_90", "b90_plus"] as const;

export const BUCKET_LABEL: Record<(typeof BUCKET_ORDER)[number], string> = {
  current: "غير مستحق بعد",
  b1_30: "متأخر 1-30 يوم",
  b31_60: "متأخر 31-60 يوم",
  b61_90: "متأخر 61-90 يوم",
  b90_plus: "متأخر 90+ يوم",
};

// Severity ramp built from the app's existing three status tokens (Task 8 —
// no new hues introduced): "not due yet" is neutral, the two early-late
// buckets read as amber (the schedule/"due" accent), the two seriously-late
// buckets read as danger. Opacity steps the same hue lighter->darker so
// severity still reads as a single ordered ramp, per the dataviz skill's
// meter guidance ("fill carries severity... same-ramp lighter step").
export const BUCKET_COLOR: Record<(typeof BUCKET_ORDER)[number], string> = {
  current: "bg-muted/60",
  b1_30: "bg-amber/55",
  b31_60: "bg-amber",
  b61_90: "bg-danger/55",
  b90_plus: "bg-danger",
};

/**
 * Aging buckets for آجل (deferred B2B credit) invoices — how much is
 * outstanding, split by how late it is. Horizontal bars scaled to the
 * largest bucket (magnitude comparison, not part-to-whole), each bar's
 * value labeled at its tip rather than inside the fill so it never clips.
 * A single ordered "series" (severity), so no legend box is needed — the
 * bucket label + color position already carry identity (dataviz skill:
 * "a single series needs no legend").
 */
export default function AgingBars({
  rows,
  title = "أعمار الديون (آجل)",
  emptyLabel = "لا توجد فواتير آجل مستحقة حاليًا.",
}: {
  rows: AgingRow[];
  /** Defaults to the original آجل-only wording (Task 10's Dashboard usage
   * is unchanged); Task 11's aging report passes its own titles/empty
   * copy to reuse this same bar chart for the installment side too. */
  title?: string;
  emptyLabel?: string;
}) {
  const totals = new Map<string, number>();
  for (const key of BUCKET_ORDER) totals.set(key, 0);
  for (const r of rows) {
    totals.set(r.bucket, (totals.get(r.bucket) ?? 0) + r.outstanding);
  }

  const max = Math.max(1, ...BUCKET_ORDER.map((k) => totals.get(k) ?? 0));
  const grandTotal = BUCKET_ORDER.reduce((sum, k) => sum + (totals.get(k) ?? 0), 0);

  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 sm:p-6">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>

      {grandTotal === 0 ? (
        <p className="mt-3 text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {BUCKET_ORDER.map((key) => {
            const value = totals.get(key) ?? 0;
            const pct = Math.max((value / max) * 100, value > 0 ? 2 : 0);
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-slate-300 sm:w-36">
                  {BUCKET_LABEL[key]}
                </span>
                <div className="h-6 flex-1 rounded-md bg-white/5">
                  <div
                    className={`h-6 rounded-e-md ${BUCKET_COLOR[key]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-24 shrink-0 text-end font-mono text-sm text-slate-200 tabular-nums">
                  {egp(value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
