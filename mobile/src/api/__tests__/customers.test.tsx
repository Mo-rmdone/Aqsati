import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpsert = jest.fn();
const mockIlike = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockGt = jest.fn();
const mockChain: Record<string, unknown> = {};
mockChain.select = (...args: unknown[]) => {
  mockSelect(...args);
  return mockChain;
};
mockChain.then = (res: (v: unknown) => unknown) => res({ count: 7, error: null });
const mockOrder = jest.fn();
mockChain.order = (c: string) => {
  mockOrder(c);
  return mockChain;
};
const mockNeq = jest.fn();
mockChain.neq = (col: string, v: unknown) => {
  mockNeq(col, v);
  return mockChain;
};
mockChain.limit = () =>
  Object.assign(Promise.resolve({ data: [], error: null }), {
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  });
mockChain.ilike = (col: string, pat: string) => {
  mockIlike(col, pat);
  return mockChain;
};
mockChain.eq = (col: string, v: unknown) => {
  mockEq(col, v);
  return mockChain;
};
mockChain.gt = (col: string, v: unknown) => {
  mockGt(col, v);
  return mockChain;
};
const mockUpdate = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdateChain = (v: unknown) => {
  mockUpdate(v);
  return {
    eq: (c: string, id: string) => {
      mockUpdateEq(c, id);
      return Promise.resolve({ error: null });
    },
  };
};
const mockFrom = jest.fn((_table: string) => ({
  upsert: mockUpsert,
  select: mockChain.select,
  update: mockUpdateChain,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => mockFrom(t) },
}));

jest.mock('../../lib/auth', () => ({
  useAuth: () => ({ profile: { tenant_id: 'tenant-1' } }),
}));

import {
  customerSelect,
  escapeSearch,
  prefillFromSearch,
  sortBySeverity,
  useCreateCustomer,
  useUpdateCustomer,
  findCustomerByPhone,
  useCustomers,
  useCustomerCount,
  useCustomerSummaries,
} from '../customers';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockFrom.mockClear();
});

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

test('escapeSearch neutralises LIKE wildcards and filter-syntax characters', () => {
  expect(escapeSearch('a,b(%_)')).toBe('a\\,b\\(\\%\\_\\)');
  expect(escapeSearch('back\\slash')).toBe('back\\\\slash');
  expect(escapeSearch('plain')).toBe('plain');
});

test('escapeSearch strips * (PostgREST alias for %)', () => {
  expect(escapeSearch('a*b')).toBe('ab');
  expect(escapeSearch('***')).toBe('');
});

test('useCustomers passes the escaped term to .ilike', async () => {
  mockIlike.mockClear();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useCustomers('a,b(%*'), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockIlike).toHaveBeenCalledWith('name', '%a\\,b\\(\\%%');
  expect(mockIlike).toHaveBeenCalledWith('phone', 'a\\,b\\(\\%%');
});

test('useCreateCustomer upserts with ignoreDuplicates each time, with the same id', async () => {
  const { result } = await renderHook(() => useCreateCustomer(), { wrapper: makeWrapper() });
  const input = { id: 'c-1', name: 'علي', phone: '01012345678', nationalId: '', address: '' };

  let a: string | undefined;
  let b: string | undefined;
  await act(async () => {
    a = await result.current.mutateAsync(input);
  });
  await act(async () => {
    b = await result.current.mutateAsync(input);
  });

  expect(a).toBe('c-1');
  expect(b).toBe('c-1');
  expect(mockFrom).toHaveBeenCalledWith('customer');
  expect(mockUpsert).toHaveBeenCalledTimes(2);
  for (const call of mockUpsert.mock.calls) {
    expect(call[0]).toMatchObject({
      id: 'c-1',
      tenant_id: 'tenant-1',
      name: 'علي',
      phone: '01012345678',
      national_id: null,
      address: null,
    });
    expect(call[1]).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  }
});

test('useUpdateCustomer sends trimmed values and null for empty optional fields', async () => {
  const { result } = await renderHook(() => useUpdateCustomer(), { wrapper: makeWrapper() });
  await act(async () => {
    await result.current.mutateAsync({
      id: 'c-9',
      name: '  علي  ',
      phone: ' 01012345678 ',
      nationalId: '  ',
      address: '',
      notes: '   ',
    });
  });
  expect(mockUpdate).toHaveBeenCalledWith({
    name: 'علي',
    phone: '01012345678',
    national_id: null,
    address: null,
    notes: null,
  });
  expect(mockUpdateEq).toHaveBeenCalledWith('id', 'c-9');

  await act(async () => {
    await result.current.mutateAsync({
      id: 'c-9',
      name: 'علي',
      phone: '01012345678',
      nationalId: ' 29001011234567 ',
      address: ' شارع ١ ',
      notes: ' ملاحظة ',
    });
  });
  expect(mockUpdate).toHaveBeenLastCalledWith({
    name: 'علي',
    phone: '01012345678',
    national_id: '29001011234567',
    address: 'شارع ١',
    notes: 'ملاحظة',
  });
});

