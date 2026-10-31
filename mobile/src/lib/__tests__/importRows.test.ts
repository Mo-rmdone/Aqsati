jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `id-${++n}` };
});

import {
  computeContract,
  parseAmount,
  parseMonth,
  normalizePhone,
  regroupCustomers,
  rowsFromSheet,
  toImportRows,
  validateRow,
  type RawRow,
} from '../importRows';

const TODAY = '2026-10-31';
const base: RawRow = {
  name: 'محمود', phone: '01012345678', nationalId: '', address: '', product: 'ثلاجة',
  total: '25000', down: '10000', monthly: '1000', paidMonths: '6', firstMonth: '2025-11', lastMonth: '', invoiceNo: '',
};

describe('computeContract', () => {
  it('even split', () => {
    expect(computeContract({ total: 25000, down: 10000, monthly: 1000, paidMonths: 6, firstDue: '2025-11-01' })).toEqual({
      total: 25000, down: 10000, monthly: 1000, remaining: 15000, count: 15, last: 1000, paidMonths: 6,
      alreadyPaid: 6000, left: 9000, firstDue: '2025-11-01', lastDue: '2027-01-01', saleDate: '2025-10-01',
    });
  });
  it('uneven last installment', () => {
    const c = computeContract({ total: 25500, down: 10000, monthly: 1000, paidMonths: 6, firstDue: '2025-11-01' });
    expect(c.count).toBe(16);
    expect(c.last).toBe(500);
  });
  it('clamps month ends', () => {
    const c = computeContract({ total: 4000, down: 1000, monthly: 1000, paidMonths: 0, firstDue: '2026-01-31' });
    expect(c.saleDate).toBe('2025-12-31');
    expect(c.lastDue).toBe('2026-03-31');
    const d = computeContract({ total: 5000, down: 1000, monthly: 1000, paidMonths: 0, firstDue: '2026-01-31' });
    expect(d.lastDue).toBe('2026-04-30');
  });
  it('caps already paid at remaining', () => {
    const c = computeContract({ total: 2500, down: 0, monthly: 1000, paidMonths: 3, firstDue: '2026-01-01' });
    expect(c.alreadyPaid).toBe(2500);
    expect(c.left).toBe(0);
  });
});

describe('parsing', () => {
  it('parseAmount', () => {
    expect(parseAmount('٢٥٬٠٠٠')).toBe(25000);
    expect(parseAmount('25,000 ج.م')).toBe(25000);
    expect(parseAmount(' 1000 ')).toBe(1000);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });
  it('parseMonth', () => {
    expect(parseMonth('2025-11')).toBe('2025-11-01');
    expect(parseMonth('11/2025')).toBe('2025-11-01');
    expect(parseMonth('2025-11-15')).toBe('2025-11-15');
    expect(parseMonth('15/11/2025')).toBe('2025-11-15');
    expect(parseMonth('45962')).toBe('2025-11-01');
    expect(parseMonth('٢٠٢٥-١١')).toBe('2025-11-01');
    expect(parseMonth('2025-13')).toBeNull();
    expect(parseMonth('hello')).toBeNull();
  });
});

