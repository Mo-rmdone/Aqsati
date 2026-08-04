import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp } from "../../lib/format";
import CustomerPicker, { type PickedCustomer } from "./CustomerPicker";
import ScheduleTable from "./ScheduleTable";

// Task 9 brief's terms schema (same field set, constraints, and refine
// message). Numeric fields use z.number() rather than the brief's
// z.coerce.number(): every numeric input in this form is already converted
// to a real number before it reaches RHF (native inputs via
// `valueAsNumber: true`, the percent field via a Controller transform), so
// coercion is unnecessary here — and z.coerce's input type is `unknown`,
// which breaks zodResolver's TFieldValues inference against RHF's typed
// `watch()`/arithmetic used for the live financed-amount readout below.
// Validation rules and error behavior are otherwise identical.
export const termsSchema = z
  .object({
    customer_id: z.string().uuid({ message: "اختر العميل أولاً" }),
    total_price: z
      .number()
      .positive({ message: "السعر الكلي يجب أن يكون أكبر من صفر" }),
    down_payment: z
      .number()
      .min(0, { message: "الدفعة المقدمة لا يمكن أن تكون بالسالب" }),
    interest_rate: z
      .number()
      .min(0, { message: "نسبة الفائدة لا يمكن أن تكون بالسالب" })
      .max(1, { message: "نسبة الفائدة يجب أن تكون بين 0% و100%" }),
    interest_method: z.enum(["flat", "reducing", "zero"]),
    num_installments: z
      .number()
      .int()
      .min(1, { message: "عدد الأقساط يجب أن يكون قسط واحد على الأقل" })
      .max(120, { message: "عدد الأقساط لا يمكن أن يتجاوز 120" }),
    start_date: z.string().min(1, { message: "اختر تاريخ بداية السداد" }),
  })
  .refine((v) => v.down_payment < v.total_price, {
    message: "الدفعة المقدمة لازم تكون أقل من السعر الكلي",
    path: ["down_payment"],
  });

export type TermsForm = z.infer<typeof termsSchema>;

interface ScheduleRpcRow {
  seq_no: number;
  due_date: string;
  amount_due: number;
}

// The 5 steps mirror the approved wireframe (comp-3-stepper-reveal.png)
// exactly: numbering, checkmarks, active-step underline, and RTL right-to-
// left step order (native flex-row under dir="rtl" — no row-reverse needed).
// What each step *collects* follows the comp's own labels: customer, then
// contract terms, then product/price, then the DB-generated preview, then a
// final review that actually submits.
const STEP_LABELS = [
  "بيانات العميل",
  "بيانات العقد",
  "بيانات المنتج",
  "جدول الأقساط",
  "مراجعة وتأكيد",
] as const;

