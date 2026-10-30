import { validateCustomer, validateSale } from '../validation';

describe('validateCustomer', () => {
  const ok = { name: 'أحمد', phone: '01012345678' };
  test('valid', () => {
    expect(validateCustomer(ok)).toEqual({});
    expect(validateCustomer({ ...ok, nationalId: '29001011234567' })).toEqual({});
    expect(validateCustomer({ ...ok, nationalId: '' })).toEqual({});
  });
  test('bad phone', () => {
    expect(validateCustomer({ ...ok, phone: '0123' }).phone).toBeTruthy();
    expect(validateCustomer({ ...ok, phone: '02012345678' }).phone).toBeTruthy();
  });
  test('bad national id', () => {
    expect(validateCustomer({ ...ok, nationalId: '123' }).nationalId).toBeTruthy();
  });
  test('empty name', () => {
    expect(validateCustomer({ ...ok, name: '  ' }).name).toBeTruthy();
  });
});

describe('validateSale', () => {
  const ok = {
    productDesc: 'ثلاجة',
    totalPrice: 25000,
    saleType: 'installment' as const,
    down: 10000,
    ratePercent: 30,
    years: 2,
  };
  test('valid', () => {
    expect(validateSale(ok)).toEqual({});
    expect(validateSale({ ...ok, saleType: 'cash', down: 0, ratePercent: 0, years: 0 })).toEqual({});
  });
  test('server-matching messages', () => {
    expect(validateSale({ ...ok, productDesc: ' ' }).productDesc).toBe('اسم المنتج مطلوب');
    expect(validateSale({ ...ok, totalPrice: 0 }).totalPrice).toBe('السعر لازم يكون أكبر من صفر');
    expect(validateSale({ ...ok, down: 25000 }).down).toBe('المقدم لازم يكون أقل من السعر');
    expect(validateSale({ ...ok, down: -1 }).down).toBe('المقدم لازم يكون أقل من السعر');
    expect(validateSale({ ...ok, ratePercent: 201 }).ratePercent).toBe('نسبة الفائدة لازم تكون بين 0 و 200');
    expect(validateSale({ ...ok, years: 6 }).years).toBe('عدد السنين لازم يكون من 1 إلى 5');
    expect(validateSale({ ...ok, years: 1.5 }).years).toBe('عدد السنين لازم يكون من 1 إلى 5');
  });
});
