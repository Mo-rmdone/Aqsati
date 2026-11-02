export type SpeechErrorCode = 'unsupported' | 'no_mic' | 'permission' | 'no_speech' | 'network' | 'cancelled';

export class SpeechError extends Error {
  code: SpeechErrorCode;
  /** The browser's raw error (e.g. 'network', 'bad-grammar', 'InvalidStateError'), shown to help diagnose. */
  detail?: string;
  constructor(code: SpeechErrorCode, detail?: string) {
    super(code);
    this.name = 'SpeechError';
    this.code = code;
    this.detail = detail;
  }
}

const TEXT: Record<SpeechErrorCode, string> = {
  unsupported: 'الميكروفون مش مدعوم في المتصفح ده — جرّب Chrome',
  no_mic: 'مفيش ميكروفون شغّال على الجهاز ده',
  permission: 'محتاج إذن الميكروفون',
  no_speech: 'مسمعتش حاجة، جرّب تاني',
  network: 'النت ضعيف، جرّب تاني',
  cancelled: '',
};

export function speechErrorText(code: SpeechErrorCode, detail?: string): string {
  // For the catch-all "network" bucket, show the browser's own error code so a failure can be diagnosed.
  return code === 'network' && detail ? `${TEXT[code]} (${detail})` : TEXT[code];
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
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

const START_FALLBACK_MS = 30_000;
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
        rec.onresult = rec.onerror = rec.onend = rec.onstart = null;
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
      }
      fn();
    };
    const fail = (code: SpeechErrorCode, detail?: string) => finish(() => reject(new SpeechError(code, detail)));
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
        if (err === 'audio-capture') fail('no_mic');
        else if (err === 'language-not-supported') fail('unsupported');
        else if (err === 'not-allowed' || err === 'service-not-allowed') fail('permission');
        else if (err === 'no-speech') fail('no_speech');
        else if (err === 'aborted') fail('cancelled');
        else fail('network', String(err ?? 'unknown'));
      };
      rec.onend = () => fail('no_speech');
      // The mic permission prompt may be slow: the real timeout starts at onstart;
      // this longer fallback only covers onstart never firing.
      // One absolute deadline bounds the mic window; a repeated onstart can never extend it.
      const total = Math.max(timeoutMs, START_FALLBACK_MS);
      const deadline = Date.now() + total;
      let started = false;
      timer = setTimeout(() => fail('no_speech'), total);
      rec.onstart = () => {
        if (done || started) return;
        started = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => fail('no_speech'), Math.max(0, Math.min(timeoutMs, deadline - Date.now())));
      };
      rec.start();
    } catch (e) {
      fail('network', (e as Error)?.name || 'start-failed');
    }
  });
  // Callers may drop the promise after cancel(); avoid unhandled rejections.
  promise.catch(() => {});
  return { promise, cancel: () => cancel() };
}

const isAr = (v: { lang?: string }) => v.lang?.toLowerCase().startsWith('ar');

function say(synth: any, Utter: any, voice: unknown, text: string) {
  synth.cancel();
  const u = new Utter(text);
  u.lang = 'ar-EG';
  u.voice = voice;
  synth.speak(u);
}

let dropPending: (() => void) | null = null;

/** Drops any deferred speak (timer, listener, text) and stops current speech. */
export function cancelSpeak(): void {
  dropPending?.();
  (globalThis as any).speechSynthesis?.cancel?.();
}

export function speak(text: string): void {
  dropPending?.();
  const g = globalThis as any;
  const synth = g.speechSynthesis;
  const Utter = g.SpeechSynthesisUtterance;
  if (!synth || !Utter) return;
  const voices = synth.getVoices?.() ?? [];
  if (voices.length === 0 && typeof synth.addEventListener === 'function') {
    // Chrome loads voices lazily: wait once (max 1 s) for them.
    let settled = false;
    const drop = () => {
      settled = true;
      clearTimeout(t);
      synth.removeEventListener?.('voiceschanged', finish);
      if (dropPending === drop) dropPending = null;
    };
    const finish = () => {
      if (settled) return;
      drop();
      const v = (synth.getVoices?.() ?? []).find(isAr);
      if (v) say(synth, Utter, v, text);
    };
    const t = setTimeout(finish, 1000);
    synth.addEventListener('voiceschanged', finish);
    dropPending = drop;
    return;
  }
  const voice = voices.find(isAr);
  if (voice) say(synth, Utter, voice, text);
}
