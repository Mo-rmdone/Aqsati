function load(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod!: typeof import('../supabase');
  jest.isolateModules(() => {
    mod = require('../supabase');
  });
  process.env = saved;
  return mod;
}

test('isSupabaseConfigured is false when env vars are missing', () => {
  const m = load({ EXPO_PUBLIC_SUPABASE_URL: undefined, EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined });
  expect(m.isSupabaseConfigured).toBe(false);
});

test('isSupabaseConfigured is false when only one var is set', () => {
  const m = load({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: undefined });
  expect(m.isSupabaseConfigured).toBe(false);
});

test('isSupabaseConfigured is true when both are set', () => {
  const m = load({ EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'k' });
  expect(m.isSupabaseConfigured).toBe(true);
});
