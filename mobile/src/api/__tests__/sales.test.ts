import { validateSale } from '../../lib/validation';
import { derivePreview, parseAmount, sanitizeRate, toCreateSalePayload, type SaleForm } from '../sales';

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
