import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

type Sess = { user: { id: string; email: string } } | null;
type ProfileResult = { data: unknown; error: unknown };

const mockState: {
  session: Sess;
  getSessionError: Error | null;
  profileFn: (id: string) => Promise<ProfileResult> | ProfileResult;
  tenantName: string;
  listener: ((event: string, s: Sess) => void) | null;
  signOutError: Error | null;
} = {
  session: null,
  getSessionError: null,
  profileFn: () => ({ data: null, error: null }),
  tenantName: 'متجر النور',
  listener: null,
  signOutError: null,
};
const mockProfileEq = jest.fn();
const mockRpc = jest.fn();
const mockSignUp = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => {
  const { Text: T } = require('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => <T>{children}</T>,
    useRouter: () => ({ replace: mockReplace }),
  };
});

jest.mock('../supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: jest.fn(async () => {
        if (mockState.getSessionError) throw mockState.getSessionError;
        return { data: { session: mockState.session } };
      }),
      onAuthStateChange: jest.fn((cb: (e: string, s: Sess) => void) => {
        mockState.listener = cb;
        return { data: { subscription: { unsubscribe: jest.fn() } } };
      }),
      signOut: jest.fn(async () => {
        if (mockState.signOutError) throw mockState.signOutError;
        return {};
      }),
      signUp: (...a: unknown[]) => mockSignUp(...a),
    },
    from: jest.fn((table: string) => {
      let id = '';
      const chain = {
        select: () => chain,
        eq: (_col: string, v: string) => {
          mockProfileEq(_col, v);
          id = v;
          return chain;
        },
        maybeSingle: async () =>
          table === 'tenant'
            ? { data: { name: mockState.tenantName }, error: null }
            : mockState.profileFn(id),
      };
      return chain;
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

import Signup from '../../app/(auth)/signup';
import { AuthProvider, stashPendingSignup, useAuth } from '../auth';

const row = (id: string) => ({ data: { id, tenant_id: 't1', full_name: 'x', role: 'owner' }, error: null });
const USER = { user: { id: 'u1', email: 'a@b.c' } };
const stashKey = 'notah:pending-signup:a@b.c';

let ctx: ReturnType<typeof useAuth>;
function Probe() {
  ctx = useAuth();
  return <Text>{ctx.loading ? 'loading' : 'ready'}</Text>;
}

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

async function mountProvider(children: React.ReactNode = <Probe />) {
  await act(async () => {
    render(<AuthProvider>{children}</AuthProvider>);
  });
  await flush();
}

beforeEach(async () => {
  mockState.session = null;
  mockState.getSessionError = null;
  mockState.profileFn = () => ({ data: null, error: null });
  mockState.listener = null;
  mockState.signOutError = null;
  mockState.tenantName = 'متجر النور';
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null });
  await AsyncStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('refreshProfile reads the live session, not the stale null one captured at render', async () => {
  mockState.profileFn = (id) => row(id);
  await mountProvider();
  expect(ctx.loading).toBe(false);
  expect(ctx.session).toBeNull();
  mockState.session = { user: { id: 'live-user', email: 'a@b.c' } };
  const staleRefresh = ctx.refreshProfile;
  await act(async () => {
    await staleRefresh();
  });
  expect(mockProfileEq).toHaveBeenCalledWith('id', 'live-user');
  expect(ctx.profile?.tenant_id).toBe('t1');
});

test('pending signup is provisioned exactly once even when listener and refresh race', async () => {
  let provisioned = false;
  mockRpc.mockImplementation(async () => {
    provisioned = true;
    return { error: null };
  });
  mockState.profileFn = (id) => (provisioned ? row(id) : { data: null, error: null });
  await stashPendingSignup('a@b.c', { tenantName: 'متجر', fullName: 'مالك' });
  mockState.session = USER;
  await mountProvider();
  await act(async () => {
    mockState.listener!('SIGNED_IN', USER);
    await ctx.refreshProfile();
  });
  await flush();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('signup_tenant', { p_tenant_name: 'متجر', p_full_name: 'مالك' });
  expect(ctx.profile).not.toBeNull();
  expect(await AsyncStorage.getItem(stashKey)).toBeNull();
});

test('stash is restored when signup_tenant fails, so a retry can provision', async () => {
  mockRpc.mockResolvedValue({ error: { message: 'boom' } });
  await stashPendingSignup('a@b.c', { tenantName: 'متجر', fullName: 'مالك' });
  mockState.session = USER;
  await mountProvider();
  expect(ctx.loading).toBe(false);
  expect(ctx.profile).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem(stashKey))!)).toEqual({ tenantName: 'متجر', fullName: 'مالك' });
});

