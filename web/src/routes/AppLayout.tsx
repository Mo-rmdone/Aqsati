import { Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

const ROLE_LABELS: Record<string, string> = {
  owner: "مالك",
  manager: "مدير",
  accountant: "محاسب",
  collector: "محصّل",
  viewer: "مشاهد",
};

export default function AppLayout() {
  const { profile, signOut } = useAuth();

  return (
    <div className="flex min-h-svh flex-col bg-navy">
      <header className="flex items-center justify-between bg-teal px-4 py-3 text-white shadow-md sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">أقساطي</span>
          <span className="hidden text-sm text-white/70 sm:inline">
            Get paid, automatically.
          </span>
        </div>

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
