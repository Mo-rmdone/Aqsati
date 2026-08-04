import { Link } from "react-router-dom";

const REPORTS = [
  {
    to: "/reports/aging",
    title: "أعمار الديون",
    desc: "أقساط العقود وفواتير آجل، مبوّبة حسب فترة التأخير.",
  },
  {
    to: "/reports/collections",
    title: "التحصيل حسب الفترة",
    desc: "إجمالي الدفعات المحصّلة يوميًا أو أسبوعيًا أو شهريًا.",
  },
  {
    to: "/reports/statement",
    title: "كشف حساب عميل",
    desc: "السجل الكامل لعميل واحد: عقود، فواتير آجل، ودفعات.",
  },
];

/** Landing page for the three Task 11 reports — a simple link list, matching
 * the app's existing information density (Dashboard's own layout has no
 * heavier "hub" pattern to depart from). */
export default function ReportsHome() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-xl font-bold text-white">التقارير</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {REPORTS.map((r) => (
          <Link
            key={r.to}
            to={r.to}
            className="rounded-lg border border-white/10 bg-panel p-5 hover:border-teal hover:bg-white/5"
          >
            <h2 className="font-semibold text-white">{r.title}</h2>
            <p className="mt-1 text-sm text-muted">{r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
