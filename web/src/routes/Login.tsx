import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth-context";

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    const redirectTo =
      (location.state as { from?: Location } | null)?.from?.pathname ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setSubmitting(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    navigate("/", { replace: true });
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
        <p className="mt-1 text-sm text-muted">أقساطي — احصل على أموالك تلقائيًا</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            البريد الإلكتروني
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            كلمة المرور
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
          </label>

          {error && (
            <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-teal px-4 py-2 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "جارِ الدخول..." : "دخول"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          ليس لديك حساب؟{" "}
          <Link to="/signup" className="text-amber hover:underline">
            أنشئ حساب مكتب جديد
          </Link>
        </p>
      </div>
    </div>
  );
}
