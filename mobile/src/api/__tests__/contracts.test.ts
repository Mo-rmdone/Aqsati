import { contractStatus, hasOpenBalance } from '../contracts';

jest.mock('../../lib/supabase', () => ({ supabase: {} }));

test('contractStatus treats null as unknown, never settled', () => {
  expect(contractStatus(0)).toBe('settled');
  expect(contractStatus(150)).toBe('open');
  expect(contractStatus(null)).toBe('unknown');
});

test('hasOpenBalance hides payment only when every remaining is a known 0', () => {
  expect(hasOpenBalance([])).toBe(false);
  expect(hasOpenBalance([{ remaining: 0 }, { remaining: 0 }])).toBe(false);
  expect(hasOpenBalance([{ remaining: 0 }, { remaining: 10 }])).toBe(true);
  expect(hasOpenBalance([{ remaining: 0 }, { remaining: null }])).toBe(true);
});
