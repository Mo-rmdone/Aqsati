jest.mock('../supabase', () => ({ supabase: {}, isSupabaseConfigured: true }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

import { createAttempt } from '../attempt';

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

test('regression: two sequential successful submits with identical inputs get different ids', async () => {
  const attempt = createAttempt(counter());
  const sent: string[] = [];
  const submit = async (sig: string) => {
    const id = attempt.idFor(sig);
    sent.push(id); // mocked successful mutation
    attempt.reset();
  };
  await submit('812.50|X');
  await submit('812.50|X');
  expect(sent[0]).not.toBe(sent[1]);
});

test('a failed attempt retried unchanged re-sends the same id', () => {
  const attempt = createAttempt(counter());
  const a = attempt.idFor('s');
  const b = attempt.idFor('s');
  expect(a).toBe(b);
  expect(attempt.idFor('changed')).not.toBe(a);
});
