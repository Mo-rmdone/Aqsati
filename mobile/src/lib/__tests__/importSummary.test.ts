jest.mock('../supabase', () => ({ supabase: {} }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'x' }));

import { summarize, type ImportRow, type RawRow } from '../importRows';

const raw = {} as RawRow;
const row = (o: Partial<ImportRow>): ImportRow => ({
  id: 'i', customerId: 'c1', raw, errors: [], warnings: [], computed: null,
  duplicate: false, skip: false, status: 'pending', ...o,
});

it('summarizes', () => {
  const s = summarize([
    row({}),
    row({ customerId: 'c2', errors: ['e'] }),
    row({ customerId: 'c2', warnings: ['w'] }),
    row({ customerId: 'c3', errors: ['e'], skip: true }),
    row({ customerId: 'c3', duplicate: true, skip: true }),
  ]);
  expect(s).toEqual({ total: 5, customers: 3, needsReview: 2, duplicates: 1, ready: 2 });
});
