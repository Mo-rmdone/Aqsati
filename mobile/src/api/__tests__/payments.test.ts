import {
  editableContracts,
  isOpeningBalance,
  isPaymentEditable,
  openInstallmentContracts,
  paymentSpreadText,
  toPaymentLines,
} from '../payments';

describe('paymentSpreadText', () => {
  test('one line shows only the invoice number', () => {
    expect(paymentSpreadText([{ contract_no: 41, amount: 1000 }])).toBe('#41');
  });
  test('several lines show each invoice with its amount', () => {
    expect(
      paymentSpreadText([
        { contract_no: 41, amount: 1000 },
        { contract_no: 33, amount: 1000 },
      ]),
    ).toBe('#41: 1,000.00 · #33: 1,000.00');
  });
});

const bal = (id: string, remaining: number | null, sale_type = 'installment') =>
  ({ contract_id: id, remaining, sale_type, product_desc: `p${id}`, contract_no: 7 }) as never;

describe('editableContracts', () => {
  test('own contract gets remaining + line; other open contract gets its remaining', () => {
    const r = editableContracts([{ contract_id: 'a', amount: 100 }], [bal('a', 50), bal('b', 70)]);
    expect(r.map((x) => [x.contractId, x.remaining])).toEqual([['a', 150], ['b', 70]]);
  });
  test('settled own contract still appears with remaining = line; settled/cash/unknown others excluded', () => {
    const r = editableContracts(
      [{ contract_id: 'a', amount: 100 }],
      [bal('a', 0), bal('b', 0), bal('c', null), bal('d', 5, 'cash')],
    );
    expect(r.map((x) => [x.contractId, x.remaining])).toEqual([['a', 100]]);
  });
  test('null remaining on own contract falls back to the line amount', () => {
    expect(editableContracts([{ contract_id: 'a', amount: 40 }], [bal('a', null)])[0].remaining).toBe(40);
  });
  test('payment contract missing from balances throws', () => {
    expect(() => editableContracts([{ contract_id: 'zz', amount: 1 }], [bal('a', 5)])).toThrow();
  });
});

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

const row = (id: string, remaining: number | null, sale_type = 'installment') =>
  ({ contract_id: id, remaining, sale_type, product_desc: id, contract_no: 1 }) as never;

test('open contracts: installment with known remaining > 0 only; preferred first', () => {
  const rows = [row('a', 100), row('b', 0), row('c', null), row('d', 50, 'cash'), row('e', 70)];
  expect(openInstallmentContracts(rows).map((r) => r.contract_id)).toEqual(['a', 'e']);
  expect(openInstallmentContracts(rows, 'e').map((r) => r.contract_id)).toEqual(['e', 'a']);
  expect(openInstallmentContracts(rows, 'b').map((r) => r.contract_id)).toEqual(['a', 'e']);
});

test('payload keeps only positive lines with numeric amounts', () => {
  expect(
    toPaymentLines([
      { contractId: 'a', amount: 10.5 },
      { contractId: 'b', amount: 0 },
    ]),
  ).toEqual([{ contract_id: 'a', amount: 10.5 }]);
});

test('editable only when every line is an installment line', () => {
  expect(isPaymentEditable([{ kind: 'installment' }, { kind: 'installment' }])).toBe(true);
  expect(isPaymentEditable([{ kind: 'installment' }, { kind: 'cash' }])).toBe(false);
  expect(isPaymentEditable([{ kind: 'down_payment' }])).toBe(false);
  expect(isPaymentEditable([])).toBe(false);
});

describe('isOpeningBalance', () => {
  test('only opening payments made of installment lines', () => {
    expect(isOpeningBalance(true, [{ kind: 'installment' }])).toBe(true);
    expect(isOpeningBalance(true, [{ kind: 'down_payment' }])).toBe(false);
    expect(isOpeningBalance(true, [{ kind: 'installment' }, { kind: 'down_payment' }])).toBe(false);
    expect(isOpeningBalance(false, [{ kind: 'installment' }])).toBe(false);
    expect(isOpeningBalance(true, [])).toBe(false);
  });
});
