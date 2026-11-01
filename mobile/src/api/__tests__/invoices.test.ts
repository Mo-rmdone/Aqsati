import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

const mockEq = jest.fn();
const mockIlike = jest.fn();
const mockGte = jest.fn();
const mockLte = jest.fn();
let mockRows: unknown[] = [];
const mockChain: Record<string, unknown> = {};
mockChain.select = () => mockChain;
mockChain.order = () => mockChain;
mockChain.eq = (c: string, v: unknown) => (mockEq(c, v), mockChain);
mockChain.ilike = (c: string, v: unknown) => (mockIlike(c, v), mockChain);
mockChain.gte = (c: string, v: unknown) => (mockGte(c, v), mockChain);
mockChain.lte = (c: string, v: unknown) => (mockLte(c, v), mockChain);
mockChain.limit = () => Promise.resolve({ data: mockRows, error: null });
const mockFrom = jest.fn((_t: string) => mockChain);

jest.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { dateRange, useInvoices, type InvoiceQuery } from '../invoices';
import { invoiceStatusChip } from '../../lib/status';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));
beforeEach(() => {
  mockEq.mockClear();
  mockIlike.mockClear();
  mockGte.mockClear();
  mockLte.mockClear();
  mockFrom.mockClear();
  mockRows = [];
});

const base: InvoiceQuery = { search: '', date: 'all', type: 'all', status: 'all' };

async function run(q: Partial<InvoiceQuery>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const r = await renderHook(() => useInvoices({ ...base, ...q }), { wrapper });
  await waitFor(() => expect(r.result.current.isSuccess).toBe(true));
  return r.result.current.data!;
}

test('dateRange', () => {
  expect(dateRange('month', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
  expect(dateRange('month', '2024-02-10')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(dateRange('today', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
  expect(dateRange('all', '2026-11-15')).toEqual({});
  expect(dateRange({ from: '2026-01-01', to: '2026-01-31' }, 'x')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
});

test('numeric search matches contract_no exactly (Arabic digits normalised) plus text columns', async () => {
  await run({ search: '٤١' });
  expect(mockFrom).toHaveBeenCalledWith('v_invoice_list');
  expect(mockEq).toHaveBeenCalledWith('contract_no', 41);
  expect(mockIlike).toHaveBeenCalledWith('external_invoice_no', '41%');
  expect(mockIlike).toHaveBeenCalledWith('product_desc', '%41%');
  expect(mockIlike).toHaveBeenCalledWith('customer_name', '%41%');
});

test('non-numeric search only runs the text calls, with the escaped pattern', async () => {
  await run({ search: 'تلا_جة%' });
  expect(mockIlike).toHaveBeenCalledWith('product_desc', '%تلا\\_جة\\%%');
  expect(mockIlike).toHaveBeenCalledWith('customer_name', '%تلا\\_جة\\%%');
  expect(mockIlike).toHaveBeenCalledTimes(2);
  expect(mockEq).not.toHaveBeenCalledWith('contract_no', expect.anything());
});

test('every search call gets the same filters', async () => {
  await run({ search: '41', status: 'late', type: 'cash', date: { from: '2026-01-01', to: '2026-01-31' } });
  expect(mockEq.mock.calls.filter((c) => c[0] === 'status')).toHaveLength(4);
  expect(mockEq.mock.calls.filter((c) => c[0] === 'sale_type')).toHaveLength(4);
  expect(mockGte).toHaveBeenCalledTimes(4);
  expect(mockLte).toHaveBeenCalledTimes(4);
  expect(mockEq).toHaveBeenCalledWith('status', 'late');
  expect(mockEq).toHaveBeenCalledWith('sale_type', 'cash');
  expect(mockGte).toHaveBeenCalledWith('sale_date', '2026-01-01');
  expect(mockLte).toHaveBeenCalledWith('sale_date', '2026-01-31');
});

test('merges by contract_id (newest first) and totals the loaded rows', async () => {
  mockRows = [
    { contract_id: 'b', contract_no: 1, total_payable: 50 },
    { contract_id: 'a', contract_no: 2, total_payable: 100 },
  ];
  const d = await run({ search: '2' });
  expect(d.rows.map((r) => r.contract_id)).toEqual(['a', 'b']);
  expect(d.count).toBe(2);
  expect(d.total).toBe(150);
  expect(d.capped).toBe(false);
});

test('hitting the 100-row limit marks the result as capped', async () => {
  mockRows = Array.from({ length: 100 }, (_, i) => ({ contract_id: `c${i}`, contract_no: i, total_payable: 10 }));
  const d = await run({});
  expect(d.count).toBe(100);
  expect(d.capped).toBe(true);
});

test('a row with remaining null and unknown status maps to the unknown chip', () => {
  expect(invoiceStatusChip(null).label).toBe('غير معروف');
});
