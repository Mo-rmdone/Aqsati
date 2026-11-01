import { formatDateAr, headerDateAr, timeAr, todayISO } from '../date';

describe('headerDateAr / timeAr', () => {
  it('weekday + Cairo date', () => {
    expect(headerDateAr(new Date('2026-11-01T09:00:00Z'))).toBe('الأحد 1 نوفمبر 2026');
    expect(headerDateAr(new Date('2026-10-31T22:30:00Z'))).toBe('الأحد 1 نوفمبر 2026');
  });
  it('Cairo clock time', () => {
    expect(timeAr('2026-11-01T08:42:00Z')).toBe('10:42 ص');
    expect(timeAr('2026-11-01T13:05:00Z')).toBe('3:05 م');
    expect(timeAr('nope')).toBe('');
  });
});

describe('todayISO (Cairo day)', () => {
  it('rolls over at Cairo midnight (UTC+2 in winter)', () => {
    expect(todayISO(new Date('2026-11-30T22:30:00Z'))).toBe('2026-12-01');
    expect(todayISO(new Date('2026-11-30T21:30:00Z'))).toBe('2026-11-30');
  });
  it('uses UTC+3 in summer', () => {
    expect(todayISO(new Date('2026-07-31T21:30:00Z'))).toBe('2026-08-01');
    expect(todayISO(new Date('2026-07-31T20:30:00Z'))).toBe('2026-07-31');
  });
});

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

test('formatDateAr rejects trailing garbage after the date', () => {
  expect(formatDateAr('2026-03-05garbage')).toBe('2026-03-05garbage');
  expect(formatDateAr('2026-03-05 10:00')).toBe('5 مارس 2026');
});