test('shopName is loaded for the tenant, and signOut clears profile, shopName and session', async () => {
  mockState.session = USER;
  mockState.profileFn = (id) => row(id);
  await mountProvider();
  expect(ctx.shopName).toBe('متجر النور');
  await act(async () => {
    await ctx.signOut();
  });
  await flush();
  expect(ctx.profile).toBeNull();
  expect(ctx.shopName).toBeNull();
  expect(ctx.session).toBeNull();
});

test('signOut clears local state even when the server call rejects', async () => {
  mockState.session = USER;
  mockState.profileFn = (id) => row(id);
  await mountProvider();
  mockState.signOutError = new Error('offline');
  await act(async () => {
    await ctx.signOut();
  });
  expect(ctx.profile).toBeNull();
  expect(ctx.session).toBeNull();
});

test('loading ends when getSession rejects', async () => {
  mockState.getSessionError = new Error('storage broken');
  await mountProvider();
  expect(ctx.loading).toBe(false);
});

test('loading ends when the profile fetch throws, and the queue keeps working', async () => {
  mockState.session = USER;
  mockState.profileFn = () => {
    throw new Error('network');
  };
  await mountProvider();
  expect(ctx.loading).toBe(false);
  expect(ctx.profile).toBeNull();
  mockState.profileFn = (id) => row(id);
  await act(async () => {
    await ctx.refreshProfile();
  });
  expect(ctx.profile).not.toBeNull();
});

test('a transient profile-fetch error keeps the existing profile for the same user', async () => {
  mockState.session = USER;
  mockState.profileFn = (id) => row(id);
  await mountProvider();
  expect(ctx.profile).not.toBeNull();
  mockState.profileFn = () => ({ data: null, error: { message: 'timeout' } });
  await act(async () => {
    await ctx.refreshProfile();
  });
  expect(ctx.profile).not.toBeNull();
  // A successful lookup with no row does clear it.
  mockState.profileFn = () => ({ data: null, error: null });
  await act(async () => {
    await ctx.refreshProfile();
  });
  expect(ctx.profile).toBeNull();
});

test('signup retry: after signUp succeeds but signup_tenant fails, pressing again retries the RPC, not signUp', async () => {
  let provisioned = false;
  mockSignUp.mockImplementation(async () => {
    mockState.session = USER;
    return { data: { session: USER }, error: null };
  });
  mockRpc
    .mockImplementationOnce(async () => ({ error: { message: 'rpc down' } }))
    .mockImplementation(async () => {
      provisioned = true;
      return { error: null };
    });
  mockState.profileFn = (id) => (provisioned ? row(id) : { data: null, error: null });

  await mountProvider(
    <>
      <Probe />
      <Signup />
    </>,
  );
  await fireEvent.changeText(screen.getByLabelText('اسم المتجر'), 'متجر');
  await fireEvent.changeText(screen.getByLabelText('اسم المالك'), 'مالك');
  await fireEvent.changeText(screen.getByLabelText('البريد الإلكتروني'), 'a@b.c');
  await fireEvent.changeText(screen.getByLabelText('كلمة المرور'), 'secret1');

  const press = async () => {
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'إنشاء الحساب' }));
    });
    await flush();
  };

  await press();
  expect(mockSignUp).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(screen.getByText('حصلت مشكلة، حاول مرة تانية')).toBeTruthy();

  await press();
  expect(mockSignUp).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledTimes(2);
  expect(mockRpc).toHaveBeenLastCalledWith('signup_tenant', { p_tenant_name: 'متجر', p_full_name: 'مالك' });
  expect(ctx.profile).not.toBeNull();
});
