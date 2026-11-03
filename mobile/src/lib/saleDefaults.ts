type Defaults = { defaultRate: number | null; defaultYears: number | null };
type Prefill = { rate?: string; years?: number };

/** Rate/years a new invoice starts with: URL/voice prefill wins per field, then shop defaults. */
export function initialRateYears(prefill: Prefill, settings: Defaults | undefined): { rate: string; years: number } {
  const rate = prefill.rate ?? (settings?.defaultRate != null ? String(settings.defaultRate) : '');
  const years = prefill.years ?? settings?.defaultYears ?? 1;
  return { rate, years };
}

/**
 * Settings can arrive after the first render. Seed once, and only the fields the
 * user hasn't touched and the prefill didn't set.
 */
export function shouldSeedDefaults(input: {
  seeded: boolean;
  hasSettings: boolean;
  rateTouched: boolean;
  yearsTouched: boolean;
  prefill: Prefill;
}): { rate: boolean; years: boolean } {
  if (input.seeded || !input.hasSettings) return { rate: false, years: false };
  return {
    rate: !input.rateTouched && input.prefill.rate === undefined,
    years: !input.yearsTouched && input.prefill.years === undefined,
  };
}
