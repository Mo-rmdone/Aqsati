import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth-context";
import { supabase } from "../../lib/supabase";
import { egp, arDate } from "../../lib/format";

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  instapay: "InstaPay",
  fawry: "فوري",
  wallet: "محفظة إلكترونية",
  card: "بطاقة",
  bank: "تحويل بنكي",
};

interface AllocationRow {
  amount: number;
  installment: { seq_no: number; due_date: string } | null;
  credit_invoice: { invoice_no: string | null } | null;
}

/**
 * سند قبض (payment receipt) — print-friendly, no PDF library (Task 11 brief
 * step 2: "@media print, no PDF library needed for MVP"). Mounted directly
 * under ProtectedRoute in App.tsx, *outside* AppLayout, so there is no app
 * header/nav to print in the first place; index.css additionally hides
 * `header`/`nav` under `@media print` as defense in depth for any future
 * route that does render this inside chrome. On-screen-only controls (back
 * link, print button) carry `print:hidden` so only the receipt itself ends
 * up on paper.
 *
 * Money/dates are display-only formatting of columns already computed by
 * the DB (payment.amount, payment_allocation.amount) — nothing here
 * recomputes a total.
 */
export default function Receipt() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();

  // Tenant business name for the receipt letterhead — same pattern
  // Dashboard.tsx uses for the wa.me reminder signature (Task 10, context
  // #6): fetched once by profile.tenant_id, cached indefinitely since a
  // tenant's own name essentially never changes mid-session.
  const { data: tenant } = useQuery({
    queryKey: ["tenant-name", profile?.tenant_id],
    enabled: !!profile?.tenant_id,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant")
        .select("name")
        .eq("id", profile!.tenant_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["payment-receipt", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment")
        .select(
          "*, customer(name, phone, national_id), contract(product_desc), credit_invoice(invoice_no), payment_allocation(amount, installment(seq_no, due_date), credit_invoice(invoice_no))",
        )
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <p className="p-6 text-sm text-muted">جارِ التحميل...</p>;
  }

  if (error || !data) {
    return (
      <p className="p-6 text-sm text-danger">
        تعذر تحميل السند: {(error as Error)?.message ?? "غير موجود"}
      </p>
    );
  }

  const customer = data.customer as {
    name: string;
    phone: string;
    national_id: string | null;
  } | null;
  const contract = data.contract as { product_desc: string | null } | null;
  const invoice = data.credit_invoice as { invoice_no: string | null } | null;
  const allocations = (data.payment_allocation ?? []) as AllocationRow[];

  return (
    <div className="min-h-svh bg-navy px-4 py-6 text-slate-200 sm:px-6 print:bg-white print:p-0 print:text-black">
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3 print:hidden">
        <Link to="/" className="text-sm text-amber hover:underline">
          → رجوع للوحة التحصيل
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          طباعة السند
        </button>
      </div>

      <div className="mx-auto mt-6 max-w-xl rounded-lg border border-white/10 bg-panel p-8 print:mt-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 print:border-black/20">
          <div>
            <h1 className="text-lg font-bold text-white print:text-black">
              {tenant?.name ?? "أقساطي"}
            </h1>
            <p className="text-sm text-muted print:text-black/60">سند قبض</p>
          </div>
          <div className="text-end">
            <p className="font-mono text-sm text-muted tabular-nums print:text-black/60">
              رقم السند: {data.receipt_no ?? "—"}
            </p>
            <p className="font-mono text-sm text-muted tabular-nums print:text-black/60">
              {arDate(data.received_at)}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted print:text-black/60">استلمنا من السيد/ة</dt>
          <dd className="text-white print:text-black">{customer?.name ?? "—"}</dd>

          {customer?.phone && (
            <>
              <dt className="text-muted print:text-black/60">رقم الهاتف</dt>
              <dd className="font-mono text-white tabular-nums print:text-black">
                {customer.phone}
              </dd>
            </>
          )}

          <dt className="text-muted print:text-black/60">مبلغًا وقدره</dt>
          <dd className="font-mono text-lg font-semibold text-amber tabular-nums print:text-black">
            {egp(data.amount)}
          </dd>

          <dt className="text-muted print:text-black/60">طريقة الدفع</dt>
          <dd className="text-white print:text-black">
            {METHOD_LABEL[data.method] ?? data.method}
          </dd>

          {contract?.product_desc && (
            <>
              <dt className="text-muted print:text-black/60">عن عقد</dt>
              <dd className="text-white print:text-black">{contract.product_desc}</dd>
            </>
          )}

          {invoice && (
            <>
              <dt className="text-muted print:text-black/60">فاتورة آجل</dt>
              <dd className="text-white print:text-black">{invoice.invoice_no ?? "—"}</dd>
            </>
          )}
        </dl>

        {allocations.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold text-muted print:text-black/60">
              تفاصيل التخصيص
            </h2>
            <table className="mt-2 w-full border-collapse text-sm">
              <tbody>
                {allocations.map((a, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-white/5 last:border-0 print:border-black/10"
                  >
                    <td className="py-1 text-slate-300 print:text-black">
                      {a.installment
                        ? `قسط رقم ${String(a.installment.seq_no).padStart(2, "0")} — استحقاق ${arDate(a.installment.due_date)}`
                        : a.credit_invoice
                          ? `فاتورة آجل ${a.credit_invoice.invoice_no ?? ""}`
                          : "—"}
                    </td>
                    <td className="py-1 text-end font-mono text-amber tabular-nums print:text-black">
                      {egp(a.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-center text-xs text-muted print:text-black/50">
          سند إلكتروني تم إصداره تلقائيًا عبر أقساطي
        </p>
      </div>
    </div>
  );
}
