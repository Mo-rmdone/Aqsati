import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp, arDate } from "../../lib/format";
import { BUCKET_LABEL, BUCKET_COLOR } from "../dashboard/AgingBars";
import RecordPaymentModal, { type PaymentTarget } from "../payments/RecordPaymentModal";

const ACTION_ROLES = new Set(["owner", "manager", "accountant", "collector"]);

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

interface PayingTarget extends PaymentTarget {
  key: string;
}

/**
 * Customer 360 — profile, contracts, آجل invoices, total outstanding, and a
 * payment timeline for one customer (Task 11 brief, step 3). Built
 * independently from CustomerPicker.tsx (Task 9's minimal wizard picker,
 * explicitly out of this task's scope) — this is the real, full-page view
 * it deliberately was not a preview of.
 *
 * "Total outstanding" is the sum of two DB-computed figures, not a client-
 * side recalculation of installment/allocation math: v_installment_aging
 * (Task 11's migration, mirrors v_aging's own `amount - amount_paid`
 * subtraction) for the contract side, v_aging (Task 7) for the آجل side.
 * Both already do the money subtraction in Postgres; this component only
 * sums the already-fetched per-row totals for display, same as
 * ScheduleTable's own `rows.reduce(...)` footer total.
 */
export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [payingTarget, setPayingTarget] = useState<PayingTarget | null>(null);

  const { data: customer, isLoading: customerLoading, error: customerError } = useQuery({
    queryKey: ["customer-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from("customer").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["customer-contracts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract")
        .select("id, product_desc, total_price, down_payment, num_installments, start_date, status")
        .eq("customer_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Per-installment outstanding + aging bucket, already computed in Postgres
  // (0010_installment_aging.sql) — grouped by contract client-side below,
  // which is a plain sum of already-fetched numbers, not a recomputation.
  const { data: installmentAging } = useQuery({
    queryKey: ["customer-installment-aging", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_installment_aging")
        .select("contract_id, outstanding, bucket")
        .eq("customer_id", id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoiceData, isLoading: invoicesLoading } = useQuery({
    queryKey: ["customer-invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: invoices, error: e1 }, { data: aging, error: e2 }] = await Promise.all([
        supabase
          .from("credit_invoice")
          .select("id, invoice_no, issue_date, due_date, amount, amount_paid, status")
          .eq("customer_id", id!)
          .order("due_date", { ascending: false }),
        supabase.from("v_aging").select("id, outstanding, bucket").eq("customer_id", id!),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { invoices: invoices ?? [], aging: aging ?? [] };
    },
  });

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ["customer-payments", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment")
        .select(
          "id, amount, method, received_at, receipt_no, contract_id, credit_invoice_id, payment_allocation(amount, installment(seq_no), credit_invoice(invoice_no))",
        )
        .eq("customer_id", id!)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const contractOutstanding = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of installmentAging ?? []) {
      if (!r.contract_id) continue;
      map.set(r.contract_id, (map.get(r.contract_id) ?? 0) + (r.outstanding ?? 0));
    }
    return map;
  }, [installmentAging]);

  const invoiceAging = useMemo(() => {
    const map = new Map<string, { outstanding: number; bucket: string }>();
    for (const r of invoiceData?.aging ?? []) {
      if (!r.id) continue;
      map.set(r.id, { outstanding: r.outstanding ?? 0, bucket: r.bucket ?? "current" });
    }
    return map;
  }, [invoiceData]);

  // Simple display-layer sums of already-DB-computed numbers (each row's
  // `outstanding` came straight from a view), matching this project's
  // "sum a page for a subtotal" allowance — not a recalculation of the
  // underlying payment/allocation math itself.
  const totalOutstanding = useMemo(() => {
    const contractsTotal = [...contractOutstanding.values()].reduce((s, v) => s + v, 0);
    const invoicesTotal = [...invoiceAging.values()].reduce((s, v) => s + v.outstanding, 0);
    return contractsTotal + invoicesTotal;
  }, [contractOutstanding, invoiceAging]);

  const canAct = profile ? ACTION_ROLES.has(profile.role) : false;

  if (customerLoading) {
    return <p className="text-sm text-muted">جارِ التحميل...</p>;
  }

  if (customerError || !customer) {
    return (
      <p className="text-sm text-danger">
        تعذر تحميل بيانات العميل: {(customerError as Error)?.message ?? "غير موجود"}
      </p>
    );
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <Link to="/customers" className="text-sm text-amber hover:underline">
          → العملاء
        </Link>
      </div>

      <div className="rounded-lg border border-white/10 bg-panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">{customer.name}</h1>
            <p className="mt-1 font-mono text-sm text-muted tabular-nums">{customer.phone}</p>
          </div>
          <div className="text-end">
            <span className="text-xs text-muted">إجمالي المستحق</span>
            <p className="font-mono text-2xl font-semibold text-amber tabular-nums">
              {egp(totalOutstanding)}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-muted">الرقم القومي</dt>
          <dd className="font-mono text-white tabular-nums">{customer.national_id ?? "—"}</dd>
          <dt className="text-muted">العنوان</dt>
          <dd className="text-white">{customer.address ?? "—"}</dd>
          <dt className="text-muted">الحالة</dt>
          <dd>
            {customer.blacklist_flag ? (
              <span className="text-danger">قائمة سوداء</span>
            ) : (
              <span className="text-success">عادي</span>
            )}
          </dd>
          <dt className="text-muted">تاريخ التسجيل</dt>
          <dd className="font-mono text-white tabular-nums">{arDate(customer.created_at)}</dd>
        </dl>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">العقود</h2>
        {contractsLoading ? (
          <p className="text-sm text-muted">جارِ التحميل...</p>
        ) : !contracts || contracts.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
            لا توجد عقود لهذا العميل.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-start text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">المنتج</th>
                  <th className="px-3 py-2 text-start font-medium">السعر الكلي</th>
                  <th className="px-3 py-2 text-start font-medium">المستحق</th>
                  <th className="px-3 py-2 text-start font-medium">الحالة</th>
                  {canAct && <th className="px-3 py-2 text-start font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const outstanding = contractOutstanding.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-3 py-2">
                        <Link to={`/contracts/${c.id}`} className="text-white hover:text-teal hover:underline">
                          {c.product_desc || "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-amber tabular-nums">
                        {egp(c.total_price)}
                      </td>
                      <td className="px-3 py-2 font-mono text-amber tabular-nums">
                        {egp(outstanding)}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                      </td>
                      {canAct && (
                        <td className="px-3 py-2">
                          {outstanding > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPayingTarget({
                                  key: `contract-${c.id}`,
                                  customerId: customer.id,
                                  customerName: customer.name,
                                  contractId: c.id,
                                  outstanding,
                                })
                              }
                              className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                            >
                              تحصيل
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">فواتير آجل</h2>
        {invoicesLoading ? (
          <p className="text-sm text-muted">جارِ التحميل...</p>
        ) : !invoiceData || invoiceData.invoices.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
            لا توجد فواتير آجل لهذا العميل.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-start text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">رقم الفاتورة</th>
                  <th className="px-3 py-2 text-start font-medium">تاريخ الاستحقاق</th>
                  <th className="px-3 py-2 text-start font-medium">المستحق</th>
                  <th className="px-3 py-2 text-start font-medium">الحالة</th>
                  {canAct && <th className="px-3 py-2 text-start font-medium">إجراءات</th>}
                </tr>
              </thead>
              <tbody>
                {invoiceData.invoices.map((inv) => {
                  const aging = invoiceAging.get(inv.id);
                  const outstanding = aging?.outstanding ?? 0;
                  return (
                    <tr key={inv.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-3 py-2 text-white">{inv.invoice_no ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-amber tabular-nums">
                        {arDate(inv.due_date)}
                      </td>
                      <td className="px-3 py-2 font-mono text-amber tabular-nums">
                        {egp(outstanding)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                          {aging && (
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${BUCKET_COLOR[aging.bucket as keyof typeof BUCKET_COLOR] ?? "bg-muted"}`}
                            />
                          )}
                          {INVOICE_STATUS_LABEL[inv.status] ?? inv.status}
                          {aging && aging.bucket !== "current" && (
                            <span className="text-muted">
                              ({BUCKET_LABEL[aging.bucket as keyof typeof BUCKET_LABEL]})
                            </span>
                          )}
                        </span>
                      </td>
                      {canAct && (
                        <td className="px-3 py-2">
                          {outstanding > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setPayingTarget({
                                  key: `invoice-${inv.id}`,
                                  customerId: customer.id,
                                  customerName: customer.name,
                                  creditInvoiceId: inv.id,
                                  outstanding,
                                })
                              }
                              className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                            >
                              تحصيل
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">سجل الدفعات</h2>
        {paymentsLoading ? (
          <p className="text-sm text-muted">جارِ التحميل...</p>
        ) : !payments || payments.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
            لا توجد دفعات مسجّلة لهذا العميل بعد.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/10 text-start text-xs text-muted">
                  <th className="px-3 py-2 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-start font-medium">المبلغ</th>
                  <th className="px-3 py-2 text-start font-medium">الطريقة</th>
                  <th className="px-3 py-2 text-start font-medium">عن</th>
                  <th className="px-3 py-2 text-start font-medium">السند</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const allocations = (p.payment_allocation ?? []) as {
                    amount: number;
                    installment: { seq_no: number } | null;
                    credit_invoice: { invoice_no: string | null } | null;
                  }[];
                  const about = allocations
                    .map((a) =>
                      a.installment
                        ? `قسط ${String(a.installment.seq_no).padStart(2, "0")}`
                        : a.credit_invoice
                          ? `فاتورة ${a.credit_invoice.invoice_no ?? ""}`
                          : null,
                    )
                    .filter(Boolean)
                    .join("، ");
                  return (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                      <td className="px-3 py-2 font-mono text-white tabular-nums">
                        {arDate(p.received_at)}
                      </td>
                      <td className="px-3 py-2 font-mono text-success tabular-nums">
                        {egp(p.amount)}
                      </td>
                      <td className="px-3 py-2 text-slate-300">
                        {METHOD_LABEL[p.method] ?? p.method}
                      </td>
                      <td className="px-3 py-2 text-slate-300">{about || "—"}</td>
                      <td className="px-3 py-2">
                        <Link
                          to={`/payments/${p.id}/receipt`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber hover:underline"
                        >
                          سند #{p.receipt_no ?? "—"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {payingTarget && (
        <RecordPaymentModal
          target={payingTarget}
          onClose={() => setPayingTarget(null)}
          onSuccess={() => setPayingTarget(null)}
        />
      )}
    </div>
  );
}
