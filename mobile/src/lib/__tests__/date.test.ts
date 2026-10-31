import { formatDateAr } from '../date';

describe('formatDateAr', () => {
  it('formats a normal date', () => {
    expect(formatDateAr('2026-12-01')).toBe('1 ديسمبر 2026');
    expect(formatDateAr('2026-11-15')).toBe('15 نوفمبر 2026');
  });
  it('handles month ends and leap day', () => {
    expect(formatDateAr('2026-01-31')).toBe('31 يناير 2026');
    expect(formatDateAr('2028-02-29')).toBe('29 فبراير 2028');
  });
  it('accepts a timestamp prefix', () => {
    expect(formatDateAr('2026-03-05T10:00:00Z')).toBe('5 مارس 2026');
  });
  it('returns input for invalid and dash for empty', () => {
    expect(formatDateAr('2026-02-30')).toBe('2026-02-30');
    expect(formatDateAr('2026-13-01')).toBe('2026-13-01');
    expect(formatDateAr('garbage')).toBe('garbage');
    expect(formatDateAr('')).toBe('—');
  });
});

import { localDateISO } from '../date';
test('localDateISO uses the local calendar day', () => {
  const d = new Date(2026, 4, 3, 23, 30);
  expect(localDateISO(d.toISOString())).toBe('2026-05-03');
  expect(localDateISO('garbage')).toBe('');
});
