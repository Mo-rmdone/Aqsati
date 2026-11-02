import { listenOnce, speak, speechErrorText, speechSupported } from '../speech';

class FakeRecognition {
  static last: FakeRecognition | null = null;
  lang = '';
  continuous = true;
  interimResults = true;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = jest.fn();
  abort = jest.fn();
  constructor() {
    FakeRecognition.last = this;
  }
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  jest.useFakeTimers();
  FakeRecognition.last = null;
  delete g.SpeechRecognition;
  g.webkitSpeechRecognition = FakeRecognition;
});
afterEach(() => {
  jest.useRealTimers();
  delete g.webkitSpeechRecognition;
  delete g.speechSynthesis;
  delete g.SpeechSynthesisUtterance;
});

const code = async (p: Promise<unknown>) => p.then(() => 'resolved', (e) => (e as { code: string }).code);

test('result event resolves the transcript with ar-EG, non-continuous, no interim', async () => {
  const { promise } = listenOnce();
  const r = FakeRecognition.last!;
  expect(r.lang).toBe('ar-EG');
  expect(r.continuous).toBe(false);
  expect(r.interimResults).toBe(false);
  expect(r.start).toHaveBeenCalled();
  r.onresult!({ results: [[{ transcript: ' محمد دفع ٥٠٠ ' }]] });
  await expect(promise).resolves.toBe('محمد دفع ٥٠٠');
  expect(r.abort).toHaveBeenCalled();
});

test('not-allowed maps to permission', async () => {
  const { promise } = listenOnce();
  FakeRecognition.last!.onerror!({ error: 'not-allowed' });
  expect(await code(promise)).toBe('permission');
});

test('network error maps to network; no-speech to no_speech', async () => {
  const a = listenOnce();
  FakeRecognition.last!.onerror!({ error: 'network' });
  expect(await code(a.promise)).toBe('network');
  const b = listenOnce();
  FakeRecognition.last!.onerror!({ error: 'no-speech' });
  expect(await code(b.promise)).toBe('no_speech');
});

test('silent recognition stops at 10 s with no_speech and aborts', async () => {
  const { promise } = listenOnce();
  const r = FakeRecognition.last!;
  const out = code(promise);
  jest.advanceTimersByTime(9999);
  expect(r.abort).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(await out).toBe('no_speech');
  expect(r.abort).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('end without result is no_speech', async () => {
  const { promise } = listenOnce();
  FakeRecognition.last!.onend!();
  expect(await code(promise)).toBe('no_speech');
});

test('cancel rejects cancelled, aborts, clears timer', async () => {
  const { promise, cancel } = listenOnce();
  const r = FakeRecognition.last!;
  cancel();
  expect(await code(promise)).toBe('cancelled');
  expect(r.abort).toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('a second listenOnce cancels the first', async () => {
  const first = listenOnce();
  const r1 = FakeRecognition.last!;
  const second = listenOnce();
  expect(await code(first.promise)).toBe('cancelled');
  expect(r1.abort).toHaveBeenCalled();
  FakeRecognition.last!.onresult!({ results: [[{ transcript: 'تمام' }]] });
  await expect(second.promise).resolves.toBe('تمام');
});

test('start() throwing rejects and cleans up', async () => {
  const orig = FakeRecognition.prototype;
  const Throwing = class extends FakeRecognition {
    start = jest.fn(() => {
      throw new Error('boom');
    });
  };
  g.webkitSpeechRecognition = Throwing;
  const { promise } = listenOnce();
  expect(await code(promise)).toBe('network');
  expect(jest.getTimerCount()).toBe(0);
  expect(orig).toBeDefined();
});

test('no constructor: unsupported', async () => {
  delete g.webkitSpeechRecognition;
  expect(speechSupported()).toBe(false);
  const { promise } = listenOnce();
  expect(await code(promise)).toBe('unsupported');
});

test('speechSupported true with webkit constructor', () => {
  expect(speechSupported()).toBe(true);
});

test('speechErrorText copy', () => {
  expect(speechErrorText('no_speech')).toBe('مسمعتش حاجة، جرّب تاني');
  expect(speechErrorText('network')).toBe('النت ضعيف، جرّب تاني');
  expect(speechErrorText('permission')).toBe('محتاج إذن الميكروفون');
  expect(speechErrorText('unsupported')).toBe('الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome');
});

test('speak cancels current, prefers ar voice, sets lang', () => {
  const synth = {
    cancel: jest.fn(),
    speak: jest.fn(),
    getVoices: () => [{ lang: 'en-US', name: 'e' }, { lang: 'ar-SA', name: 'a' }],
  };
  g.speechSynthesis = synth;
  g.SpeechSynthesisUtterance = class {
    lang = '';
    voice: unknown = null;
    constructor(public text: string) {}
  };
  speak('أهلا');
  expect(synth.cancel).toHaveBeenCalled();
  const u = synth.speak.mock.calls[0][0];
  expect(u.text).toBe('أهلا');
  expect(u.lang).toBe('ar-EG');
  expect(u.voice).toEqual({ lang: 'ar-SA', name: 'a' });
});

test('speak is a no-op without an ar voice or synthesis', () => {
  speak('x');
  const synth = { cancel: jest.fn(), speak: jest.fn(), getVoices: () => [{ lang: 'en-US' }] };
  g.speechSynthesis = synth;
  g.SpeechSynthesisUtterance = class {};
  speak('x');
  expect(synth.speak).not.toHaveBeenCalled();
});
