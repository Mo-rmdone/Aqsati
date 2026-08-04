import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp, arDate } from "../../lib/format";
import { toCsv, downloadCsv } from "../../lib/csv";
import AgingBars, { BUCKET_LABEL, BUCKET_COLOR } from "../dashboard/AgingBars";

/**
 * Aging report — reconciling installment (contract) aging with آجل
 * (credit_invoice) aging, which the brief flags as needing an explicit
 * decision: `v_aging` (Task 7) only ever covered آجل; there was no
 * installment-level equivalent, and `v_worklist`/`v_collections_kpi` only
 * surface a 7-day/overdue slice, not full aging buckets for every unpaid
 * installment regardless of due date.
 *
 * Decision taken: two clearly-separated sections (أقساط العقود / فواتير آجل)
 * rather than one merged table. They are two structurally different debt
 * types (a waterfall of scheduled installments vs. a single running
 * balance) with different natural keys (installment vs. invoice), and
 * merging them into one table would either lose that distinction or need a
 * synthetic "type" pretending they're the same shape. Each section reuses
 * the exact same AgingBars chart + bucket vocabulary (Task 10) so the two
 * halves still read as one coherent report, and the CSV export unions both
 * under a "النوع" column for anyone who does want one flat sheet.
 *
 * v_installment_aging (Task 11's migration, mirrors v_aging) already does
 * the amount_due - amount_paid subtraction and bucket classification in
 * Postgres — this component only groups/sorts/sums already-computed rows.
 */
export default function AgingReport() {
  const { profile } = useAuth();

  const { data: installmentRows, isLoading: installmentsLoading } = useQuery({
    queryKey: ["report-aging", "installment", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_installment_aging")
        .select("contract_id, customer_id, due_date, outstanding, bucket")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoiceRows, isLoading: invoicesLoading } = useQuery({
    queryKey: ["report-aging", "invoice", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_aging")
        .select("id, customer_id, due_date, outstanding, bucket")
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const customerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of installmentRows ?? []) if (r.customer_id) ids.add(r.customer_id);
    for (const r of invoiceRows ?? []) if (r.customer_id) ids.add(r.customer_id);
    return Array.from(ids);
  }, [installmentRows, invoiceRows]);

  // Batch customer-name lookup — same pattern as Worklist.tsx's message_log
  // join (one query for every row on screen, not one per row).
  const { data: customerNames } = useQuery({
    queryKey: ["report-aging-customers", customerIds],
    enabled: customerIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer")
        .select("id, name")
        .in("id", customerIds);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const c of data ?? []) map.set(c.id, c.name);
      return map;
    },
  });

  const nameFor = (id: string | null) => (id && customerNames?.get(id)) || "—";

  function handleExport() {
    const rows: (string | number)[][] = [];
    for (const r of installmentRows ?? []) {
      rows.push([
        "قسط",
        nameFor(r.customer_id),
        r.due_date ?? "",
        BUCKET_LABEL[(r.bucket ?? "current") as keyof typeof BUCKET_LABEL] ?? r.bucket ?? "",
        r.outstanding ?? 0,
      ]);
    }
    for (const r of invoiceRows ?? []) {
      rows.push([
        "فاتورة آجل",
        nameFor(r.customer_id),
        r.due_date ?? "",
        BUCKET_LABEL[(r.bucket ?? "current") as keyof typeof BUCKET_LABEL] ?? r.bucket ?? "",
        r.outstanding ?? 0,
      ]);
    }
    const csv = toCsv(["النوع", "العميل", "تاريخ الاستحقاق", "الفئة", "المستحق"], rows);
    downloadCsv(`تقرير-اعمار-الديون-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const isLoading = installmentsLoading || invoicesLoading;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/reports" className="text-sm text-amber hover:underline">
            → التقارير
          </Link>
          <h1 className="mt-1 text-xl font-bold text-white">تقرير أعمار الديون</h1>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={isLoading}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          تصدير CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AgingBars
          rows={(installmentRows ?? []).map((r) => ({
            bucket: r.bucket ?? "current",
            outstanding: r.outstanding ?? 0,
          }))}
          title="أعمار أقساط العقود"
          emptyLabel="لا توجد أقساط مستحقة أو متأخرة حاليًا."
        />
        <AgingBars
          rows={(invoiceRows ?? []).map((r) => ({
            bucket: r.bucket ?? "current",
            outstanding: r.outstanding ?? 0,
          }))}
        />
      </div>

      <AgingTable
        title="تفاصيل أقساط العقود"
        loading={installmentsLoading}
        rows={(installmentRows ?? []).map((r) => ({
          key: `${r.contract_id}-${r.due_date}`,
          customer: nameFor(r.customer_id),
          dueDate: r.due_date,
          bucket: r.bucket ?? "current",
          outstanding: r.outstanding ?? 0,
        }))}
      />

      <AgingTable
        title="تفاصيل فواتير آجل"
        loading={invoicesLoading}
        rows={(invoiceRows ?? []).map((r) => ({
          key: r.id ?? "",
          customer: nameFor(r.customer_id),
          dueDate: r.due_date,
          bucket: r.bucket ?? "current",
          outstanding: r.outstanding ?? 0,
        }))}
      />
    </div>
  );
}

function AgingTable({
  title,
  loading,
  rows,
}: {
  title: string;
  loading: boolean;
  rows: { key: string; customer: string; dueDate: string | null; bucket: string; outstanding: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted">{title}</h2>
      {loading ? (
        <p className="text-sm text-muted">جارِ التحميل...</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
          لا توجد بيانات.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-start text-xs text-muted">
                <th className="px-3 py-2 text-start font-medium">العميل</th>
                <th className="px-3 py-2 text-start font-medium">تاريخ الاستحقاق</th>
                <th className="px-3 py-2 text-start font-medium">الفئة</th>
                <th className="px-3 py-2 text-start font-medium">المستحق</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-3 py-2 text-white">{r.customer}</td>
                  <td className="px-3 py-2 font-mono text-slate-300 tabular-nums">
                    {r.dueDate ? arDate(r.dueDate) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${BUCKET_COLOR[r.bucket as keyof typeof BUCKET_COLOR] ?? "bg-muted"}`}
                      />
                      {BUCKET_LABEL[r.bucket as keyof typeof BUCKET_LABEL] ?? r.bucket}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-amber tabular-nums">
                    {egp(r.outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-white/10 bg-white/5 font-semibold">
                <td className="px-3 py-2 text-slate-300" colSpan={3}>
                  الإجمالي
                </td>
                <td className="px-3 py-2 font-mono text-amber tabular-nums">{egp(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
