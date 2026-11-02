jest.mock('../supabase', () => ({ supabase: {} }));
import { parseDayMonth, promiseChoices } from '../promise';

test('promiseChoices', () => {
  expect(promiseChoices('2026-11-30').map((c) => c.date)).toEqual(['2026-12-01', '2026-12-03', '2026-12-07', '2026-12-01']);
  expect(promiseChoices('2026-03-10').map((c) => c.label)).toEqual(['بكره', 'بعد 3 أيام', 'بعد أسبوع', 'أول الشهر الجاي']);
  expect(promiseChoices('2026-03-10')[3].date).toBe('2026-04-01');
});

test('parseDayMonth', () => {
  const t = '2026-11-30';
  expect(parseDayMonth('5/12', t)).toBe('2026-12-05');
  expect(parseDayMonth('٥/١٢', t)).toBe('2026-12-05');
  expect(parseDayMonth('5-12', t)).toBe('2026-12-05');
  expect(parseDayMonth('5.12.2027', t)).toBe('2027-12-05');
  expect(parseDayMonth('1/11', t)).toBe('2027-11-01');
  expect(parseDayMonth('31/2', t)).toBeNull();
  expect(parseDayMonth('30/11/2026', t)).toBeNull();
  expect(parseDayMonth('5/12/26', t)).toBeNull();
  expect(parseDayMonth('abc', t)).toBeNull();
  expect(parseDayMonth('29/2', t)).toBe('2028-02-29');
});
