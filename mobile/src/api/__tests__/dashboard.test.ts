import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockGte = jest.fn();
const mockChain: Record<string, unknown> = {};
mockChain.select = () => mockChain;
mockChain.gte = (c: string, v: unknown) => (mockGte(c, v), mockChain);
mockChain.order = (c: string, o: unknown) => (mockOrder(c, o), mockChain);
mockChain.limit = (n: number) => (mockLimit(n), Promise.resolve({ data: [], error: null }));
const mockFrom = jest.fn((_t: string) => mockChain);
jest.mock('../../lib/supabase', () => ({ supabase: { from: (t: string) => mockFrom(t) } }));

import { cairoDayStart } from '../../lib/date';
import { activityText, sortWorklist, useRecentActivity, type WorklistRow } from '../dashboard';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));

describe('activityText', () => {
  const base = { customer_id: 'u', customer_name: 'أحمد', contract_id: 'c', contract_no: 52, amount: 2000 };
  it('formats a sale with Cairo morning time', () => {
    // 08:42 UTC = 10:42 Cairo (UTC+2 in November)
    expect(activityText({ ...base, kind: 'sale', at: '2026-11-01T08:42:00Z' })).toEqual({
      title: 'فاتورة جديدة #52',
      sub: 'أحمد · 10:42 ص',
    });
  });
  it('formats a payment with Cairo afternoon time', () => {
    expect(activityText({ ...base, kind: 'payment', at: '2026-11-01T13:05:00Z' })).toEqual({
      title: 'دفعة 2,000.00 ج.م',
      sub: 'أحمد · 3:05 م',
    });
  });
  it('handles noon and midnight', () => {
    expect(activityText({ ...base, kind: 'sale', at: '2026-11-01T10:00:00Z' }).sub).toBe('أحمد · 12:00 م');
    expect(activityText({ ...base, kind: 'sale', at: '2026-10-31T22:30:00Z' }).sub).toBe('أحمد · 12:30 ص');
  });
});

describe('useRecentActivity', () => {
  it('orders by at desc and limits to 10', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const r = await renderHook(() => useRecentActivity(), { wrapper });
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledWith('v_recent_activity');
    expect(mockOrder).toHaveBeenCalledWith('at', { ascending: false });
    expect(mockLimit).toHaveBeenCalledWith(10);
  });

  it('only asks for events since Cairo midnight today', async () => {
    mockGte.mockClear();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);
    const r = await renderHook(() => useRecentActivity(10, new Date('2026-11-01T09:00:00Z')), { wrapper });
    await waitFor(() => expect(r.result.current.isSuccess).toBe(true));
    expect(mockGte).toHaveBeenCalledWith('at', '2026-10-31T22:00:00.000Z');
    mockGte.mockClear();
    const r2 = await renderHook(() => useRecentActivity(10, new Date('2026-07-15T09:00:00Z')), { wrapper });
    await waitFor(() => expect(r2.result.current.isSuccess).toBe(true));
    expect(mockGte).toHaveBeenCalledWith('at', '2026-07-14T21:00:00.000Z');
  });
});

describe('cairoDayStart', () => {
  it('is 22:00Z the day before in winter (UTC+2)', () => {
    expect(cairoDayStart(new Date('2026-11-01T09:00:00Z'))).toBe('2026-10-31T22:00:00.000Z');
    expect(cairoDayStart(new Date('2026-11-30T22:30:00Z'))).toBe('2026-11-30T22:00:00.000Z');
    expect(cairoDayStart(new Date('2026-11-30T21:30:00Z'))).toBe('2026-11-29T22:00:00.000Z');
  });
  it('is 21:00Z the day before in summer (UTC+3)', () => {
    expect(cairoDayStart(new Date('2026-07-15T09:00:00Z'))).toBe('2026-07-14T21:00:00.000Z');
    expect(cairoDayStart(new Date('2026-07-31T21:30:00Z'))).toBe('2026-07-31T21:00:00.000Z');
    expect(cairoDayStart(new Date('2026-07-31T20:30:00Z'))).toBe('2026-07-30T21:00:00.000Z');
  });
});

const row = (o: Partial<WorklistRow>): WorklistRow => ({
  contract_id: 'c', customer_id: 'u', name: 'n', phone: '01012345678',
  installment_id: 'i', due_date: '2026-11-01', amount: 100, days_late: 0, status: 'pending', ...o,
});

describe('sortWorklist', () => {
  it('puts overdue first, largest days_late first, then due soonest', () => {
    const rows = [
      row({ installment_id: 'soon', due_date: '2026-11-02', days_late: -2 }),
      row({ installment_id: 'late5', due_date: '2026-10-26', days_late: 5 }),
      row({ installment_id: 'today', due_date: '2026-10-31', days_late: 0 }),
      row({ installment_id: 'late20', due_date: '2026-10-11', days_late: 20 }),
    ];
    expect(sortWorklist(rows).map((r) => r.installment_id)).toEqual(['late20', 'late5', 'today', 'soon']);
  });

  it('puts null due dates / days_late last and does not mutate input', () => {
    const rows = [
      row({ installment_id: 'nul', due_date: null, days_late: null }),
      row({ installment_id: 'a', due_date: '2026-11-03', days_late: -3 }),
      row({ installment_id: 'b', due_date: '2026-11-01', days_late: -1 }),
    ];
    const copy = [...rows];
    expect(sortWorklist(rows).map((r) => r.installment_id)).toEqual(['b', 'a', 'nul']);
    expect(rows).toEqual(copy);
  });
});
