import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { egp, arDate } from "../../lib/format";
import { toCsv, downloadCsv } from "../../lib/csv";

interface PickedCustomer {
  id: string;
  name: string;
  phone: string;
}

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  active: "نشط",
  completed: "مكتمل",
  defaulted: "متعثر",
  void: "ملغي",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  open: "مفتوحة",
  partial: "مدفوعة جزئيًا",
  paid: "مسدّدة",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  instapay: "InstaPay",
  fawry: "فوري",
  wallet: "محفظة إلكترونية",
  card: "بطاقة",
  bank: "تحويل بنكي",
};

/** Strips characters that are unsafe in a downloaded filename across
 * platforms (Windows in particular). Arabic text itself is left alone. */
function safeFilenamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "").trim();
}

/**
 * كشف حساب (customer statement) — a single customer's full contract/آجل/
 * payment history in one exportable report (Task 11 brief step 4). This is
 * effectively Customer 360's data reshaped for one-customer, export-first
 * presentation: the search-and-pick step below is a compact, standalone
 * re-implementation (not a reuse of CustomerPicker.tsx, which Task 9's own
 * comment scopes to the contract wizard only) for the same reason
 * CustomerList.tsx has its own — a report page has different surrounding
 * chrome (a picker + an export button) than a wizard step.
 *
 * Query keys are namespaced ["report-statement", ...] so a payment recorded
 * elsewhere (RecordPaymentModal.tsx) invalidates this report's cache too,
 * per the brief's cache-invalidation requirement.
 */
