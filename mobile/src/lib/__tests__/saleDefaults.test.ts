import { initialRateYears, shouldSeedDefaults } from '../saleDefaults';

const settings = { defaultRate: 12.5, defaultYears: 3 };

describe('initialRateYears', () => {
  it('prefill wins per field', () => {
    expect(initialRateYears({ rate: '8', years: 2 }, settings)).toEqual({ rate: '8', years: 2 });
    expect(initialRateYears({ rate: '8' }, settings)).toEqual({ rate: '8', years: 3 });
    expect(initialRateYears({ years: 5 }, settings)).toEqual({ rate: '12.5', years: 5 });
  });
  it('uses settings when there is no prefill', () => {
    expect(initialRateYears({}, settings)).toEqual({ rate: '12.5', years: 3 });
  });
  it('falls back to empty / 1 on nulls or missing settings', () => {
    expect(initialRateYears({}, { defaultRate: null, defaultYears: null })).toEqual({ rate: '', years: 1 });
    expect(initialRateYears({}, undefined)).toEqual({ rate: '', years: 1 });
  });
  it('keeps a zero rate as "0"', () => {
    expect(initialRateYears({}, { defaultRate: 0, defaultYears: null }).rate).toBe('0');
  });
});

describe('shouldSeedDefaults', () => {
  const base = { seeded: false, hasSettings: true, rateTouched: false, yearsTouched: false, prefill: {} };
  it('seeds untouched fields once settings arrive', () => {
    expect(shouldSeedDefaults(base)).toEqual({ rate: true, years: true });
  });
  it('never seeds before settings arrive or after seeding', () => {
    expect(shouldSeedDefaults({ ...base, hasSettings: false })).toEqual({ rate: false, years: false });
    expect(shouldSeedDefaults({ ...base, seeded: true })).toEqual({ rate: false, years: false });
  });
  it('skips touched or prefilled fields', () => {
    expect(shouldSeedDefaults({ ...base, rateTouched: true })).toEqual({ rate: false, years: true });
    expect(shouldSeedDefaults({ ...base, prefill: { rate: '5', years: 2 } })).toEqual({ rate: false, years: false });
  });
});
