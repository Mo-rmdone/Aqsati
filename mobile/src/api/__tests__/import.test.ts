import * as XLSX from 'xlsx';

import { IMPORT_COLUMNS, toImportRows, type ImportRow, type RawRow } from '../../lib/importRows';
import { buildTemplateWorkbook, markDuplicates, markNameConflicts, saveRows } from '../import';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const mockRpc = jest.fn();
const mockUpsert = jest.fn();
let mockExisting: { id: string } | null = null;

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: mockExisting, error: null }) }) }),
        }),
      }),
      upsert: (...a: unknown[]) => mockUpsert(...a),
    }),
  },
}));

const raw = (o: Partial<RawRow> = {}): RawRow => ({
  name: 'محمود', phone: '01012345678', nationalId: '', address: '', product: 'ثلاجة',
  total: '25000', down: '10000', monthly: '1000', paidMonths: '6', firstMonth: '2025-11',
  lastMonth: '', invoiceNo: '', ...o,
});
const rowsOf = (...raws: RawRow[]): ImportRow[] => toImportRows(raws);
const ctx = { tenantId: 't1' };

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: 'x', error: null });
  mockUpsert.mockReset().mockResolvedValue({ error: null });
  mockExisting = null;
});

test('markDuplicates marks and skips only the matching row', () => {
  const rows = rowsOf(raw(), raw({ phone: '01112345678' }));
  const out = markDuplicates(rows, [
    { phone: '01012345678', product: 'ثلاجة', total: 25000, firstDue: '2025-11-01' },
  ]);
  expect(out.map((r) => [r.duplicate, r.skip])).toEqual([[true, true], [false, false]]);
});

test('markNameConflicts warns on same phone with different names', () => {
  const out = markNameConflicts(rowsOf(raw(), raw({ name: 'أحمد' }), raw({ phone: '01112345678' })));
  expect(out[0].warnings).toContain('نفس الموبايل بأسماء مختلفة');
  expect(out[1].warnings).toContain('نفس الموبايل بأسماء مختلفة');
  expect(out[2].warnings).not.toContain('نفس الموبايل بأسماء مختلفة');
});

test('saveRows skips rows with errors or skip', async () => {
  const rows = rowsOf(raw(), raw({ phone: 'bad' }), raw({ phone: '01112345678' }));
  rows[2] = { ...rows[2], skip: true };
  const out = await saveRows(rows, jest.fn(), ctx);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(out.map((r) => r.status)).toEqual(['saved', 'pending', 'pending']);
});

test('saveRows creates the customer once and sends the RPC payload', async () => {
  const rows = rowsOf(raw(), raw({ product: 'غسالة' }));
  const onProgress = jest.fn();
  await saveRows(rows, onProgress, ctx);
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  expect(mockUpsert.mock.calls[0][0]).toMatchObject({ id: rows[0].customerId, tenant_id: 't1', phone: '01012345678' });
  const p = mockRpc.mock.calls[0][1].p;
  expect(mockRpc.mock.calls[0][0]).toBe('import_contract');
  expect(p).toMatchObject({
    id: rows[0].id, customer_id: rows[0].customerId, product_desc: 'ثلاجة', total_price: 25000,
    down_payment: 10000, monthly: 1000, first_due: '2025-11-01', paid_months: 6, external_invoice_no: null,
  });
  expect(onProgress).toHaveBeenLastCalledWith(2, 2);
});

test('existing customer by phone is used instead of creating', async () => {
  mockExisting = { id: 'existing-1' };
  const rows = rowsOf(raw(), raw({ product: 'غسالة' }));
  await saveRows(rows, jest.fn(), ctx);
  expect(mockUpsert).not.toHaveBeenCalled();
  expect(mockRpc.mock.calls.map((c) => c[1].p.customer_id)).toEqual(['existing-1', 'existing-1']);
});

test('retry reuses ids and does not resend saved rows', async () => {
  const rows = rowsOf(raw(), raw({ product: 'غسالة' }));
  mockRpc
    .mockResolvedValueOnce({ data: 'x', error: null })
    .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
  const first = await saveRows(rows, jest.fn(), ctx);
  expect(first.map((r) => r.status)).toEqual(['saved', 'failed']);
  expect(first[1].failure).toBe('تعذر حفظ العقد، حاول مرة تانية');
  mockRpc.mockClear();
  const second = await saveRows(first, jest.fn(), ctx);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls[0][1].p.id).toBe(rows[1].id);
  expect(second.map((r) => r.status)).toEqual(['saved', 'saved']);
});

test('Arabic server messages pass through; thrown errors never escape', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'العميل مش تابع للمحل' } });
  const out = await saveRows(rowsOf(raw()), jest.fn(), ctx);
  expect(out[0]).toMatchObject({ status: 'failed', failure: 'العميل مش تابع للمحل' });
  mockRpc.mockRejectedValueOnce(new Error('network'));
  const out2 = await saveRows(rowsOf(raw()), jest.fn(), ctx);
  expect(out2[0].status).toBe('failed');
});

test('template first sheet headers equal IMPORT_COLUMNS order', () => {
  const wb = buildTemplateWorkbook();
  const first = wb.Sheets[wb.SheetNames[0]];
  const m = XLSX.utils.sheet_to_json(first, { header: 1, raw: true }) as unknown[][];
  expect(m[0]).toEqual(IMPORT_COLUMNS.map((c) => c.header));
  expect(m[1]).toHaveLength(12);
  expect(wb.SheetNames[1]).toBe('تعليمات');
});
