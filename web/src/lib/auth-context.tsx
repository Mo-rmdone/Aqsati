import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Tables } from "./database.types";

export type Profile = Tables<"profile">;

interface PendingSignup {
  tenantName: string;
  fullName: string;
}

const pendingSignupKey = (email: string) =>
  `aqsati:pending-signup:${email.trim().toLowerCase()}`;

/** Called by the signup screen right after `auth.signUp()` when Supabase
 * does NOT return a session immediately (email confirmation is required).
 * We stash the tenant/full name so the very first sign-in after the user
 * confirms their email can still provision the tenant via `signup_tenant`. */
export function stashPendingSignup(email: string, data: PendingSignup) {
  localStorage.setItem(pendingSignupKey(email), JSON.stringify(data));
}

function takePendingSignup(email: string): PendingSignup | null {
  const key = pendingSignupKey(email);
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  localStorage.removeItem(key);
  try {
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  /** true until the initial session + profile lookup has resolved */
  loading: boolean;
  /** re-fetch the profile row (call after signup_tenant provisions it) */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      setProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from("profile")
      .select("*")
      .eq("id", activeSession.user.id)
      .maybeSingle();

    if (error) {
      console.error("Failed to load profile", error);
      setProfile(null);
      return;
    }

    if (data) {
      setProfile(data);
      return;
    }

    // No profile yet: this is the first sign-in after email confirmation for
    // a user who signed up while "confirm email" was required. Consume the
    // pending signup (if any) and provision the tenant now.
    const email = activeSession.user.email;
    const pending = email ? takePendingSignup(email) : null;
    if (!pending) {
      setProfile(null);
      return;
    }

    const { error: rpcError } = await supabase.rpc("signup_tenant", {
      p_tenant_name: pending.tenantName,
      p_full_name: pending.fullName,
    });

    if (rpcError) {
      console.error("signup_tenant failed on post-confirmation login", rpcError);
      setProfile(null);
      return;
    }

    const { data: freshProfile, error: refetchError } = await supabase
      .from("profile")
      .select("*")
      .eq("id", activeSession.user.id)
      .maybeSingle();

    if (refetchError) {
      console.error("Failed to load profile after signup_tenant", refetchError);
    }
    setProfile(freshProfile ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(session);
  }, [loadProfile, session]);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (!cancelled) setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (cancelled) return;
        setSession(newSession);
        await loadProfile(newSession);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
    // loadProfile is stable (useCallback, no deps that change identity meaningfully)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
