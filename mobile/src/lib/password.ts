import { supabase } from './supabase';

export type ChangePasswordResult = 'ok' | 'wrong_current' | 'weak' | 'same' | 'failed';

const MIN_LENGTH = 6; // same rule as signup

/**
 * Re-authenticates with the current password, then sets the new one.
 * Passwords are only passed to the auth calls; never logged or stored.
 */
export async function changePassword(email: string, current: string, next: string): Promise<ChangePasswordResult> {
  if (next === current) return 'same';
  if (next.length < MIN_LENGTH) return 'weak';
  try {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (signInError) return signInError.code === 'invalid_credentials' ? 'wrong_current' : 'failed';
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) return error.code === 'weak_password' ? 'weak' : 'failed';
    // Sign out the other devices; the password is already changed, so a failure here is ignored.
    try {
      await supabase.auth.signOut({ scope: 'others' });
    } catch {
      // ignored
    }
    return 'ok';
  } catch {
    return 'failed';
  }
}
