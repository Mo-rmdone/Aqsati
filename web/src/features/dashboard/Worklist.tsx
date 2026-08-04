import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp, arDate } from "../../lib/format";
import { reminderLink } from "../../lib/whatsapp";
import { STATUS_DOT, STATUS_LABEL } from "../contracts/ScheduleTable";
import RecordPaymentModal, { type PaymentTarget } from "../payments/RecordPaymentModal";
import type { Tables } from "../../lib/database.types";

export type WorklistRow = Tables<"v_worklist">;

// Who's allowed to act on a worklist row (send a reminder, record a
// payment) — mirrors record_payment()'s own role gate (0007_credit_invoices.sql)
// so a 'viewer' never sees an action that would just fail server-side, and
// matches message_log's own INSERT policy role check (0009_message_log.sql).
const ACTION_ROLES = new Set(["owner", "manager", "accountant", "collector"]);

/**
 * The "who to chase" worklist — `v_worklist` (Task 7), one row per
 * pending/partial/overdue installment due within 7 days or already late.
 * Reuses ScheduleTable's "digital departure board" visual language (mono/
 * tabular money+dates, colored status dot) since a worklist row is
 * structurally a schedule row plus a customer and two actions, rather than
 * inventing a second table style.
 */
export default function Worklist({
  rows,
  merchantName,
}: {
  rows: WorklistRow[];
  merchantName: string;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [payingRow, setPayingRow] = useState<WorklistRow | null>(null);

  const installmentIds = useMemo(
    () => rows.map((r) => r.installment_id).filter((id): id is string => !!id),
    [rows],
  );

  // "Last reminded" per installment (brief step 4) — one query for the whole
  // visible worklist, not one per row.
  const { data: lastReminded } = useQuery({
    queryKey: ["message-log-latest", installmentIds],
    enabled: installmentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("message_log")
        .select("installment_id, sent_at")
        .in("installment_id", installmentIds)
        .order("sent_at", { ascending: false });
      if (error) throw error;

      const latest = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.installment_id && !latest.has(row.installment_id)) {
          latest.set(row.installment_id, row.sent_at);
        }
      }
      return latest;
    },
  });

  async function handleRemind(row: WorklistRow) {
    if (
      !profile ||
      !row.phone ||
      !row.name ||
      row.amount == null ||
      !row.due_date ||
      !row.customer_id
    ) {
      return;
    }

    const link = reminderLink({
      phone: row.phone,
      name: row.name,
      amount: row.amount,
      dueDate: arDate(row.due_date),
      merchant: merchantName,
    });
    window.open(link, "_blank", "noopener,noreferrer");

    // Log the touch (brief step 4) so the "آخر تذكير" column and, later, a
    // collections-uplift report can see it. Best-effort: a failed log write
    // must never block the reminder itself, which has already been sent.
    const { error } = await supabase.from("message_log").insert({
      tenant_id: profile.tenant_id,
      customer_id: row.customer_id,
      contract_id: row.contract_id,
      installment_id: row.installment_id,
      channel: "whatsapp",
      sent_by: profile.id,
    });
    if (error) {
      console.error("Failed to log reminder touch", error);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: ["message-log-latest"] });
  }

  const canAct = profile ? ACTION_ROLES.has(profile.role) : false;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-panel p-6 text-sm text-muted">
        لا توجد أقساط مستحقة أو متأخرة الآن — كل شيء تحت السيطرة.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-white/10 text-start text-xs text-muted">
              <th className="px-3 py-2 text-start font-medium">العميل</th>
              <th className="px-3 py-2 text-start font-medium">تاريخ الاستحقاق</th>
              <th className="px-3 py-2 text-start font-medium">المبلغ (ج.م)</th>
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
              <th className="px-3 py-2 text-start font-medium">آخر تذكير</th>
              {canAct && <th className="px-3 py-2 text-start font-medium">إجراءات</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const reminded = r.installment_id
                ? lastReminded?.get(r.installment_id)
                : undefined;
              return (
                <tr
                  key={String(r.installment_id)}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5"
                >
                  <td className="px-3 py-2 text-white">
                    {r.name}
                    <span className="ms-2 font-mono text-xs text-muted tabular-nums">
                      {r.phone}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-amber tabular-nums">
                    {r.due_date ? arDate(r.due_date) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-amber tabular-nums">
                    {egp(r.amount ?? 0)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[r.status ?? "pending"] ?? "bg-muted"}`}
                      />
                      {STATUS_LABEL[r.status ?? "pending"] ?? r.status}
                      {(r.days_late ?? 0) > 0 && (
                        <span className="font-mono text-danger tabular-nums">
                          ({r.days_late} يوم)
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted tabular-nums">
                    {reminded ? arDate(reminded) : "—"}
                  </td>
                  {canAct && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRemind(r)}
                          className="rounded-md border border-teal px-2.5 py-1 text-xs font-semibold text-teal hover:bg-teal/10"
                        >
                          واتساب
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayingRow(r)}
                          className="rounded-md bg-teal px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90"
                        >
                          تحصيل
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {payingRow && payingRow.customer_id && (
        <RecordPaymentModal
          target={
            {
              customerId: payingRow.customer_id,
              customerName: payingRow.name ?? "",
              contractId: payingRow.contract_id,
              dueDate: payingRow.due_date,
              outstanding: payingRow.amount ?? 0,
            } satisfies PaymentTarget
          }
          onClose={() => setPayingRow(null)}
          onSuccess={() => setPayingRow(null)}
        />
      )}
    </>
  );
}
