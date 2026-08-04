import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { stashPendingSignup, useAuth } from "../lib/auth-context";

export default function Signup() {
  const { session, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setSubmitting(false);
      setError(signUpError.message);
      return;
    }

    if (data.session) {
      // Email confirmation disabled: we already have a live session, so
      // provision the tenant + owner profile right away.
      const { error: rpcError } = await supabase.rpc("signup_tenant", {
        p_tenant_name: tenantName,
        p_full_name: fullName,
      });

      setSubmitting(false);

      if (rpcError) {
        setError(rpcError.message);
        return;
      }

      await refreshProfile();
      navigate("/", { replace: true });
      return;
    }

    // Email confirmation required: no session yet. Stash the tenant/full
    // name so the AuthProvider can provision it on the user's first login
    // after they confirm their email (see lib/auth-context.tsx).
    stashPendingSignup(email, { tenantName, fullName });
    setSubmitting(false);
    setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-navy px-4 py-12">
        <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-8 text-center shadow-xl">
          <h1 className="text-xl font-bold text-white">تحقق من بريدك الإلكتروني</h1>
          <p className="mt-3 text-sm text-muted">
            أرسلنا رابط تأكيد إلى <span className="text-white">{email}</span>. بعد
            التأكيد سجّل الدخول لإكمال إنشاء حساب مكتبك.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block rounded-md bg-teal px-4 py-2 font-semibold text-white hover:opacity-90"
          >
            الذهاب لتسجيل الدخول
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-navy px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-panel p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">حساب مكتب جديد</h1>
        <p className="mt-1 text-sm text-muted">أقساطي — احصل على أموالك تلقائيًا</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            اسم المكتب / الشركة
            <input
              type="text"
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-slate-300">
            الاسم الكامل
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-md border border-white/15 bg-navy px-3 py-2 text-white outline-none focus:border-teal"
            />
          </label>

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
              minLength={6}
              autoComplete="new-password"
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
            {submitting ? "جارِ الإنشاء..." : "إنشاء الحساب"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="text-amber hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </div>
    </div>
  );
}
