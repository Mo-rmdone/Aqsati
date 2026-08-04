import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { egp, arDate } from "../../lib/format";

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "نقدًا" },
  { value: "instapay", label: "InstaPay" },
  { value: "fawry", label: "فوري" },
  { value: "wallet", label: "محفظة إلكترونية" },
  { value: "card", label: "بطاقة" },
  { value: "bank", label: "تحويل بنكي" },
];

/** What's being paid off: either a contract (installment waterfall) or a
 * credit_invoice (آجل running balance) — record_payment()'s own branching
 * (0007_credit_invoices.sql). Exactly one of contractId/creditInvoiceId
 * should be set; the caller (worklist row, customer-360 contract/invoice
 * row, contract detail) knows which. */
export interface PaymentTarget {
  customerId: string;
  customerName: string;
  contractId?: string | null;
  creditInvoiceId?: string | null;
  /** For display only ("قسط بتاريخ..."), not sent to the RPC. */
  dueDate?: string | null;
  /** Prefills the amount field with the target's outstanding balance. */
  outstanding: number;
}

/**
 * The real "تحصيل" (collect payment) modal — the Task 11 consolidation of
 * Task 10's stopgap `features/dashboard/RecordPaymentModal.tsx` (that one's
 * own comment called it temporary, built only to unblock the worklist before
 * a real payments feature existed). Same core behavior — calls
 * `record_payment()` (Task 7, SECURITY DEFINER, does its own role check and
 * all money math server-side), amount defaults to the target's outstanding
 * balance — generalized from "a worklist row" to any `PaymentTarget` so it
 * can be reused from the worklist, contract detail, and customer 360 alike,
 * and now invalidates every screen's cache on success instead of leaving
 * that to each caller individually.
 */
export default function RecordPaymentModal({
  target,
  onClose,
  onSuccess,
}: {
  target: PaymentTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(target.outstanding > 0 ? target.outstanding : 0);
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(amount > 0)) {
      setError("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    if (!target.contractId && !target.creditInvoiceId) {
      setError("لا يوجد عقد أو فاتورة آجل مرتبطة بهذا التحصيل");
      return;
    }

    setSubmitting(true);
    // record_payment's SQL signature accepts null p_contract/p_credit_invoice
    // (it branches on whichever is not null — see 0007_credit_invoices.sql)
    // but Supabase's generated Args type maps every `uuid` parameter to plain
    // `string`, since Postgres function parameters carry no NOT NULL/
    // nullability metadata for the codegen to reflect. The casts document
    // that gap rather than papering over a real type error.
    const { data, error: rpcError } = await supabase.rpc("record_payment", {
      p_contract: target.contractId ?? (null as unknown as string),
      p_credit_invoice: target.creditInvoiceId ?? (null as unknown as string),
      p_customer: target.customerId,
      p_amount: amount,
      p_method: method,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    // Invalidate every screen that can show a "who owes what" / "how much
    // have we collected" figure, so tiles/lists update immediately rather
    // than requiring a manual refresh (Task 11 brief, step 1). Query keys
    // match the *producing* screens exactly: Dashboard.tsx uses
    // ["collections-kpi", tenantId] / ["aging", tenantId] / ["worklist",
    // tenantId], ContractDetail.tsx uses ["contract", id] — invalidateQueries
    // partial-matches by prefix (exact:false is the default), so the bare
    // ["worklist"] key here also catches Dashboard's tenant-scoped variant.
    void queryClient.invalidateQueries({ queryKey: ["worklist"] });
    void queryClient.invalidateQueries({ queryKey: ["collections-kpi"] });
    void queryClient.invalidateQueries({ queryKey: ["aging"] });
    if (target.contractId) {
      void queryClient.invalidateQueries({ queryKey: ["contract", target.contractId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["customer-detail", target.customerId] });
    void queryClient.invalidateQueries({ queryKey: ["customer-payments", target.customerId] });
    void queryClient.invalidateQueries({ queryKey: ["report-aging"] });
    void queryClient.invalidateQueries({ queryKey: ["report-collections"] });
    void queryClient.invalidateQueries({ queryKey: ["report-statement"] });

    setReceiptId(data);
  }

  if (receiptId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/15">
            <span className="text-2xl text-success">✓</span>
          </div>
          <h2 className="mt-3 text-lg font-bold text-white">تم تحصيل الدفعة بنجاح</h2>
          <p className="mt-1 font-mono text-amber tabular-nums">{egp(amount)}</p>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              to={`/payments/${receiptId}/receipt`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-teal px-4 py-2 text-sm font-semibold text-teal hover:bg-teal/10"
            >
              عرض سند القبض
            </Link>
            <button
              type="button"
              onClick={onSuccess}
              className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              تم
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-6">
        <h2 className="text-lg font-bold text-white">تحصيل دفعة</h2>
        <p className="mt-1 text-sm text-muted">
          {target.customerName}
          {target.dueDate && <> — قسط بتاريخ {arDate(target.dueDate)}</>}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            المبلغ المحصّل (ج.م)
            <input
              type="number"
              step="0.01"
              min={0.01}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            طريقة الدفع
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            >
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <p className="text-xs text-muted">
            المبلغ المستحق: {egp(target.outstanding)}
          </p>

          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "جارِ التسجيل..." : "تأكيد التحصيل"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
