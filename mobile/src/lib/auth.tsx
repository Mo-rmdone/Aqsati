import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import type { Tables } from './database.types';
import { supabase } from './supabase';

export type Profile = Tables<'profile'>;

interface PendingSignup {
  tenantName: string;
  fullName: string;
}

const pendingSignupKey = (email: string) => `notah:pending-signup:${email.trim().toLowerCase()}`;

// Web: localStorage (may throw when blocked); native: AsyncStorage.
const kv = {
  async get(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
      else await AsyncStorage.setItem(key, value);
    } catch {
      // storage unavailable: the user will have to re-enter the shop name after confirming
    }
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
      else await AsyncStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

/** Called by the signup screen when signUp() returns no session (email confirmation on):
 * stash the names so the first sign-in after confirming can still provision the shop. */
export async function stashPendingSignup(email: string, data: PendingSignup): Promise<void> {
  await kv.set(pendingSignupKey(email), JSON.stringify(data));
}

async function takePendingSignup(email: string): Promise<PendingSignup | null> {
  const key = pendingSignupKey(email);
  const raw = await kv.get(key);
  if (!raw) return null;
  await kv.remove(key);
  try {
    return JSON.parse(raw) as PendingSignup;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  shopName: string | null;
  /** true until the initial session + profile lookup has resolved */
  loading: boolean;
  /** re-fetch the profile (reads the live session, never a captured one) */
  /** resolves true when a profile was loaded */
  refreshProfile: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Loads run one at a time: onAuthStateChange and refreshProfile can both fire
  // for the same sign-in, and a concurrent second run would see "no profile, no
  // pending signup" mid-provisioning and clobber the first run's result.
  // loadProfile never rejects, so one failed load cannot block the queue.
  // Resolves true when a profile was loaded by this run.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const loadProfile = useCallback((activeSession: Session | null): Promise<boolean> => {
    const run = queue.current
      .then(() => loadProfileOnce(activeSession))
      .catch((e) => {
        console.error('Failed to load profile', e);
        keepProfileFor(activeSession);
        return false;
      });
    queue.current = run;
    return run;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A transient failure must not eject a signed-in user: keep the loaded profile
  // when it belongs to the same user, otherwise clear it.
  const keepProfileFor = (activeSession: Session | null) => {
    const userId = activeSession?.user?.id;
    setProfile((p) => (userId && p && p.id === userId ? p : null));
  };

  const loadProfileOnce = async (activeSession: Session | null): Promise<boolean> => {
    if (!activeSession?.user) {
      setProfile(null);
      return false;
    }
    const userId = activeSession.user.id;

    const { data, error } = await supabase.from('profile').select('*').eq('id', userId).maybeSingle();
    if (error) {
      console.error('Failed to load profile', error);
      keepProfileFor(activeSession);
      return false;
    }
    if (data) {
      setProfile(data);
      return true;
    }

    // No profile: first sign-in after email confirmation. Consume the pending
    // signup (if any) and provision the shop now.
    const email = activeSession.user.email;
    const pending = email ? await takePendingSignup(email) : null;
    if (!pending) {
      setProfile(null);
      return false;
    }

    const { error: rpcError } = await supabase.rpc('signup_tenant', {
      p_tenant_name: pending.tenantName,
      p_full_name: pending.fullName,
    });
    if (rpcError) {
      console.error('signup_tenant failed on post-confirmation login', rpcError);
      // Put it back so "إعادة المحاولة" can try again.
      if (email) await stashPendingSignup(email, pending);
      setProfile(null);
      return false;
    }

    const { data: fresh, error: refetchError } = await supabase
      .from('profile')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (refetchError) {
      console.error('Failed to load profile after signup_tenant', refetchError);
      keepProfileFor(activeSession);
      return false;
    }
    setProfile(fresh ?? null);
    return Boolean(fresh);
  };

  // Reads the live session instead of closing over `session` state: Signup calls
  // this right after signUp() while its render still holds the pre-signup null
  // session, which left new owners stuck on loading (old web, commit 28b62e9).
  const refreshProfile = useCallback(async (): Promise<boolean> => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    return loadProfile(data.session);
  }, [loadProfile]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        await loadProfile(data.session);
      } catch (e) {
        console.error('Failed to read session', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (cancelled) return;
      setSession(newSession);
      // Defer: supabase-js recommends not awaiting other supabase calls inside this callback.
      setTimeout(async () => {
        if (cancelled) return;
        try {
          await loadProfile(newSession);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Shop name: fetched once per tenant after the profile loads.
  const tenantId = profile?.tenant_id ?? null;
  useEffect(() => {
    if (!tenantId) {
      setShopName(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('tenant')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle()
      .then(
        ({ data }) => {
          if (!cancelled) setShopName(data?.name ?? null);
        },
        () => {},
      );
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('signOut failed', e);
    } finally {
      // Clear local state even if the server call failed.
      setProfile(null);
      setSession(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, shopName, loading, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
