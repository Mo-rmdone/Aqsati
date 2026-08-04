import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp, arDate } from "../../lib/format";
import { toCsv, downloadCsv } from "../../lib/csv";

type Granularity = "day" | "week" | "month";

const GRANULARITY_LABEL: Record<Granularity, string> = {
  day: "يوميًا",
  week: "أسبوعيًا",
  month: "شهريًا",
};

// Cairo-local calendar date (YYYY-MM-DD) for a timestamptz, via Intl rather
// than manual UTC-offset math — en-CA formats as YYYY-MM-DD, which is also a
// safe, unambiguous grouping/sort key.
function cairoDateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

// Monday of the ISO week containing `dateKey` (documented choice: ISO
// week-start, not the Egyptian Saturday-start week — see the module comment
// below) — used as both the week's grouping key and its display anchor.
function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}

function bucketKey(iso: string, granularity: Granularity): string {
  const dayKey = cairoDateKey(iso);
  if (granularity === "day") return dayKey;
  if (granularity === "week") return mondayOf(dayKey);
  return dayKey.slice(0, 7); // YYYY-MM
}

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("ar-EG", {
      month: "long",
      year: "numeric",
      timeZone: "Africa/Cairo",
    }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  if (granularity === "week") {
    return `أسبوع ${arDate(key)}`;
  }
  return arDate(key);
}

/**
 * Collections-by-period report — how much cash actually came in, grouped by
 * day/week/month (Task 11 brief step 4). Default granularity: شهريًا
 * (month), matching the "محصّل هذا الشهر" framing already on the dashboard
 * (Task 10's v_collections_kpi) and giving a readable table size without
 * pagination at MVP scale; day/week are one click away for finer
 * trend-spotting.
 *
 * Grouping/summing happens client-side over already-fetched `payment.amount`
 * values — explicitly allowed by this project's money-math constraint
 * ("summing a page of payment rows for a subtotal display is fine"), unlike
 * recomputing installment/allocation math. Weeks are keyed by their Monday
 * (ISO week start), a deliberate, documented simplification rather than the
 * Egyptian Saturday-start week, to keep the grouping key unambiguous.
 */
export default function CollectionsReport() {
  const { profile } = useAuth();
  const [granularity, setGranularity] = useState<Granularity>("month");

  const { data: payments, isLoading } = useQuery({
    queryKey: ["report-collections", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment")
        .select("id, amount, method, received_at")
        .order("received_at", { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const buckets = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const p of payments ?? []) {
      const key = bucketKey(p.received_at, granularity);
      const entry = map.get(key) ?? { total: 0, count: 0 };
      entry.total += p.amount;
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, label: bucketLabel(key, granularity), ...v }))
      .sort((a, b) => (a.key < b.key ? 1 : -1)); // most recent period first
  }, [payments, granularity]);

  const grandTotal = buckets.reduce((s, b) => s + b.total, 0);
  const grandCount = buckets.reduce((s, b) => s + b.count, 0);

  function handleExport() {
    const rows = buckets.map((b) => [b.label, b.count, b.total]);
    const csv = toCsv(["الفترة", "عدد الدفعات", "الإجمالي"], rows);
    downloadCsv(
      `تقرير-التحصيل-${granularity}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/reports" className="text-sm text-amber hover:underline">
            → التقارير
          </Link>
          <h1 className="mt-1 text-xl font-bold text-white">تقرير التحصيل حسب الفترة</h1>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isLoading || buckets.length === 0}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          تصدير CSV
        </button>
      </div>

      <div className="flex items-center gap-2">
        {(["day", "week", "month"] as Granularity[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGranularity(g)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              granularity === g
                ? "bg-teal text-white"
                : "border border-white/15 text-slate-300 hover:bg-white/5"
            }`}
          >
            {GRANULARITY_LABEL[g]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted">جارِ التحميل...</p>
      ) : buckets.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
          لا توجد دفعات مسجّلة بعد.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-start text-xs text-muted">
                <th className="px-3 py-2 text-start font-medium">الفترة</th>
                <th className="px-3 py-2 text-start font-medium">عدد الدفعات</th>
                <th className="px-3 py-2 text-start font-medium">الإجمالي المحصّل</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-3 py-2 text-white">{b.label}</td>
                  <td className="px-3 py-2 font-mono text-slate-300 tabular-nums">{b.count}</td>
                  <td className="px-3 py-2 font-mono text-success tabular-nums">{egp(b.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 font-semibold">
                <td className="px-3 py-2 text-slate-300">الإجمالي الكلي</td>
                <td className="px-3 py-2 font-mono text-slate-300 tabular-nums">{grandCount}</td>
                <td className="px-3 py-2 font-mono text-success tabular-nums">{egp(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