export default function CustomerStatement() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickedCustomer | null>(null);

  const { data: results, isFetching } = useQuery({
    queryKey: ["report-statement-search", search],
    enabled: !selected && search.trim().length > 0,
    queryFn: async () => {
      const pattern = `%${search.trim().slice(0, 100)}%`;
      const [byName, byPhone] = await Promise.all([
        supabase.from("customer").select("id, name, phone").ilike("name", pattern).limit(8),
        supabase.from("customer").select("id, name, phone").ilike("phone", pattern).limit(8),
      ]);
      if (byName.error) throw byName.error;
      if (byPhone.error) throw byPhone.error;
      const merged = new Map<string, PickedCustomer>();
      for (const c of [...byName.data, ...byPhone.data]) {
        merged.set(c.id, c as PickedCustomer);
      }
      return Array.from(merged.values());
    },
  });

  const { data: customer } = useQuery({
    queryKey: ["report-statement", "customer", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer")
        .select("*")
        .eq("id", selected!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["report-statement", "contracts", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract")
        .select("id, product_desc, total_price, status, start_date")
        .eq("customer_id", selected!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: instAging } = useQuery({
    queryKey: ["report-statement", "installment-aging", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_installment_aging")
        .select("contract_id, outstanding")
        .eq("customer_id", selected!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["report-statement", "invoices", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const [{ data: invoices, error: e1 }, { data: aging, error: e2 }] = await Promise.all([
        supabase
          .from("credit_invoice")
          .select("id, invoice_no, due_date, amount, status")
          .eq("customer_id", selected!.id)
          .order("due_date", { ascending: false }),
        supabase.from("v_aging").select("id, outstanding").eq("customer_id", selected!.id),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { invoices: invoices ?? [], aging: aging ?? [] };
    },
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["report-statement", "payments", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment")
        .select(
          "id, amount, method, received_at, receipt_no, payment_allocation(amount, installment(seq_no), credit_invoice(invoice_no))",
        )
        .eq("customer_id", selected!.id)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const contractOutstanding = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of instAging ?? []) {
      if (!r.contract_id) continue;
      map.set(r.contract_id, (map.get(r.contract_id) ?? 0) + (r.outstanding ?? 0));
    }
    return map;
  }, [instAging]);

  const invoiceOutstanding = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of invoiceData?.aging ?? []) {
      if (!r.id) continue;
      map.set(r.id, r.outstanding ?? 0);
    }
    return map;
  }, [invoiceData]);

  // Display-layer sums of already-DB-computed per-row figures (same
  // reasoning as CustomerDetail.tsx's total-outstanding calculation), plus a
  // plain sum of already-fetched payment.amount values for total collected.
  const totalOutstanding = useMemo(() => {
    const c = [...contractOutstanding.values()].reduce((s, v) => s + v, 0);
    const i = [...invoiceOutstanding.values()].reduce((s, v) => s + v, 0);
    return c + i;
  }, [contractOutstanding, invoiceOutstanding]);

  const totalPaid = useMemo(
    () => (payments ?? []).reduce((s, p) => s + p.amount, 0),
    [payments],
  );

  function handleExport() {
    if (!customer) return;
    const rows: (string | number)[][] = [];

    for (const c of contracts ?? []) {
      rows.push([
        "عقد",
        c.product_desc || "—",
        arDate(c.start_date),
        c.total_price,
        CONTRACT_STATUS_LABEL[c.status] ?? c.status,
      ]);
    }
    for (const inv of invoiceData?.invoices ?? []) {
      rows.push([
        "فاتورة آجل",
        inv.invoice_no || "—",
        arDate(inv.due_date),
        inv.amount,
        INVOICE_STATUS_LABEL[inv.status] ?? inv.status,
      ]);
    }
    for (const p of payments ?? []) {
      rows.push([
        "دفعة محصّلة",
        `سند #${p.receipt_no ?? "—"}`,
        arDate(p.received_at),
        p.amount,
        METHOD_LABEL[p.method] ?? p.method,
      ]);
    }
    rows.push(["—", "—", "—", "—", "—"]);
    rows.push(["إجمالي المحصّل", "", "", totalPaid, ""]);
    rows.push(["إجمالي المستحق حاليًا", "", "", totalOutstanding, ""]);

    const csv = toCsv(["النوع", "الوصف", "التاريخ", "المبلغ", "الحالة"], rows);
    downloadCsv(
      `كشف-حساب-${safeFilenamePart(customer.name)}-${new Date().toISOString().slice(0, 10)}.csv`,
      csv,
    );
  }

  const loading = contractsLoading || invoicesLoading || paymentsLoading;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link to="/reports" className="text-sm text-amber hover:underline">
          → التقارير
        </Link>
        <h1 className="mt-1 text-xl font-bold text-white">كشف حساب عميل</h1>
      </div>

      {!selected ? (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            autoFocus
            placeholder="ابحث بالاسم أو رقم الهاتف..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
          />
          {search.trim() && (
            <div className="rounded-md border border-white/10 bg-panel">
              {isFetching && <div className="px-3 py-2 text-sm text-muted">جارِ البحث...</div>}
              {!isFetching && results?.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted">لا يوجد عملاء مطابقون</div>
              )}
              <ul>
                {results?.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className="flex w-full flex-col items-start px-3 py-2 text-start hover:bg-white/5"
                    >
                      <span className="text-white">{c.name}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-white/10 bg-panel p-4">
            <div>
              <p className="font-semibold text-white">{selected.name}</p>
              <p className="font-mono text-sm text-muted tabular-nums">{selected.phone}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setSearch("");
                }}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
              >
                تغيير العميل
              </button>
              <button
                type="button"
                onClick={handleExport}
                disabled={loading}
                className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                تصدير CSV
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/10 bg-panel p-4">
              <span className="text-xs text-muted">إجمالي المحصّل</span>
              <p className="mt-1 font-mono text-xl font-semibold text-success tabular-nums">
                {egp(totalPaid)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-panel p-4">
              <span className="text-xs text-muted">إجمالي المستحق حاليًا</span>
              <p className="mt-1 font-mono text-xl font-semibold text-amber tabular-nums">
                {egp(totalOutstanding)}
              </p>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">العقود</h2>
            <SimpleTable
              headers={["المنتج", "تاريخ البداية", "السعر الكلي", "المستحق", "الحالة"]}
              rows={(contracts ?? []).map((c) => [
                c.product_desc || "—",
                arDate(c.start_date),
                egp(c.total_price),
                egp(contractOutstanding.get(c.id) ?? 0),
                CONTRACT_STATUS_LABEL[c.status] ?? c.status,
              ])}
              empty="لا توجد عقود."
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">فواتير آجل</h2>
            <SimpleTable
              headers={["رقم الفاتورة", "تاريخ الاستحقاق", "المبلغ", "المستحق", "الحالة"]}
              rows={(invoiceData?.invoices ?? []).map((inv) => [
                inv.invoice_no || "—",
                arDate(inv.due_date),
                egp(inv.amount),
                egp(invoiceOutstanding.get(inv.id) ?? 0),
                INVOICE_STATUS_LABEL[inv.status] ?? inv.status,
              ])}
              empty="لا توجد فواتير آجل."
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted">سجل الدفعات</h2>
            <SimpleTable
              headers={["التاريخ", "المبلغ", "الطريقة", "السند"]}
              rows={(payments ?? []).map((p) => [
                arDate(p.received_at),
                egp(p.amount),
                METHOD_LABEL[p.method] ?? p.method,
                `#${p.receipt_no ?? "—"}`,
              ])}
              empty="لا توجد دفعات مسجّلة."
            />
          </section>
        </>
      )}
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number)[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-start text-xs text-muted">
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-start font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 py-2 ${j === 0 ? "text-white" : "font-mono text-slate-300 tabular-nums"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
