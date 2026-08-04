import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { egp } from "../lib/format";

// Placeholder landing page for the authenticated app shell. The real
// collections dashboard (KPI tiles, aging buckets, worklist) is built in
// Task 10; this exists so Task 8 can prove the protected-route + profile
// loading flow end to end.
export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="rounded-lg border border-white/10 bg-panel p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">أهلاً بك في أقساطي</h1>
          <Link
            to="/contracts/new"
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            + عقد جديد
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          تم تسجيل الدخول بنجاح. لوحة التحصيل الكاملة ستُبنى في المهام القادمة.
        </p>

        {profile && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">المعرّف (tenant_id)</dt>
            <dd className="font-mono text-slate-200">{profile.tenant_id}</dd>
            <dt className="text-muted">الاسم</dt>
            <dd className="text-slate-200">{profile.full_name}</dd>
            <dt className="text-muted">الدور</dt>
            <dd className="text-slate-200">{profile.role}</dd>
          </dl>
        )}
      </div>

      <div className="rounded-lg border border-white/10 bg-panel p-6">
        <h2 className="text-sm font-semibold text-muted">
          معاينة تنسيق الأرقام (IBM Plex Mono)
        </h2>
        <p className="mt-2 font-mono text-2xl text-amber tabular-nums">
          {egp(12500.5)}
        </p>
      </div>
    </div>
  );
}
