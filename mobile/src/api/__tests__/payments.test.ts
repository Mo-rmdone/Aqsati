import {
  deriveInvoiceStatus,
  editableContracts,
  overdueAmount,
  installmentWindow,
  interestText,
  isOpeningBalance,
  isPaymentEditable,
  openInstallmentContracts,
  payableInOrder,
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

test('payable order: oldest invoice first, the chosen one ahead of all', () => {
  const numbered = (id: string, no: number, remaining: number | null = 100) =>
    ({ contract_id: id, remaining, sale_type: 'installment', product_desc: id, contract_no: no }) as never;
  const rows = [numbered('new', 9), numbered('old', 2), numbered('mid', 5), numbered('paid', 1, 0)];
  expect(payableInOrder(rows).map((r) => r.contract_id)).toEqual(['old', 'mid', 'new']);
  expect(payableInOrder(rows, 'new').map((r) => r.contract_id)).toEqual(['new', 'old', 'mid']);
  expect(payableInOrder(rows, 'paid').map((r) => r.contract_id)).toEqual(['old', 'mid', 'new']);
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

const inst = (n: number, paid: boolean) => ({
  seq_no: n,
  due_date: `2026-${String(n).padStart(2, '0')}-10`,
  amount_due: 100,
  amount_paid: paid ? 100 : 0,
});

describe('installmentWindow', () => {
  const list = (paidCount: number, total = 24) => Array.from({ length: total }, (_, i) => inst(i + 1, i < paidCount));

  test('starts at the last paid installment before the first open one', () => {
    const w = installmentWindow(list(9), '2026-11-05');
    expect(w.rows.map((r) => r.seq_no)).toEqual([9, 10, 11, 12]);
    expect(w.hiddenCount).toBe(20);
  });
  test('all paid shows the last four', () => {
    const w = installmentWindow(list(24), '2026-11-05');
    expect(w.rows.map((r) => r.seq_no)).toEqual([21, 22, 23, 24]);
    expect(w.hiddenCount).toBe(20);
  });
  test('nothing paid starts at the beginning', () => {
    expect(installmentWindow(list(0), '2026-01-01').rows.map((r) => r.seq_no)).toEqual([1, 2, 3, 4]);
  });
  test('open near the end is clamped so the window stays full', () => {
    expect(installmentWindow(list(23), '2026-01-01').rows.map((r) => r.seq_no)).toEqual([21, 22, 23, 24]);
  });
  test('fewer than size shows all', () => {
    const w = installmentWindow(list(1, 3), '2026-01-01');
    expect(w.rows).toHaveLength(3);
    expect(w.hiddenCount).toBe(0);
  });
});

describe('overdue and derived status', () => {
  const rows = [
    { due_date: '2026-01-10', amount_due: 100, amount_paid: 40 },
    { due_date: '2026-02-10', amount_due: 100, amount_paid: 100 },
    { due_date: '2026-12-10', amount_due: 100, amount_paid: 0 },
  ];
  test('overdue sums unpaid part of past-due rows only', () => {
    expect(overdueAmount(rows, '2026-11-05')).toBe(60);
    expect(overdueAmount(rows, '2026-01-10')).toBe(0);
  });
  test('status', () => {
    expect(deriveInvoiceStatus(null, rows, '2026-11-05')).toBe('unknown');
    expect(deriveInvoiceStatus(0, rows, '2026-11-05')).toBe('settled');
    expect(deriveInvoiceStatus(160, rows, '2026-11-05')).toBe('late');
    expect(deriveInvoiceStatus(160, rows, '2026-01-01')).toBe('open');
  });
});

describe('interestText', () => {
  test('rate and years', () => expect(interestText(0.15, 24, 'flat')).toBe('15% سنوي · 2 سنين'));
  test('one year', () => expect(interestText(0.15, 12, 'flat')).toBe('15% سنوي · سنة'));
  test('fractional years', () => expect(interestText(0.1, 18, 'flat')).toBe('10% سنوي · 1.5 سنين'));
  test('imported or zero interest is a dash', () => {
    expect(interestText(0.15, 24, 'imported')).toBe('—');
    expect(interestText(0, 24, 'flat')).toBe('—');
  });
});