describe('validateRow', () => {
  const v = (o: Partial<RawRow>) => validateRow({ ...base, ...o }, TODAY);
  it('accepts a good row', () => {
    const r = v({});
    expect(r.errors).toEqual([]);
    expect(r.computed?.count).toBe(15);
  });
  it('bad phone', () => expect(v({ phone: '123' }).errors).toContain('رقم الموبايل غير صحيح'));
  it('down >= total', () => expect(v({ down: '25000' }).errors).toContain('المقدم لازم يكون أقل من المبلغ الكلي'));
  it('monthly > remaining', () =>
    expect(v({ monthly: '16000' }).errors).toContain('القسط الشهري لازم يكون أكبر من صفر ومش أكبر من الباقي'));
  it('paid > count', () => expect(v({ paidMonths: '16' }).errors).toContain('عدد الشهور المدفوعة أكبر من عدد الأقساط'));
  it('future first month', () => expect(v({ firstMonth: '2026-12' }).errors).toContain('أول شهر اتدفع بعيد في المستقبل'));
  it('next month is fine', () => expect(v({ firstMonth: '2026-11-30' }).errors).toEqual([]));
  it('too many installments', () =>
    expect(v({ monthly: '1', total: '100000', down: '0' }).errors).toContain('عدد الأقساط كبير جدًا، راجع القسط الشهري'));
  it('missing required', () => {
    const r = v({ name: '', product: '' });
    expect(r.errors).toEqual(expect.arrayContaining(['اسم العميل مطلوب', 'السلعة مطلوبة']));
    expect(r.computed).toBeNull();
  });
  it('last month mismatch warns', () => {
    const r = v({ lastMonth: '2026-03' });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toContain('الشهور المدفوعة مش متطابقة مع أول وآخر شهر');
    expect(v({ lastMonth: '2026-04' }).warnings).toEqual([]);
  });
});

describe('rowsFromSheet', () => {
  const headers = ['اسم العميل', 'الموبايل', 'الرقم القومي', 'العنوان', 'السلعة', 'المبلغ الكلي', 'المقدم',
    'القسط الشهري', 'عدد الشهور المدفوعة', 'أول شهر اتدفع', 'آخر شهر اتدفع', 'رقم الفاتورة'];
  it('maps arabic headers, skips empty rows, stringifies', () => {
    const { rows, error } = rowsFromSheet([
      headers.map((h) => ` ${h} `),
      ['أحمد', '01012345678', '', '', 'تلاجة', 25000, 10000, 1000, 6, '2025-11', '', ''],
      [null, '', '', '', '', '', '', '', '', '', '', ''],
    ]);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe('25000');
    expect(rows[0].name).toBe('أحمد');
  });
  it('missing required header', () => {
    const { error } = rowsFromSheet([headers.filter((h) => h !== 'الموبايل')]);
    expect(error).toContain('الموبايل');
  });
  it('english aliases', () => {
    const { rows, error } = rowsFromSheet([
      ['name', 'phone', 'national_id', 'address', 'product', 'total', 'down', 'monthly', 'paid_months', 'first_month', 'last_month', 'invoice_no'],
      ['A', '01012345678', '', '', 'p', '100', '0', '10', '1', '2026-01', '', ''],
    ]);
    expect(error).toBeUndefined();
    expect(rows[0].phone).toBe('01012345678');
  });
  it('rejects > 500 rows', () => {
    const data = Array.from({ length: 501 }, () => ['A', '01012345678', '', '', 'p', '100', '0', '10', '1', '2026-01', '', '']);
    expect(rowsFromSheet([headers, ...data]).error).toBe('الملف فيه أكتر من 500 عقد');
  });
});

