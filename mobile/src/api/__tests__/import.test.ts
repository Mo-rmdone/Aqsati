import * as XLSX from 'xlsx';

import { IMPORT_COLUMNS, toImportRows, type ImportRow, type RawRow } from '../../lib/importRows';
import {
  applyRowEdit, buildTemplateWorkbook, fetchExistingImports, findExistingCustomers, markDuplicates, markNameConflicts,
  readSpreadsheet, saveRows,
} from '../import';

jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

const mockRpc = jest.fn();
const mockUpsert = jest.fn();
const mockLookup = jest.fn();
const mockRange = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (table: string) =>
      table === 'contract'
        ? {
            select: () => ({
              eq: () => ({ eq: () => ({ order: () => ({ range: (...a: unknown[]) => mockRange(...a) }) }) }),
            }),
          }
        : {
            select: () => ({
              eq: (...e: unknown[]) => ({
                in: (...i: unknown[]) => ({ order: async () => mockLookup(e, i) }),
              }),
            }),
            upsert: (...a: unknown[]) => mockUpsert(...a),
          },
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
  mockLookup.mockReset().mockResolvedValue({ data: [], error: null });
  mockRange.mockReset();
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
  mockLookup.mockResolvedValue({ data: [{ id: 'existing-1', name: 'قديم', phone: '01012345678' }], error: null });
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
  expect(mockUpsert).toHaveBeenCalledTimes(1);
  mockRpc.mockClear();
  mockLookup.mockResolvedValue({
    data: [{ id: rows[0].customerId, name: 'محمود', phone: '01012345678' }],
    error: null,
  }); // created on first run
  const second = await saveRows(first, jest.fn(), ctx);
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc.mock.calls[0][1].p.id).toBe(rows[1].id);
  expect(mockUpsert).toHaveBeenCalledTimes(1); // customer not re-created on retry
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

test('a customer upsert error becomes the generic Arabic message', async () => {
  mockUpsert.mockResolvedValueOnce({ error: { message: 'permission denied' } });
  const out = await saveRows(rowsOf(raw()), jest.fn(), ctx);
  expect(out[0]).toMatchObject({ status: 'failed', failure: 'تعذر حفظ العقد، حاول مرة تانية' });
  expect(mockRpc).not.toHaveBeenCalled();
});

test('customer fields come from the first row of the phone group in file order', async () => {
  const rows = rowsOf(raw({ name: 'الأول', address: 'عنوان 1' }), raw({ name: 'التاني', address: 'عنوان 2', product: 'غسالة' }));
  rows[0] = { ...rows[0], skip: true }; // first row is not sent, its data still wins
  await saveRows(rows, jest.fn(), ctx);
  expect(mockUpsert.mock.calls[0][0]).toMatchObject({ name: 'الأول', address: 'عنوان 1', id: rows[0].customerId });
});

test('markDuplicates compares the month, trims product, tolerates string/number total', () => {
  const rows = rowsOf(raw({ firstMonth: '2025-11', product: ' ثلاجة ' }));
  const out = markDuplicates(rows, [
    { phone: '01012345678', product: 'ثلاجة', total: '25000' as unknown as number, firstDue: '2025-11-15' },
  ]);
  expect(out[0]).toMatchObject({ duplicate: true, skip: true });
  const other = markDuplicates(rows, [
    { phone: '01012345678', product: 'ثلاجة', total: 25000, firstDue: '2025-12-01' },
  ]);
  expect(other[0].duplicate).toBe(false);
});

test('fetchExistingImports pages past the 1000-row cap', async () => {
  const mk = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      product_desc: `p${i}`, total_price: '100.00', customer: { phone: '01012345678' }, installment: [{ due_date: '2025-11-01' }],
    }));
  mockRange
    .mockResolvedValueOnce({ data: mk(1000), error: null })
    .mockResolvedValueOnce({ data: mk(5), error: null });
  const out = await fetchExistingImports();
  expect(out).toHaveLength(1005);
  expect(out[0]).toEqual({ phone: '01012345678', product: 'p0', total: 100, firstDue: '2025-11-01' });
  expect(mockRange.mock.calls).toEqual([[0, 999], [1000, 1999]]);
});

