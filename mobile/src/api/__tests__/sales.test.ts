import { validateSale } from '../../lib/validation';
import {
  derivePreview,
  idForAttempt,
  isValidDate,
  normalizeDigits,
  parseAmount,
  sanitizeAmount,
  sanitizeRate,
  toCreateSalePayload,
  validateSaleForm,
  type SaleForm,
} from '../sales';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const base: SaleForm = {
  customerId: 'c1',
  productDesc: ' ثلاجة ',
  price: '25000',
  saleType: 'installment',
  down: '10000',
  rate: '30',
  years: 2,
  saleDate: '2026-11-01',
  invoiceNo: '',
  paymentMethod: 'cash',
};

test('installment payload carries installment keys', () => {
  expect(toCreateSalePayload(base, 'id-1')).toEqual({
    id: 'id-1',
    customer_id: 'c1',
    product_desc: 'ثلاجة',
    sale_type: 'installment',
    total_price: 25000,
    sale_date: '2026-11-01',
    external_invoice_no: null,
    payment_method: 'cash',
    down_payment: 10000,
    rate_percent: 30,
    years: 2,
  });
});

test('cash payload omits installment keys', () => {
  const p = toCreateSalePayload({ ...base, saleType: 'cash', invoiceNo: ' A1 ' }, 'id-2');
  expect(p.sale_type).toBe('cash');
  expect(p.external_invoice_no).toBe('A1');
  expect(p).not.toHaveProperty('down_payment');
  expect(p).not.toHaveProperty('rate_percent');
  expect(p).not.toHaveProperty('years');
});

test('validateSale rejects down >= price with the Arabic message', () => {
  const e = validateSale({ productDesc: 'x', totalPrice: 100, saleType: 'installment', down: 100, ratePercent: 10, years: 1 });
  expect(e.down).toBe('المقدم لازم يكون أقل من السعر');
});

test('derivePreview matches the spec example', () => {
  const p = derivePreview(base)!;
  expect(p.monthly).toBe(812.5);
  expect(p.count).toBe(24);
  expect(p.firstDue).toBe('2026-12-01');
  expect(p.financed).toBe(15000);
  expect(p.total).toBe(19500);
});

test('derivePreview is null for partial/invalid input and cash', () => {
  expect(derivePreview({ ...base, price: '' })).toBeNull();
  expect(derivePreview({ ...base, down: '30000' })).toBeNull();
  expect(derivePreview({ ...base, rate: '' })).toBeNull();
  expect(derivePreview({ ...base, saleDate: '2026-1-1' })).toBeNull();
  expect(derivePreview({ ...base, saleType: 'cash' })).toBeNull();
});

test('parseAmount and sanitizeRate', () => {
  expect(parseAmount('')).toBeNaN();
  expect(parseAmount('1,500.5')).toBe(1500.5);
  expect(sanitizeRate('12.345')).toBe('12.34');
  expect(sanitizeRate('1a2.5.6')).toBe('12.56');
});

test('isValidDate checks the calendar, not just the shape', () => {
  expect(isValidDate('2026-02-30')).toBe(false);
  expect(isValidDate('2026-13-01')).toBe(false);
  expect(isValidDate('2028-02-29')).toBe(true);
  expect(isValidDate('2026-02-29')).toBe(false);
});

test('derivePreview is null for an impossible date', () => {
  expect(derivePreview({ ...base, saleDate: '2026-02-30' })).toBeNull();
});

test('empty down in an installment form sends down_payment 0', () => {
  expect(toCreateSalePayload({ ...base, down: '' }, 'i')).toMatchObject({ down_payment: 0 });
});

test('years outside 1-5 are rejected and give no preview', () => {
  for (const years of [0, 6]) {
    expect(validateSaleForm({ ...base, years }).years).toBe('عدد السنين لازم يكون من 1 إلى 5');
    expect(derivePreview({ ...base, years })).toBeNull();
  }
});

test('amounts are limited to 2 decimals', () => {
  expect(sanitizeAmount('100.999')).toBe('100.99');
  expect(sanitizeAmount('1,0a0.5')).toBe('100.5');
});

test('Arabic-Indic digits are normalized everywhere', () => {
  expect(normalizeDigits('٢٠٢٦-١١-٠١')).toBe('2026-11-01');
  expect(sanitizeAmount('٢٥٠٠٠٫٥٥٥')).toBe('25000.55');
  expect(sanitizeRate('٣٠٫٥')).toBe('30.5');
  expect(parseAmount('١٠٠٠٠')).toBe(10000);
});

test('idForAttempt: same id for a pure retry, new id once the form changed after an attempt', () => {
  let n = 0;
  const gen = () => `new-${++n}`;
  const first = idForAttempt({ id: 'a', sig: null }, 'S1', gen);
  expect(first).toEqual({ id: 'a', sig: 'S1' });
  expect(idForAttempt(first, 'S1', gen).id).toBe('a');
  const edited = idForAttempt(first, 'S2', gen);
  expect(edited.id).toBe('new-1');
  expect(idForAttempt(edited, 'S2', gen).id).toBe('new-1');
});