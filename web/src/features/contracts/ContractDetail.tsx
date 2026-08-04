import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { egp, arDate } from "../../lib/format";
import ScheduleTable from "./ScheduleTable";

/**
 * Minimal contract detail page — exists only as the wizard's post-creation
 * navigation target (Task 9 brief, step 3). The real contract detail /
 * customer-360 view is out of this task's scope (not owned by any task
 * brief yet as of Task 9; dashboard is Task 10, payments/customers/reports
 * are Task 11) — this just proves the created contract + persisted
 * installments round-trip correctly and gives the merchant somewhere to land.
 */
export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["contract", id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: contract, error: cErr }, { data: installments, error: iErr }] =
        await Promise.all([
          supabase
            .from("contract")
            .select("*, customer(name, phone)")
            .eq("id", id!)
            .single(),
          supabase
            .from("installment")
            .select("seq_no, due_date, amount_due, amount_paid, status")
            .eq("contract_id", id!)
            .order("seq_no", { ascending: true }),
        ]);
      if (cErr) throw cErr;
      if (iErr) throw iErr;
      return { contract, installments: installments ?? [] };
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted">جارِ التحميل...</p>;
  }

  if (error || !data) {
    return (
      <p className="text-sm text-danger">
        تعذر تحميل بيانات العقد: {(error as Error)?.message ?? "غير موجود"}
      </p>
    );
  }

  const { contract, installments } = data;
  const customer = contract.customer as { name: string; phone: string } | null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="rounded-lg border border-white/10 bg-panel p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">تفاصيل العقد</h1>
          <Link to="/contracts/new" className="text-sm text-amber hover:underline">
            + عقد جديد
          </Link>
        </div>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">العميل</dt>
          <dd className="text-white">
            {customer?.name}{" "}
            <span className="font-mono text-muted tabular-nums">
              ({customer?.phone})
            </span>
          </dd>

          <dt className="text-muted">المنتج</dt>
          <dd className="text-white">{contract.product_desc || "—"}</dd>

          <dt className="text-muted">السعر الكلي</dt>
          <dd className="font-mono text-amber tabular-nums">
            {egp(contract.total_price)}
          </dd>

          <dt className="text-muted">الدفعة المقدمة</dt>
          <dd className="font-mono text-amber tabular-nums">
            {egp(contract.down_payment)}
          </dd>

          <dt className="text-muted">تاريخ البداية</dt>
          <dd className="font-mono text-white tabular-nums">
            {arDate(contract.start_date)}
          </dd>

          <dt className="text-muted">الحالة</dt>
          <dd className="text-white">{contract.status}</dd>
        </dl>
      </div>

      <ScheduleTable rows={installments} />
    </div>
  );
}
