import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { egp, arDate } from "../../lib/format";
import type { WorklistRow } from "./Worklist";

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "نقدًا" },
  { value: "instapay", label: "InstaPay" },
  { value: "fawry", label: "فوري" },
  { value: "wallet", label: "محفظة إلكترونية" },
  { value: "card", label: "بطاقة" },
  { value: "bank", label: "تحويل بنكي" },
];

/**
 * Minimal "تحصيل" (collect payment) modal wired into the worklist (Task 10
 * brief, step 3). There is no dedicated payments feature yet (that's a later
 * task's scope per ContractDetail.tsx's own note) — this exists only to give
 * each worklist row a one-click path to `record_payment()` (the RPC already
 * built and hardened in Task 7), not to be the full payments UI. Money math
 * stays entirely in the DB function; this form only collects amount/method
 * and displays whatever the RPC returns/errors.
 */
export default function RecordPaymentModal({
  row,
  onClose,
  onSuccess,
}: {
  row: WorklistRow;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(row.amount ?? 0);
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!(amount > 0)) {
      setError("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    if (!row.contract_id || !row.customer_id) {
      setError("بيانات القسط غير مكتملة");
      return;
    }

    setSubmitting(true);
    // record_payment's SQL signature accepts a null p_credit_invoice (it
    // branches on `if p_credit_invoice is not null` — see
    // 0007_credit_invoices.sql) but Supabase's generated Args type maps every
    // `uuid` parameter to plain `string`, since Postgres function parameters
    // carry no NOT NULL/nullability metadata for the codegen to reflect. The
    // cast documents that gap rather than papering over a real type error.
    const { error: rpcError } = await supabase.rpc("record_payment", {
      p_contract: row.contract_id,
      p_credit_invoice: null as unknown as string,
      p_customer: row.customer_id,
      p_amount: amount,
      p_method: method,
    });
    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-6">
        <h2 className="text-lg font-bold text-white">تحصيل دفعة</h2>
        <p className="mt-1 text-sm text-muted">
          {row.name} — قسط بتاريخ {row.due_date ? arDate(row.due_date) : "—"}
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
            المبلغ المستحق على هذا القسط: {egp(row.amount ?? 0)}
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
