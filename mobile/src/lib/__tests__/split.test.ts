import { autoSplit, validateSplit } from '../split';

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
test('autoSplit: several contracts leave lines empty', () => {
  expect(autoSplit(500, [{ contractId: 'a', remaining: 900 }, { contractId: 'b', remaining: 9 }])).toEqual([
    { contractId: 'a', amount: 0 },
    { contractId: 'b', amount: 0 },
  ]);
});
