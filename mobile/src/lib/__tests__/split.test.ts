import { autoSplit, totalRemaining, validateSplit } from '../split';

test('sum mismatch rejected', () => {
  expect(validateSplit(2000, [{ contractId: 'a', amount: 500, remaining: 2000 }])).toMatch(/[؀-ۿ]/);
});
test('line above remaining rejected', () => {
  expect(validateSplit(1500, [{ contractId: 'a', amount: 1500, remaining: 1000 }])).not.toBeNull();
});
test('zero-only lines rejected', () => {
  expect(validateSplit(0, [{ contractId: 'a', amount: 0, remaining: 1000 }])).not.toBeNull();
  expect(validateSplit(0, [])).not.toBeNull();
});
test('NaN total or line rejected', () => {
  expect(validateSplit(NaN, [{ contractId: 'a', amount: 10, remaining: 100 }])).not.toBeNull();
  expect(validateSplit(10, [{ contractId: 'a', amount: NaN, remaining: 100 }])).not.toBeNull();
});
test('valid 1000/1000 of 2000 passes; float sums tolerated', () => {
  expect(
    validateSplit(2000, [
      { contractId: 'a', amount: 1000, remaining: 5000 },
      { contractId: 'b', amount: 1000, remaining: 1000 },
    ]),
  ).toBeNull();
  expect(
    validateSplit(0.3, [
      { contractId: 'a', amount: 0.1, remaining: 5 },
      { contractId: 'b', amount: 0.2, remaining: 5 },
    ]),
  ).toBeNull();
});
test('zero lines are ignored when others are valid', () => {
  expect(
    validateSplit(100, [
      { contractId: 'a', amount: 100, remaining: 100 },
      { contractId: 'b', amount: 0, remaining: 100 },
    ]),
  ).toBeNull();
});
test('autoSplit: one open contract takes the whole total', () => {
  expect(autoSplit(500, [{ contractId: 'a', remaining: 900 }])).toEqual([{ contractId: 'a', amount: 500 }]);
});
test('autoSplit: several contracts fill in the given order, oldest first', () => {
  expect(autoSplit(1000, [{ contractId: 'a', remaining: 600 }, { contractId: 'b', remaining: 900 }])).toEqual([
    { contractId: 'a', amount: 600 },
    { contractId: 'b', amount: 400 },
  ]);
});
test('autoSplit: amount within the first contract leaves the rest at 0', () => {
  expect(autoSplit(500, [{ contractId: 'a', remaining: 900 }, { contractId: 'b', remaining: 9 }])).toEqual([
    { contractId: 'a', amount: 500 },
    { contractId: 'b', amount: 0 },
  ]);
});
test('autoSplit: piasters stay exact and an amount above the total owed is left unallocated', () => {
  const lines = autoSplit(1000.3, [{ contractId: 'a', remaining: 0.1 }, { contractId: 'b', remaining: 0.2 }]);
  expect(lines).toEqual([
    { contractId: 'a', amount: 0.1 },
    { contractId: 'b', amount: 0.2 },
  ]);
  expect(validateSplit(1000.3, lines.map((l, i) => ({ ...l, remaining: [0.1, 0.2][i] })))).not.toBeNull();
});
test('autoSplit: empty or invalid total gives zero lines', () => {
  expect(autoSplit(NaN, [{ contractId: 'a', remaining: 9 }])).toEqual([{ contractId: 'a', amount: 0 }]);
});
test('totalRemaining sums in piasters', () => {
  expect(totalRemaining([{ remaining: 0.1 }, { remaining: 0.2 }])).toBe(0.3);
});