describe('review fixes', () => {
  const hdr = ['اسم العميل', 'الموبايل', 'الرقم القومي', 'العنوان', 'السلعة', 'المبلغ الكلي', 'المقدم',
    'القسط الشهري', 'عدد الشهور المدفوعة', 'أول شهر اتدفع', 'آخر شهر اتدفع', 'رقم الفاتورة'];
  it('Date cells use local parts', () => {
    const { rows } = rowsFromSheet([hdr, ['A', '01012345678', '', '', 'p', 100, 0, 10, 1, new Date(2025, 10, 1), '', '']]);
    expect(rows[0].firstMonth).toBe('2025-11-01');
  });
  it('parseAmount extra tokens and edge cases', () => {
    expect(parseAmount('25،000')).toBe(25000);
    expect(parseAmount('25000 EGP')).toBe(25000);
    expect(parseAmount('25000 جنيه')).toBe(25000);
    expect(parseAmount('25000 L.E')).toBe(25000);
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('1.5')).toBe(1.5);
  });
  it('warns on dot thousands', () => {
    const w = 'اتأكد من المبلغ: النقطة هنا ممكن تكون فاصل آلاف';
    expect(validateRow({ ...base, total: '25.000' }, TODAY).warnings).toContain(w);
    expect(validateRow({ ...base, monthly: '1.500' }, TODAY).warnings).toContain(w);
    expect(validateRow({ ...base, monthly: '1.5' }, TODAY).warnings).not.toContain(w);
  });
  it('normalizePhone', () => {
    for (const p of ['1012345678', '+201012345678', '010-1234-5678', '٠١٠١٢٣٤٥٦٧٨', '0020 101 234 5678'])
      expect(normalizePhone(p)).toBe('01012345678');
  });
  it('validateRow accepts normalizable phone; grouping uses it', () => {
    expect(validateRow({ ...base, phone: '1012345678' }, TODAY).errors).toEqual([]);
    const rows = toImportRows([{ ...base, phone: '+20 101 234 5678' }, base]);
    expect(rows[0].customerId).toBe(rows[1].customerId);
  });
  it('regroupCustomers', () => {
    const rows = toImportRows([base, base, { ...base, phone: '01112345678' }]);
    const [a1, a2, b] = rows;
    const out = regroupCustomers(rows.map((r) => (r === b ? { ...r, raw: { ...r.raw, phone: base.phone } } : r)));
    expect(out[2].customerId).toBe(a1.customerId);
    expect(out[0].customerId).toBe(a1.customerId);
    expect(out[1].customerId).toBe(a2.customerId);
    const away = regroupCustomers(rows.map((r) => (r === a2 ? { ...r, raw: { ...r.raw, phone: '01212345678' } } : r)));
    expect(away[0].customerId).toBe(a1.customerId);
    expect(away[1].customerId).not.toBe(a1.customerId);
  });
  it('regroupCustomers: unchanged group keeps its id when a row moves out first', () => {
    const rows = toImportRows([base, base, base, base, base]);
    const Y = rows[0].customerId;
    const moved = rows.map((r, i) => (i === 0 ? { ...r, raw: { ...r.raw, phone: '01112345678' } } : r));
    const out = regroupCustomers(moved);
    for (const r of out.slice(1)) expect(r.customerId).toBe(Y);
    expect(out[0].customerId).not.toBe(Y);
  });
  it('dot-thousands warning sees suffixed and down cells', () => {
    const w = 'اتأكد من المبلغ: النقطة هنا ممكن تكون فاصل آلاف';
    expect(validateRow({ ...base, total: '25.000 ج.م' }, TODAY).warnings).toContain(w);
    expect(validateRow({ ...base, total: '25.000 EGP' }, TODAY).warnings).toContain(w);
    expect(validateRow({ ...base, down: '10.000' }, TODAY).warnings).toContain(w);
  });
  it('computeContract extra cases', () => {
    const c = computeContract({ total: 25500, down: 10000, monthly: 1000, paidMonths: 3, firstDue: '2025-11-01' });
    expect(c.alreadyPaid).toBe(3000);
    expect(c.left).toBe(12500);
    expect(c.last).toBe(500);
    expect(computeContract({ total: 4000, down: 1000, monthly: 1000, paidMonths: 0, firstDue: '2026-03-31' }).saleDate).toBe('2026-02-28');
  });
  it('parseMonth rejects bare numbers', () => {
    expect(parseMonth('2025')).toBeNull();
    expect(parseMonth('1000')).toBeNull();
  });
});

describe('toImportRows', () => {
  it('shares customerId by phone and has unique row ids', () => {
    const rows = toImportRows([base, { ...base, phone: '٠١٠١٢٣٤٥٦٧٨' }, { ...base, phone: '01112345678' }]);
    expect(rows[0].customerId).toBe(rows[1].customerId);
    expect(rows[0].customerId).not.toBe(rows[2].customerId);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(rows[0]).toMatchObject({ status: 'pending', skip: false, duplicate: false });
  });
});
