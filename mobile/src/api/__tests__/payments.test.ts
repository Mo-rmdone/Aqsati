import { isPaymentEditable, openInstallmentContracts, toPaymentLines } from '../payments';

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
