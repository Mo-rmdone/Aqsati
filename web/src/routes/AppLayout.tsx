import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const ROLE_LABELS: Record<string, string> = {
  owner: "مالك",
  manager: "مدير",
  accountant: "محاسب",
  collector: "محصّل",
  viewer: "مشاهد",
};

const NAV_LINKS = [
  { to: "/", label: "لوحة التحصيل", end: true },
  { to: "/customers", label: "العملاء", end: false },
  { to: "/reports", label: "التقارير", end: false },
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-svh flex-col bg-navy">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-teal px-4 py-3 text-white shadow-md sm:px-6">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-lg font-bold">
            أقساطي
          </Link>
          <span className="hidden text-sm text-white/70 sm:inline">
            Get paid, automatically.
          </span>
        </div>

        <nav className="flex items-center gap-1 order-3 w-full sm:order-none sm:w-auto">
          {NAV_LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          {profile && (
            <div className="text-end text-sm leading-tight">
              <div className="font-semibold">{profile.full_name}</div>
              <div className="text-white/70">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-md border border-white/30 px-3 py-1.5 text-sm font-medium transition hover:bg-white/10"
          >
            تسجيل الخروج
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
