import { parsePaymentPrefill, parseSalePrefill } from '../prefill';

describe('parsePaymentPrefill', () => {
  it('passes valid values', () => {
    expect(parsePaymentPrefill({ amount: '500.5', method: 'instapay', contractId: 'c1' })).toEqual({
      amount: 500.5,
      method: 'instapay',
      contractId: 'c1',
    });
  });
  it('takes the first of array params', () => {
    expect(parsePaymentPrefill({ amount: ['10', '20'] })).toEqual({ amount: 10 });
  });
  it('drops invalid values', () => {
    expect(parsePaymentPrefill({ amount: '-5', method: 'bitcoin' })).toEqual({});
    expect(parsePaymentPrefill({ amount: '10000001' })).toEqual({});
    expect(parsePaymentPrefill({ amount: 'abc' })).toEqual({});
  });
  it('returns {} for missing params', () => {
    expect(parsePaymentPrefill({})).toEqual({});
  });
});

describe('parseSalePrefill', () => {
  it('passes valid installment values as form strings', () => {
    expect(
      parseSalePrefill({ product: 'تلاجة', price: '20000', type: 'installment', down: '5000', rate: '12', years: '2', ext: 'A1', newName: 'محمد' }),
    ).toEqual({
      productDesc: 'تلاجة',
      price: '20000',
      saleType: 'installment',
      down: '5000',
      rate: '12',
      years: 2,
      invoiceNo: 'A1',
      newName: 'محمد',
    });
  });
  it('drops out-of-range values', () => {
    expect(parseSalePrefill({ price: '1000', down: '1000', rate: '500', years: '9' })).toEqual({ price: '1000' });
  });
  it('cash drops installment fields', () => {
    expect(parseSalePrefill({ type: 'cash', price: '100', down: '10', rate: '5', years: '2' })).toEqual({
      saleType: 'cash',
      price: '100',
    });
  });
  it('limits ext and newName lengths', () => {
    expect(parseSalePrefill({ ext: 'x'.repeat(41), newName: 'y'.repeat(81) })).toEqual({});
  });
  it('drops bad type and returns {} for missing', () => {
    expect(parseSalePrefill({ type: 'barter' })).toEqual({});
    expect(parseSalePrefill({})).toEqual({});
  });
});
