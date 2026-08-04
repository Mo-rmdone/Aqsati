import { egp, arDate } from "../../lib/format";

export interface ScheduleRow {
  seq_no: number;
  due_date: string;
  amount_due: number;
  /** Only present once installments actually exist in the DB (contract detail
   * view). The live wizard preview (build_schedule output) has no status yet
   * — nothing has been persisted, so every row is implicitly "upcoming". */
  status?: string;
  amount_paid?: number;
}

// Exported so other collections-status UI (the worklist, Task 10) can reuse
// the exact same status vocabulary/colors rather than inventing a second one
// — an installment's `status` column has one fixed set of values regardless
// of which screen is showing it.
export const STATUS_LABEL: Record<string, string> = {
  paid: "مدفوع",
  partial: "جزئي",
  due: "مستحق",
  pending: "بالانتظار",
  overdue: "متأخر",
  waived: "معفى",
};

export const STATUS_DOT: Record<string, string> = {
  paid: "bg-success",
  partial: "bg-amber",
  due: "bg-amber",
  pending: "bg-muted",
  overdue: "bg-danger",
  waived: "bg-muted",
};

/**
 * The "digital departure board" schedule table — same visual language for
 * both the wizard's live preview (Task 9) and, later, the contract detail
 * view: numbered rows, tabular/mono digits for money + dates, status shown
 * as a colored dot + label when known.
 */
export default function ScheduleTable({ rows }: { rows: ScheduleRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.amount_due, 0);
  const showStatus = rows.some((r) => r.status);

  return (
    <div className="overflow-x-auto rounded-lg border border-white/10 bg-panel">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 text-start text-xs text-muted">
            <th className="px-3 py-2 text-start font-medium">#</th>
            <th className="px-3 py-2 text-start font-medium">تاريخ الاستحقاق</th>
            <th className="px-3 py-2 text-start font-medium">مبلغ القسط (ج.م)</th>
            {showStatus && (
              <th className="px-3 py-2 text-start font-medium">الحالة</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.seq_no}
              className="border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <td className="px-3 py-2 font-mono text-slate-300 tabular-nums">
                {String(r.seq_no).padStart(2, "0")}
              </td>
              <td className="px-3 py-2 font-mono text-amber tabular-nums">
                {arDate(r.due_date)}
              </td>
              <td className="px-3 py-2 font-mono text-amber tabular-nums">
                {egp(r.amount_due)}
              </td>
              {showStatus && (
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[r.status ?? "pending"] ?? "bg-muted"}`}
                    />
                    {STATUS_LABEL[r.status ?? "pending"] ?? r.status}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10 bg-white/5 font-semibold">
            <td
              className="px-3 py-2 text-slate-300"
              colSpan={showStatus ? 2 : 1}
            >
              إجمالي الأقساط
            </td>
            <td className="px-3 py-2 font-mono text-amber tabular-nums">
              {egp(total)}
            </td>
            {showStatus && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
