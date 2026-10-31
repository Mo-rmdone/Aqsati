import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockUpsert = jest.fn();
const mockFrom = jest.fn((_table: string) => ({ upsert: mockUpsert }));

jest.mock('../../lib/supabase', () => ({
  supabase: { from: (t: string) => mockFrom(t) },
}));

jest.mock('../../lib/auth', () => ({
  useAuth: () => ({ profile: { tenant_id: 'tenant-1' } }),
}));

import { escapeSearch, useCreateCustomer } from '../customers';

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

test('useCreateCustomer surfaces a server error', async () => {
  mockUpsert.mockResolvedValue({ error: new Error('boom') });
  const { result } = await renderHook(() => useCreateCustomer(), { wrapper: makeWrapper() });
  await expect(
    act(async () => {
      await result.current.mutateAsync({ id: 'c-2', name: 'x', phone: '01012345678' });
    }),
  ).rejects.toThrow('boom');
});
