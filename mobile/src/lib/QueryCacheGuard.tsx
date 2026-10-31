import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { useAuth } from './auth';

/** Drops every cached query when the signed-in user changes (sign-out, or another user signing in),
 * so one shop's data can never be shown to the next session. Render inside both providers. */
export function QueryCacheGuard() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const userId = session?.user.id ?? null;
  const prev = useRef<string | null>(userId);
  useEffect(() => {
    if (prev.current !== userId) {
      prev.current = userId;
      qc.clear();
    }
  }, [userId, qc]);
  return null;
}
