import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpsert = jest.fn();
const mockOrder = jest.fn();
const chain: Record<string, unknown> = {};
chain.select = () => chain;
chain.eq = () => chain;
chain.order = (c: string, o?: unknown) => {
  mockOrder(c, o);
  return chain;
};
chain.limit = () => Promise.resolve({ data: [], error: null });
chain.then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
const mockFrom = jest.fn((_t: string) => ({ upsert: mockUpsert, select: chain.select }));

jest.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));
jest.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { tenant_id: 'tenant-1' } }) }));

import { useFollowup, useLogContact } from '../followup';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));
beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockOrder.mockClear();
});

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

test('useLogContact upserts idempotently, trims note, never sends created_by/created_at', async () => {
  const { result } = await renderHook(() => useLogContact(), { wrapper });
  const input = { id: 'k-1', customerId: 'c-1', kind: 'note' as const, note: '  هيدفع  ', promiseDate: '2026-12-05' };
  await act(async () => {
    await result.current.mutateAsync(input);
    await result.current.mutateAsync(input);
  });
  expect(mockUpsert).toHaveBeenCalledTimes(2);
  const [row, opts] = mockUpsert.mock.calls[0];
  expect(opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  expect(row).toEqual({
    id: 'k-1', tenant_id: 'tenant-1', customer_id: 'c-1', kind: 'note', note: 'هيدفع', promise_date: '2026-12-05',
  });
  expect(mockUpsert.mock.calls[1][0].id).toBe('k-1');
});

test('empty note becomes null', async () => {
  const { result } = await renderHook(() => useLogContact(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ id: 'k-2', customerId: 'c-1', kind: 'call', note: '   ' });
  });
  expect(mockUpsert.mock.calls[0][0].note).toBeNull();
  expect(mockUpsert.mock.calls[0][0].promise_date).toBeNull();
});

test('promise_date is only sent for notes', async () => {
  const { result } = await renderHook(() => useLogContact(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ id: 'k-3', customerId: 'c-1', kind: 'call', promiseDate: '2026-12-05' });
  });
  expect(mockUpsert.mock.calls[0][0].promise_date).toBeNull();
});

test('useFollowup orders on the server', async () => {
  const { result } = await renderHook(() => useFollowup(), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockOrder.mock.calls).toEqual([
    ['bucket', undefined],
    ['days_late', { ascending: false }],
    ['next_due_date', undefined],
    ['name', undefined],
  ]);
});
