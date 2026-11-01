import { customerRowTarget, parseCustomersParams } from '../customersParams';

test('parseCustomersParams', () => {
  expect(parseCustomersParams({})).toEqual({ q: '', picking: false });
  expect(parseCustomersParams({ q: 'محمد', pick: 'payment' })).toEqual({ q: 'محمد', picking: true });
  expect(parseCustomersParams({ q: ['أحمد'], pick: 'other' })).toEqual({ q: 'أحمد', picking: false });
});

test('a changed q yields a new seed term', () => {
  expect(parseCustomersParams({ q: 'أحمد' }).q).not.toBe(parseCustomersParams({ q: 'محمد' }).q);
});

test('customerRowTarget: picking routes to payment and clears pick', () => {
  expect(customerRowTarget(true, 'u1')).toEqual({ path: '/payment/new?customerId=u1', clearPick: true });
  expect(customerRowTarget(false, 'u1')).toEqual({ path: '/customers/u1', clearPick: false });
});
