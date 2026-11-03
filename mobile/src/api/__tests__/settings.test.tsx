import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockRpc = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockSigned = jest.fn();
const mockRefreshShopName = jest.fn();
const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: (b: string) => ({
        upload: (...a: unknown[]) => mockUpload(b, ...a),
        remove: (...a: unknown[]) => mockRemove(b, ...a),
        createSignedUrl: (...a: unknown[]) => mockSigned(b, ...a),
      }),
    },
  },
}));

jest.mock('../../lib/auth', () => ({
  useAuth: () => ({ profile: { tenant_id: 'tenant-1' }, refreshShopName: mockRefreshShopName }),
}));

import { removeShopLogo, uploadShopLogo, useLogoUrl, useShopSettings, useUpdateShopSettings } from '../settings';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));

beforeEach(() => {
  jest.resetAllMocks();
  mockFrom.mockReturnValue({
    select: (cols: string) => ({
      eq: (c: string, v: string) => {
        mockEq(cols, c, v);
        return { single: mockSingle };
      },
    }),
  });
  mockRemove.mockResolvedValue({ error: null });
  mockRefreshShopName.mockResolvedValue(undefined);
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}
const wrap = (qc: QueryClient) =>
  function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };

test('useShopSettings maps snake_case to camelCase for the tenant', async () => {
  mockSingle.mockResolvedValue({
    data: {
      name: 'متجر النور',
      address: 'القاهرة',
      phone: '01012345678',
      logo_path: 'tenant-1/logo-1.png',
      default_rate: 12.5,
      default_years: 2,
      whatsapp_template: 'أهلاً {العميل}',
    },
    error: null,
  });
  const { result } = await renderHook(() => useShopSettings(), { wrapper: wrap(makeClient()) });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockFrom).toHaveBeenCalledWith('tenant');
  expect(mockEq.mock.calls[0][1]).toBe('id');
  expect(mockEq.mock.calls[0][2]).toBe('tenant-1');
  expect(result.current.data).toEqual({
    name: 'متجر النور',
    address: 'القاهرة',
    phone: '01012345678',
    logoPath: 'tenant-1/logo-1.png',
    defaultRate: 12.5,
    defaultYears: 2,
    whatsappTemplate: 'أهلاً {العميل}',
  });
});

test('useUpdateShopSettings calls the rpc, invalidates and refreshes the shop name', async () => {
  mockRpc.mockResolvedValue({ error: null });
  const qc = makeClient();
  const spy = jest.spyOn(qc, 'invalidateQueries');
  const { result } = await renderHook(() => useUpdateShopSettings(), { wrapper: wrap(qc) });
  await act(async () => {
    await result.current.mutateAsync({
      name: 'س',
      address: null,
      phone: null,
      defaultRate: 10,
      defaultYears: 3,
      whatsappTemplate: null,
    });
  });
  expect(mockRpc).toHaveBeenCalledWith('update_shop_settings', {
    p_name: 'س',
    p_address: null,
    p_phone: null,
    p_default_rate: 10,
    p_default_years: 3,
    p_whatsapp_template: null,
  });
  expect(spy).toHaveBeenCalledWith({ queryKey: ['shopSettings'] });
  expect(mockRefreshShopName).toHaveBeenCalledTimes(1);
});

test('useUpdateShopSettings does not refresh on rpc error', async () => {
  mockRpc.mockResolvedValue({ error: new Error('nope') });
  const { result } = await renderHook(() => useUpdateShopSettings(), { wrapper: wrap(makeClient()) });
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        name: 'س', address: null, phone: null, defaultRate: null, defaultYears: null, whatsappTemplate: null,
      }),
    ).rejects.toThrow('nope');
  });
  expect(mockRefreshShopName).not.toHaveBeenCalled();
});

test('uploadShopLogo uploads under the tenant folder, sets the path, removes the previous one', async () => {
  mockUpload.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: null });
  const blob = new Blob(['x']);
  const path = await uploadShopLogo('tenant-1', blob, 'image/png', 'tenant-1/logo-old.png');
  expect(path).toMatch(/^tenant-1\/logo-\d+\.png$/);
  expect(mockUpload).toHaveBeenCalledWith('shop-logos', path, blob, { contentType: 'image/png', upsert: false });
  expect(mockRpc).toHaveBeenCalledWith('set_shop_logo', { p_path: path });
  expect(mockRemove).toHaveBeenCalledWith('shop-logos', ['tenant-1/logo-old.png']);
});

test('uploadShopLogo cleans up the new object if set_shop_logo fails', async () => {
  mockUpload.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ error: new Error('rpc') });
  await expect(uploadShopLogo('tenant-1', new Blob(['x']), 'image/jpeg')).rejects.toThrow('rpc');
  expect(mockRemove).toHaveBeenCalledWith('shop-logos', [expect.stringMatching(/^tenant-1\/logo-\d+\.jpg$/)]);
});

test('removeShopLogo clears the path then removes the object', async () => {
  mockRpc.mockResolvedValue({ error: null });
  await removeShopLogo('tenant-1', 'tenant-1/logo-1.png');
  expect(mockRpc).toHaveBeenCalledWith('set_shop_logo', { p_path: null });
  expect(mockRemove).toHaveBeenCalledWith('shop-logos', ['tenant-1/logo-1.png']);
});

test('useLogoUrl signs for an hour and is disabled without a path', async () => {
  mockSigned.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
  const { result } = await renderHook(() => useLogoUrl('tenant-1/logo-1.png'), { wrapper: wrap(makeClient()) });
  await waitFor(() => expect(result.current.data).toBe('https://signed/x'));
  expect(mockSigned).toHaveBeenCalledWith('shop-logos', 'tenant-1/logo-1.png', 3600);

  mockSigned.mockClear();
  const none = await renderHook(() => useLogoUrl(null), { wrapper: wrap(makeClient()) });
  expect(none.result.current.fetchStatus).toBe('idle');
  expect(mockSigned).not.toHaveBeenCalled();
});