test('findCustomerByPhone excludes the given id, and only then', async () => {
  mockNeq.mockClear();
  await findCustomerByPhone('01012345678', 'cust-a');
  expect(mockNeq).toHaveBeenCalledWith('id', 'cust-a');
  mockNeq.mockClear();
  await findCustomerByPhone('01012345678');
  expect(mockNeq).not.toHaveBeenCalled();
});

test('useCreateCustomer surfaces a server error', async () => {
  mockUpsert.mockResolvedValue({ error: new Error('boom') });
  const { result } = await renderHook(() => useCreateCustomer(), { wrapper: makeWrapper() });
  await expect(
    act(async () => {
      await result.current.mutateAsync({ id: 'c-2', name: 'x', phone: '01012345678' });
    }),
  ).rejects.toThrow('boom');
});

test('customers screen lists only customers with invoices; the invoice picker searches everyone', () => {
  expect(customerSelect(true)).toBe('id, name, phone, contract!inner(id)');
  expect(customerSelect(false)).toBe('id, name, phone');
});

function summaryWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

test('useCustomerSummaries reads v_customer_summary and filters late_many by status', async () => {
  mockEq.mockClear();
  mockFrom.mockClear();
  const { result } = await renderHook(() => useCustomerSummaries('', 'late_many'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockFrom).toHaveBeenCalledWith('v_customer_summary');
  expect(mockEq).toHaveBeenCalledWith('status', 'late_many');
});

test('useCustomerSummaries maps the other filters', async () => {
  mockEq.mockClear();
  mockGt.mockClear();
  const a = await renderHook(() => useCustomerSummaries('', 'paid_month'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(a.result.current.isSuccess).toBe(true));
  expect(mockEq).toHaveBeenCalledWith('paid_this_month', true);
  const b = await renderHook(() => useCustomerSummaries('', 'late_month'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(b.result.current.isSuccess).toBe(true));
  expect(mockEq).toHaveBeenCalledWith('late_this_month', true);
  const c = await renderHook(() => useCustomerSummaries('', 'owes'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(c.result.current.isSuccess).toBe(true));
  expect(mockGt).toHaveBeenCalledWith('remaining_total', 0);
});

test('useCustomerSummaries normalises Arabic digits for the phone search', async () => {
  mockIlike.mockClear();
  const { result } = await renderHook(() => useCustomerSummaries('٠١٠', 'all'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockIlike).toHaveBeenCalledWith('phone', '010%');
  expect(mockIlike).toHaveBeenCalledWith('name', '%010%');
});

test('useCustomerSummaries applies the filter to both the name and the phone call', async () => {
  mockGt.mockClear();
  mockIlike.mockClear();
  const { result } = await renderHook(() => useCustomerSummaries('x', 'owes'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockGt).toHaveBeenCalledTimes(2);
  expect(mockGt).toHaveBeenCalledWith('remaining_total', 0);
  expect(mockIlike).toHaveBeenCalledTimes(2);
});

test('useCustomerSummaries uses a different query key per filter', async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60000 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result, rerender } = await renderHook(
    ({ f }: { f: 'late_many' | 'paid_month' }) => useCustomerSummaries('', f),
    { wrapper, initialProps: { f: 'late_many' as 'late_many' | 'paid_month' } },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  await rerender({ f: 'paid_month' });
  await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(2));
  const keys = qc.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
  expect(keys).toEqual(
    expect.arrayContaining([
      JSON.stringify(['customers', 'summary', '', 'late_many']),
      JSON.stringify(['customers', 'summary', '', 'paid_month']),
    ]),
  );
});

test('useCustomerCount runs a head count on the view with the filter applied', async () => {
  mockSelect.mockClear();
  mockEq.mockClear();
  mockFrom.mockClear();
  const { result } = await renderHook(() => useCustomerCount('late_many'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(result.current.data).toBe(7));
  expect(mockFrom).toHaveBeenCalledWith('v_customer_summary');
  expect(mockSelect).toHaveBeenCalledWith('customer_id', { count: 'exact', head: true });
  expect(mockEq).toHaveBeenCalledWith('status', 'late_many');
});

test('useCustomerSummaries orders by status_rank then name on the server, before the limit', async () => {
  mockOrder.mockClear();
  const { result } = await renderHook(() => useCustomerSummaries('', 'all'), { wrapper: summaryWrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockOrder.mock.calls.map((c) => c[0])).toEqual(['status_rank', 'name']);
});

test('sortBySeverity orders by status_rank, then by name', () => {
  const r = (name: string, status_rank: number | null) => ({ customer_id: name + status_rank, name, status_rank }) as never;
  const sorted = sortBySeverity([r('ب', 5), r('ب', 4), r('أ', 4), r('ج', 3), r('د', 2), r('ه', 1)]) as unknown as {
    status_rank: number;
    name: string;
  }[];
  expect(sorted.map((x) => x.status_rank)).toEqual([1, 2, 3, 4, 4, 5]);
  expect(sorted[3].name).toBe('أ');
});
