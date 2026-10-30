import { formatEGP, previewInstallments, splitTotal } from '../money';

test('preview matches SQL cases', () => {
  expect(
    previewInstallments({ price: 25000, down: 10000, ratePercent: 30, years: 2, saleDate: '2026-11-01' }),
  ).toMatchObject({ financed: 15000, total: 19500, monthly: 812.5, last: 812.5, count: 24, firstDue: '2026-12-01' });
});

test('splitTotal puts the residual on the last installment (SQL case B)', () => {
  expect(splitTotal(11000, 3)).toEqual([3666.67, 3666.67, 3666.66]);
});

test('splitTotal rounds half away from zero', () => {
  expect(splitTotal(0.05, 2)).toEqual([0.03, 0.02]);
  expect(splitTotal(1.005, 1)).toEqual([1.01]);
});

test('first due clamps to month end', () => {
  expect(
    previewInstallments({ price: 16000, down: 1000, ratePercent: 30, years: 2, saleDate: '2026-01-31' }).firstDue,
  ).toBe('2026-02-28');
});

test('each due date is start + i months, clamped (leap year too)', () => {
  const s = previewInstallments({ price: 1200, down: 0, ratePercent: 0, years: 1, saleDate: '2027-12-31' }).schedule;
  expect(s[0]).toMatchObject({ seq: 1, dueDate: '2028-01-31' });
  expect(s[1].dueDate).toBe('2028-02-29');
  expect(s[11].dueDate).toBe('2028-12-31');
});

test('schedule sums exactly to total', () => {
  for (const price of [10000.01, 7777.77, 333.33]) {
    const r = previewInstallments({ price, down: 0, ratePercent: 17.5, years: 3, saleDate: '2026-11-01' });
    const sum = r.schedule.reduce((a, x) => a + Math.round(x.amount * 100), 0);
    expect(sum).toBe(Math.round(r.total * 100));
    expect(r.schedule).toHaveLength(36);
    expect(r.last).toBe(r.schedule[35].amount);
  }
});

test('formatEGP', () => {
  expect(formatEGP(812.5)).toBe('812.50 ج.م');
  expect(formatEGP(1234567.891)).toBe('1,234,567.89 ج.م');
  expect(formatEGP(0)).toBe('0.00 ج.م');
});