test('findExistingCustomers scopes by tenant and keeps the oldest per phone', async () => {
  mockLookup.mockResolvedValue({
    data: [
      { id: 'old', name: 'الأقدم', phone: '01012345678' },
      { id: 'new', name: 'الأحدث', phone: '01012345678' },
    ],
    error: null,
  });
  const m = await findExistingCustomers(['01012345678', '01012345678'], 't1');
  expect(m.get('01012345678')).toEqual({ id: 'old', name: 'الأقدم' });
  expect(mockLookup.mock.calls[0][0]).toEqual(['tenant_id', 't1']);
  expect(mockLookup.mock.calls[0][1]).toEqual(['phone', ['01012345678']]);
});

test('readSpreadsheet rejects files over 5 MB before parsing', async () => {
  const big = { arrayBuffer: async () => new ArrayBuffer(5 * 1024 * 1024 + 1) };
  await expect(readSpreadsheet(big)).rejects.toThrow('الملف كبير جدًا (أقصى حجم 5 ميجا)');
});

test('readSpreadsheet throws the Arabic message on an unreadable buffer', async () => {
  const spy = jest.spyOn(XLSX, 'read').mockImplementationOnce(() => {
    throw new Error('bad zip');
  });
  await expect(readSpreadsheet({ arrayBuffer: async () => new ArrayBuffer(8) })).rejects.toThrow(
    'تعذر قراية الملف، اتأكد إنه xlsx أو csv',
  );
  spy.mockRestore();
});

test('readSpreadsheet reads a real workbook as raw values and caps at 502 rows', async () => {
  const aoa = [['a', 'b'], ...Array.from({ length: 600 }, (_, i) => [i, 'x'])];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'S');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const m = await readSpreadsheet({ arrayBuffer: async () => bytes });
  expect(m).toHaveLength(502);
  expect(m[1]).toEqual([0, 'x']);
});

test('template first sheet headers equal IMPORT_COLUMNS order', () => {
  const wb = buildTemplateWorkbook();
  const first = wb.Sheets[wb.SheetNames[0]];
  const m = XLSX.utils.sheet_to_json(first, { header: 1, raw: true }) as unknown[][];
  expect(m[0]).toEqual(IMPORT_COLUMNS.map((c) => c.header));
  expect(m[1]).toHaveLength(12);
  expect(wb.SheetNames[1]).toBe('تعليمات');
});

describe('applyRowEdit', () => {
  const dup = [{ phone: '01012345678', product: 'ثلاجة', total: 25000, firstDue: '2025-11-01' }];

  test('re-validates the edited row, keeps its id, regroups by phone', () => {
    const rows = rowsOf(raw(), raw({ phone: '01112345678' }));
    const out = applyRowEdit(rows, rows[1].id, { phone: '01012345678' }, []);
    expect(out[1].id).toBe(rows[1].id);
    expect(out[1].raw.phone).toBe('01012345678');
    expect(out[1].customerId).toBe(out[0].customerId);
    const bad = applyRowEdit(out, rows[1].id, { monthly: '0' }, []);
    expect(bad[1].errors.length).toBeGreaterThan(0);
    expect(bad[1].computed).toBeNull();
    expect(applyRowEdit(bad, rows[1].id, { monthly: '1000' }, [])[1].errors).toEqual([]);
  });

  test('duplicate flag follows the edit; name conflict warning is recomputed', () => {
    const rows = markDuplicates(rowsOf(raw()), dup);
    expect(rows[0].skip).toBe(true);
    const moved = applyRowEdit(rows, rows[0].id, { product: 'غسالة' }, dup);
    expect(moved[0].duplicate).toBe(false);
    expect(moved[0].skip).toBe(false);
    const back = applyRowEdit(moved, rows[0].id, { product: 'ثلاجة' }, dup);
    expect(back[0].duplicate).toBe(true);

    const two = markNameConflicts(rowsOf(raw(), raw({ name: 'أحمد' })));
    expect(two[0].warnings.length).toBe(1);
    const fixed = applyRowEdit(two, two[1].id, { name: 'محمود' }, []);
    expect(fixed[0].warnings).toEqual([]);
    expect(fixed[1].warnings).toEqual([]);
  });

  test('an untouched duplicate keeps the user untick', () => {
    const rows = markDuplicates(rowsOf(raw(), raw({ phone: '01112345678' })), dup);
    const unticked = rows.map((r, i) => (i === 0 ? { ...r, skip: false } : r));
    const out = applyRowEdit(unticked, rows[1].id, { address: 'x' }, dup);
    expect(out[0].skip).toBe(false);
    expect(out[0].duplicate).toBe(true);
  });
});