const STEP_FIELDS: Record<number, (keyof TermsForm)[]> = {
  1: ["customer_id"],
  2: ["interest_rate", "interest_method", "num_installments", "start_date"],
  3: ["total_price", "down_payment"],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center">
      {STEP_LABELS.map((label, i) => {
        const stepNo = i + 1;
        const completed = stepNo < current;
        const active = stepNo === current;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 font-mono text-sm font-semibold tabular-nums " +
                  (completed
                    ? "border-teal bg-teal text-white"
                    : active
                      ? "border-teal text-teal"
                      : "border-white/20 text-muted")
                }
              >
                {completed ? "✓" : stepNo}
              </span>
              <span
                className={
                  "whitespace-nowrap border-b-2 pb-1 text-xs font-medium " +
                  (active
                    ? "border-teal text-white"
                    : completed
                      ? "border-transparent text-slate-300"
                      : "border-transparent text-muted")
                }
              >
                {label}
              </span>
            </div>
            {stepNo < STEP_LABELS.length && (
              <div
                className={
                  "mx-2 h-px flex-1 " + (completed ? "bg-teal" : "bg-white/10")
                }
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

const INTEREST_METHOD_OPTIONS: {
  value: TermsForm["interest_method"];
  label: string;
  disabled?: boolean;
}[] = [
  { value: "flat", label: "فائدة ثابتة (على كامل المبلغ)" },
  { value: "zero", label: "بدون فائدة" },
  // build_schedule (Task 4) only implements flat/zero today; the DB accepts
  // "reducing" but would silently compute it as flat, so it stays disabled
  // in the UI until that branch is added (see docs/05-implementation-plan.md
  // §8 self-review notes) rather than let the wizard show a misleading preview.
  { value: "reducing", label: "رصيد متناقص (قريبًا)", disabled: true },
];

export default function ContractWizard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<PickedCustomer | null>(
    null,
  );
  const [productDesc, setProductDesc] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<TermsForm>({
    resolver: zodResolver(termsSchema),
    mode: "onChange",
    defaultValues: {
      customer_id: "",
      total_price: 0,
      down_payment: 0,
      interest_rate: 0,
      interest_method: "flat",
      num_installments: 12,
      start_date: todayIso(),
    },
  });

  const terms = form.watch();
  const parsed = termsSchema.safeParse(terms);

  // Step 2 of the brief, essentially verbatim: the live preview is generated
  // by calling the exact same DB function (build_schedule) that
  // create_contract calls internally to persist the schedule. The frontend
  // never computes installment amounts itself.
  const {
    data: schedule,
    isFetching: scheduleLoading,
    error: scheduleError,
  } = useQuery({
    queryKey: [
      "schedule",
      terms.total_price,
      terms.down_payment,
      terms.interest_rate,
      terms.num_installments,
      terms.start_date,
      terms.interest_method,
    ],
    enabled: parsed.success,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("build_schedule", {
        p_financed: terms.total_price - terms.down_payment,
        p_annual_rate: terms.interest_rate,
        p_num: terms.num_installments,
        p_start: terms.start_date,
        p_method: terms.interest_method,
      });
      if (error) throw error;
      return data as ScheduleRpcRow[];
    },
  });

  async function goNext() {
    if (step === 1) {
      if (!selectedCustomer) {
        form.setError("customer_id", { message: "اختر العميل أولاً" });
        return;
      }
      setStep(2);
      return;
    }

    const fields = STEP_FIELDS[step];
    if (fields) {
      const ok = await form.trigger(fields);
      if (!ok) return;
    }
    setStep((s) => Math.min(s + 1, STEP_LABELS.length));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 1));
  }

  async function handleConfirm() {
    setSubmitError(null);
    if (!parsed.success) {
      setSubmitError("راجع بيانات العقد قبل التأكيد");
      return;
    }

    setSubmitting(true);
    // Step 3 of the brief: submit via create_contract, which internally
    // re-runs build_schedule and persists contract + installments in one
    // transaction — the preview above and the persisted schedule can never
    // diverge because both come from the same DB function.
    const { data: contractId, error } = await supabase.rpc("create_contract", {
      p: {
        customer_id: parsed.data.customer_id,
        product_desc: productDesc.trim() || null,
        total_price: parsed.data.total_price,
        down_payment: parsed.data.down_payment,
        interest_rate: parsed.data.interest_rate,
        interest_method: parsed.data.interest_method,
        num_installments: parsed.data.num_installments,
        start_date: parsed.data.start_date,
      },
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    navigate(`/contracts/${contractId}`, { replace: true });
  }

  const previewRows = (schedule ?? []).map((r) => ({
    seq_no: r.seq_no,
    due_date: r.due_date,
    amount_due: r.amount_due,
  }));

  // ProtectedRoute already blocks unauthenticated access, but the profile
  // row (tenant_id) can briefly be null right after sign-in while it loads —
  // the customer picker's inline "add customer" insert needs it, so guard
  // rather than let it insert with an empty tenant_id.
  if (!profile) {
    return <p className="text-sm text-muted">جارِ التحميل...</p>;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="rounded-lg border border-white/10 bg-panel p-4 sm:p-6">
        <Stepper current={step} />
      </div>

      <div className="rounded-lg border border-white/10 bg-panel p-6">
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-white">بيانات العميل</h2>
            <p className="text-sm text-muted">
              اختر عميلًا موجودًا أو أضف عميلًا جديدًا لإنشاء العقد له.
            </p>
            <CustomerPicker
              value={selectedCustomer}
              tenantId={profile.tenant_id}
              onChange={(c) => {
                setSelectedCustomer(c);
                form.setValue("customer_id", c?.id ?? "", {
                  shouldValidate: true,
                });
              }}
            />
            {form.formState.errors.customer_id && (
              <p className="text-sm text-danger">
                {form.formState.errors.customer_id.message}
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">بيانات العقد</h2>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              طريقة حساب الفائدة
              <select
                {...form.register("interest_method")}
                className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
              >
                {INTEREST_METHOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <Controller
              control={form.control}
              name="interest_rate"
              render={({ field }) => (
                <label className="flex flex-col gap-1 text-sm text-slate-300">
                  نسبة الفائدة (%)
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={
                      Number.isFinite(field.value)
                        ? Math.round(field.value * 10000) / 100
                        : 0
                    }
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === "" ? 0 : Number(e.target.value) / 100,
                      )
                    }
                    className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
                  />
                </label>
              )}
            />
            {form.formState.errors.interest_rate && (
              <p className="-mt-2 text-sm text-danger">
                {form.formState.errors.interest_rate.message}
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              عدد الأقساط
              <input
                type="number"
                min={1}
                max={120}
                step={1}
                {...form.register("num_installments", { valueAsNumber: true })}
                className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
              />
            </label>
            {form.formState.errors.num_installments && (
              <p className="-mt-2 text-sm text-danger">
                {form.formState.errors.num_installments.message}
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              تاريخ بداية السداد
              <input
                type="date"
                {...form.register("start_date")}
                className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
              />
            </label>
            {form.formState.errors.start_date && (
              <p className="-mt-2 text-sm text-danger">
                {form.formState.errors.start_date.message}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">بيانات المنتج</h2>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              وصف المنتج (اختياري)
              <input
                type="text"
                value={productDesc}
                onChange={(e) => setProductDesc(e.target.value)}
                placeholder="مثال: ثلاجة 18 قدم"
                className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              السعر الكلي (ج.م)
              <input
                type="number"
                step="0.01"
                min={0}
                {...form.register("total_price", { valueAsNumber: true })}
                className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
              />
            </label>
            {form.formState.errors.total_price && (
              <p className="-mt-2 text-sm text-danger">
                {form.formState.errors.total_price.message}
              </p>
            )}

            <label className="flex flex-col gap-1 text-sm text-slate-300">
              الدفعة المقدمة (ج.م)
              <input
                type="number"
                step="0.01"
                min={0}
                {...form.register("down_payment", { valueAsNumber: true })}
                className="rounded-md border border-white/15 bg-navy px-3 py-2 font-mono text-white tabular-nums outline-none focus:border-teal"
              />
            </label>
            {form.formState.errors.down_payment && (
              <p className="-mt-2 text-sm text-danger">
                {form.formState.errors.down_payment.message}
              </p>
            )}

            <div className="rounded-md bg-navy px-3 py-2 text-sm text-muted">
              المبلغ الممول (السعر الكلي - الدفعة المقدمة):{" "}
              <span className="font-mono text-amber tabular-nums">
                {egp(
                  Math.max(
                    (Number(terms.total_price) || 0) -
                      (Number(terms.down_payment) || 0),
                    0,
                  ),
                )}
              </span>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">مراجعة جدول الأقساط</h2>
              <p className="text-sm text-muted">
                هذا الجدول تم توليده مباشرة من قاعدة البيانات (نفس الدالة التي
                ستُستخدم لإنشاء العقد فعليًا).
              </p>
            </div>

            {!parsed.success && (
              <p className="text-sm text-danger">
                بيانات العقد غير مكتملة — راجع الخطوات السابقة.
              </p>
            )}
            {scheduleLoading && (
              <p className="text-sm text-muted">جارِ توليد الجدول...</p>
            )}
            {scheduleError && (
              <p className="text-sm text-danger">
                تعذر توليد الجدول: {(scheduleError as Error).message}
              </p>
            )}
            {parsed.success && !scheduleLoading && previewRows.length > 0 && (
              <ScheduleTable rows={previewRows} />
            )}
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold text-white">مراجعة وتأكيد</h2>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">العميل</dt>
              <dd className="text-white">
                {selectedCustomer?.name}{" "}
                <span className="font-mono text-muted tabular-nums">
                  ({selectedCustomer?.phone})
                </span>
              </dd>

              <dt className="text-muted">المنتج</dt>
              <dd className="text-white">{productDesc || "—"}</dd>

              <dt className="text-muted">السعر الكلي</dt>
              <dd className="font-mono text-amber tabular-nums">
                {egp(terms.total_price)}
              </dd>

              <dt className="text-muted">الدفعة المقدمة</dt>
              <dd className="font-mono text-amber tabular-nums">
                {egp(terms.down_payment)}
              </dd>

              <dt className="text-muted">طريقة الفائدة</dt>
              <dd className="text-white">
                {
                  INTEREST_METHOD_OPTIONS.find(
                    (o) => o.value === terms.interest_method,
                  )?.label
                }
              </dd>

              <dt className="text-muted">عدد الأقساط</dt>
              <dd className="font-mono text-white tabular-nums">
                {terms.num_installments}
              </dd>
            </dl>

            {parsed.success && !scheduleLoading && previewRows.length > 0 && (
              <ScheduleTable rows={previewRows} />
            )}

            {submitError && (
              <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 1}
          className="rounded-md border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-40"
        >
          رجوع
        </button>

        {step < STEP_LABELS.length ? (
          <button
            type="button"
            onClick={() => void goNext()}
            className="rounded-md bg-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            التالي
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            className="rounded-md bg-teal px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "جارِ الإنشاء..." : "تأكيد وإنشاء العقد"}
          </button>
        )}
      </div>
    </div>
  );
}
