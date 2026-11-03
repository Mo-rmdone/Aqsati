import { authErrorMessage } from './authErrors';
import { supabase } from './supabase';

export type ChangePasswordResult = 'ok' | 'wrong_current' | 'weak' | 'same' | 'failed';

const MIN_LENGTH = 6; // same rule as signup
const WEAK_MESSAGE = authErrorMessage({ code: 'weak_password' });

/**
 * Re-authenticates with the current password, then sets the new one.
 * Passwords are only passed to the auth calls; never logged or stored.
 */
export async function changePassword(email: string, current: string, next: string): Promise<ChangePasswordResult> {
  if (next === current) return 'same';
  if (next.length < MIN_LENGTH) return 'weak';
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signInError) return 'wrong_current';
    const { error } = await supabase.auth.updateUser({ password: next });
    if (!error) return 'ok';
    return authErrorMessage(error) === WEAK_MESSAGE ? 'weak' : 'failed';
  } catch {
    return 'failed';
  }
}
