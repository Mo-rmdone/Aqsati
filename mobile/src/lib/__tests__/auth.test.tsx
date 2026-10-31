import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

type Sess = { user: { id: string; email: string } } | null;
let mockSession: Sess = null;
const mockProfileEq = jest.fn();

jest.mock('../supabase', () => {
  const chain = {
    select: () => chain,
    eq: (...args: unknown[]) => {
      mockProfileEq(...args);
      return chain;
    },
    maybeSingle: async () => ({
      data: { id: 'u1', tenant_id: 't1', full_name: 'x', role: 'owner' },
      error: null,
    }),
  };
  return {
    isSupabaseConfigured: true,
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({ data: { session: mockSession } })),
        onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
        signOut: jest.fn(async () => ({})),
      },
      from: jest.fn(() => chain),
      rpc: jest.fn(async () => ({ error: null })),
    },
  };
});

import { AuthProvider, useAuth } from '../auth';

let captured: ReturnType<typeof useAuth> | null = null;
function Probe() {
  captured = useAuth();
  return <Text>{captured.loading ? 'loading' : 'ready'}</Text>;
}

test('refreshProfile reads the live session, not the stale null one captured at render', async () => {
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await waitFor(() => expect(captured!.loading).toBe(false));
  // The probe's render captured session === null; signUp now creates a session.
  expect(captured!.session).toBeNull();
  mockSession = { user: { id: 'live-user', email: 'a@b.c' } };
  const refresh = captured!.refreshProfile; // closure from the stale render
  await act(async () => {
    await refresh();
  });
  expect(mockProfileEq).toHaveBeenCalledWith('id', 'live-user');
  expect(captured!.profile?.tenant_id).toBe('t1');
});
