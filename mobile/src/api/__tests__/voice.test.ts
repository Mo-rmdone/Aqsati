import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

const mockInvoke = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => mockInvoke(...a) } } }));

import { useVoiceIntent, voiceErrorText } from '../voice';

beforeAll(() => notifyManager.setScheduler((cb) => cb()));
beforeEach(() => mockInvoke.mockReset());

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) },
    children,
  );

const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: { status, json: async () => body },
});

async function run(text = 'محمد دفع') {
  const { result } = await renderHook(() => useVoiceIntent(), { wrapper });
  let err: unknown;
  await act(async () => {
    try {
      await result.current.mutateAsync(text);
    } catch (e) {
      err = e;
    }
  });
  return err as { code: string } | undefined;
}

test('success returns the intent and sends only the text', async () => {
  mockInvoke.mockResolvedValue({ data: { intent: { type: 'ask_late' } }, error: null });
  const { result } = await renderHook(() => useVoiceIntent(), { wrapper });
  let out: unknown;
  await act(async () => {
    out = await result.current.mutateAsync('مين متأخر');
  });
  expect(out).toEqual({ type: 'ask_late' });
  expect(mockInvoke).toHaveBeenCalledWith('voice-intent', { body: { text: 'مين متأخر' } });
});

test.each([
  [402, { error: 'budget_exceeded' }, 'budget_exceeded'],
  [503, { error: 'not_configured' }, 'not_configured'],
  [503, { error: 'ai_unavailable' }, 'unavailable'],
  [400, { error: 'too_long' }, 'too_long'],
  [400, { error: 'bad_request' }, 'unavailable'],
  [401, {}, 'unauthorized'],
  [500, 'garbage', 'unavailable'],
])('http %s %j -> %s', async (status, body, expected) => {
  mockInvoke.mockResolvedValue({ data: null, error: httpError(status, body) });
  expect((await run())?.code).toBe(expected);
});

test('relay/network error and malformed data map to unavailable', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: { name: 'FunctionsFetchError' } });
  expect((await run())?.code).toBe('unavailable');
  mockInvoke.mockResolvedValue({ data: {}, error: null });
  expect((await run())?.code).toBe('unavailable');
});

test('voiceErrorText copy', () => {
  expect(voiceErrorText('budget_exceeded')).toBe('خلّصت حصة الشهر للمساعد الصوتي');
  expect(voiceErrorText('not_configured')).toBe('المساعد الصوتي لسه مش متفعّل');
  expect(voiceErrorText('too_long')).toBe('الكلام طويل، قولها أقصر');
  expect(voiceErrorText('unavailable')).toBe('المساعد مش متاح دلوقتي، جرّب كمان شوية');
  expect(voiceErrorText('unauthorized')).toBe('سجّل دخول تاني وجرّب');
});
