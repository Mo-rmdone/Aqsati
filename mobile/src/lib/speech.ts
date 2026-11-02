export type SpeechErrorCode = 'unsupported' | 'permission' | 'no_speech' | 'network' | 'cancelled';

export class SpeechError extends Error {
  code: SpeechErrorCode;
  constructor(code: SpeechErrorCode) {
    super(code);
    this.name = 'SpeechError';
    this.code = code;
  }
}

const TEXT: Record<SpeechErrorCode, string> = {
  unsupported: 'الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome',
  permission: 'محتاج إذن الميكروفون',
  no_speech: 'مسمعتش حاجة، جرّب تاني',
  network: 'النت ضعيف، جرّب تاني',
  cancelled: '',
};

export function speechErrorText(code: SpeechErrorCode): string {
  return TEXT[code];
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

function ctor(): (new () => RecognitionLike) | undefined {
  const g = globalThis as any;
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

export function speechSupported(): boolean {
  return typeof ctor() === 'function';
}

let activeCancel: (() => void) | null = null;

export function listenOnce(opts: { timeoutMs?: number } = {}): { promise: Promise<string>; cancel: () => void } {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  // Only one session at a time: a new call cancels the previous one.
  activeCancel?.();

  let cancel: () => void = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    const Rec = ctor();
    if (!Rec) {
      reject(new SpeechError('unsupported'));
      return;
    }
    let rec: RecognitionLike | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (activeCancel === cancel) activeCancel = null;
      if (rec) {
        rec.onresult = rec.onerror = rec.onend = null;
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }
      fn();
    };
    const fail = (code: SpeechErrorCode) => finish(() => reject(new SpeechError(code)));
    cancel = () => fail('cancelled');
    activeCancel = cancel;

    try {
      rec = new Rec();
      rec.lang = 'ar-EG';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onresult = (e) => {
        const text = String(e?.results?.[0]?.[0]?.transcript ?? '').trim();
        if (text) finish(() => resolve(text));
        else fail('no_speech');
      };
      rec.onerror = (e) => {
        const err = e?.error;
        if (err === 'not-allowed' || err === 'service-not-allowed') fail('permission');
        else if (err === 'no-speech') fail('no_speech');
        else if (err === 'aborted') fail('cancelled');
        else fail('network');
      };
      rec.onend = () => fail('no_speech');
      timer = setTimeout(() => fail('no_speech'), timeoutMs);
      rec.start();
    } catch {
      fail('network');
    }
  });
  // Callers may drop the promise after cancel(); avoid unhandled rejections.
  promise.catch(() => {});
  return { promise, cancel: () => cancel() };
}

export function speak(text: string): void {
  const g = globalThis as any;
  const synth = g.speechSynthesis;
  const Utter = g.SpeechSynthesisUtterance;
  if (!synth || !Utter) return;
  const voice = (synth.getVoices?.() ?? []).find((v: { lang?: string }) => v.lang?.toLowerCase().startsWith('ar'));
  if (!voice) return;
  synth.cancel();
  const u = new Utter(text);
  u.lang = 'ar-EG';
  u.voice = voice;
  synth.speak(u);
}
