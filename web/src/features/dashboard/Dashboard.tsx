import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { egp } from "../../lib/format";
import AgingBars from "./AgingBars";
import Worklist from "./Worklist";

type Tone = "amber" | "success" | "danger";

const TONE_CLASSES: Record<Tone, { dot: string; text: string }> = {
  amber: { dot: "bg-amber", text: "text-amber" },
  success: { dot: "bg-success", text: "text-success" },
  danger: { dot: "bg-danger", text: "text-danger" },
};

// Stat-tile contract (dataviz skill): label + value, state encoded in form
// (a colored status dot, per the brief's "green/amber/red chips" — never
// color alone) not just the number. No delta/sparkline: v_collections_kpi
// has no prior-period comparison to show one honestly.
function KpiTile({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  const c = TONE_CLASSES[tone];
  return (
    <div className="rounded-lg border border-white/10 bg-panel p-4 sm:p-5">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <span className={`inline-block h-2 w-2 rounded-full ${c.dot}`} />
        {label}
      </span>
      {/* Money stays font-mono/tabular-nums per Task 8's locked convention
          (index.css header comment) — a deliberate departure from the
          dataviz skill's generic "proportional figures for hero numbers"
          default, kept for consistency with every other money figure in
          the app (ScheduleTable, ContractWizard, ContractDetail). */}
      <p className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${c.text}`}>
        {egp(value)}
      </p>
    </div>
  );
}

/**
 * The collections dashboard — the daily-use surface of the whole product
 * (PRODUCT.md Product Principles: "summary before detail, the number
 * needing attention is visually loudest, every actionable row is one click
 * from action"). Three data sources, all RLS-scoped views from Task 7
 * queried directly (security_invoker=true means no manual tenant_id filter
 * is needed): v_collections_kpi (KPI tiles), v_aging (آجل aging buckets),
 * v_worklist (who to chase).
 */
export default function Dashboard() {
  const { profile } = useAuth();

  // Tenant business name for the wa.me reminder signature (`— ${merchant}`)
  // — fetched once here and passed down to Worklist as a prop, not re-fetched
  // per row. profile only carries tenant_id, so this is the one extra query
  // context #6 calls for.
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

  const { data: kpi, isLoading: kpiLoading } = useQuery({
    queryKey: ["collections-kpi", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_collections_kpi")
        .select("expected_this_week, collected_this_month, overdue_total")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: aging, isLoading: agingLoading } = useQuery({
    queryKey: ["aging", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_aging").select("bucket, outstanding");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        bucket: r.bucket ?? "current",
        outstanding: r.outstanding ?? 0,
      }));
    },
  });

  const { data: worklist, isLoading: worklistLoading } = useQuery({
    queryKey: ["worklist", profile?.tenant_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_worklist")
        .select("*")
        .order("days_late", { ascending: false, nullsFirst: false })
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!profile) {
    return <p className="text-sm text-muted">جارِ التحميل...</p>;
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">لوحة التحصيل</h1>
        <Link
          to="/contracts/new"
          className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + عقد جديد
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiTile
          label="مستحق هذا الأسبوع"
          value={kpiLoading ? 0 : (kpi?.expected_this_week ?? 0)}
          tone="amber"
        />
        <KpiTile
          label="محصّل هذا الشهر"
          value={kpiLoading ? 0 : (kpi?.collected_this_month ?? 0)}
          tone="success"
        />
        <KpiTile
          label="إجمالي المتأخرات"
          value={kpiLoading ? 0 : (kpi?.overdue_total ?? 0)}
          tone="danger"
        />
      </div>

      {!agingLoading && <AgingBars rows={aging ?? []} />}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted">قائمة المتابعة</h2>
        {worklistLoading ? (
          <p className="text-sm text-muted">جارِ التحميل...</p>
        ) : (
          <Worklist rows={worklist ?? []} merchantName={tenant?.name ?? "أقساطي"} />
        )}
      </div>
    </div>
  );
}
