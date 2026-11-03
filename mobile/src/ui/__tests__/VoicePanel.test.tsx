import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { listenOnce, speak, speechSupported } from '../../lib/speech';
import { parseCommand } from '../../lib/voice/parse';
import { resolveIntent } from '../../lib/voice/resolve';
import { VoicePanel } from '../VoicePanel';

jest.mock('../../lib/speech', () => ({
  speechSupported: jest.fn(() => true),
  listenOnce: jest.fn(),
  speak: jest.fn(),
  cancelSpeak: jest.fn(),
  speechErrorText: (c: string) => (c === 'unsupported' ? 'مش مدعوم' : c === 'cancelled' ? '' : 'خطأ صوت'),
}));
// Understanding is local: the panel must not need the network (useVoiceIntent is gone from the mock).
jest.mock('../../api/voice', () => ({ useVoiceData: () => ({}) }));
jest.mock('../../lib/voice/parse', () => ({ parseCommand: jest.fn() }));
jest.mock('../../lib/voice/resolve', () => ({ resolveIntent: jest.fn() }));

const listen = listenOnce as jest.Mock;
const resolve = resolveIntent as jest.Mock;
const parse = parseCommand as jest.Mock;
const INTENT = { kind: 'balance' };

function hear(text: string) {
  const cancel = jest.fn();
  listen.mockReturnValue({ promise: Promise.resolve(text), cancel });
  return cancel;
}

async function toHeard(text = 'رصيد أحمد') {
  hear(text);
  await render(<VoicePanel onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await screen.findByText('سمعتك بتقول:');
}

let onNavigate: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (speechSupported as jest.Mock).mockReturnValue(true);
  parse.mockReturnValue(INTENT);
  onNavigate = jest.fn();
});

test('mic press shows the heard text in an editable input; edited text is parsed on the device', async () => {
  await toHeard();
  const input = screen.getByLabelText('اللي سمعته');
  expect(input.props.value).toBe('رصيد أحمد');
  resolve.mockResolvedValue({ kind: 'message', text: 'تمام يا باشا' });
  await fireEvent.changeText(input, 'رصيد محمد');
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('تمام يا باشا');
  expect(parse).toHaveBeenCalledWith('رصيد محمد');
  expect(resolve).toHaveBeenCalledWith(INTENT, {});
});

test('answer outcome shows the text and speaks it', async () => {
  await toHeard();
  resolve.mockResolvedValue({ kind: 'answer', text: 'عليه 500 ج.م' });
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('عليه 500 ج.م');
  expect(speak).toHaveBeenCalledWith('عليه 500 ج.م');
});

test('chooseCustomer lists options and picking re-resolves with the customerId', async () => {
  await toHeard();
  const then = { kind: 'balance' };
  resolve.mockResolvedValueOnce({
    kind: 'chooseCustomer',
    then,
    options: [
      { id: 'c1', name: 'أحمد', phone: '0100', remaining: 100 },
      { id: 'c2', name: 'أحمد علي', phone: '0111', remaining: 0 },
    ],
  });
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('تقصد مين؟');
  resolve.mockResolvedValueOnce({ kind: 'navigate', path: '/customer/c2' });
  await fireEvent.press(screen.getByText(/أحمد علي · 0111/));
  await act(async () => {});
  expect(resolve).toHaveBeenLastCalledWith(then, {}, { customerId: 'c2' });
  expect(onNavigate).toHaveBeenCalledWith('/customer/c2');
});

test('chooseInvoice offers an unknown option', async () => {
  await toHeard();
  const then = { kind: 'payment' };
  resolve.mockResolvedValueOnce({
    kind: 'chooseInvoice',
    customerId: 'c1',
    then,
    options: [{ id: 'k1', contract_no: 1, product_desc: 'ثلاجة', external_invoice_no: null, remaining: 50 }],
  });
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('أنهي فاتورة؟');
  resolve.mockResolvedValueOnce({ kind: 'navigate', path: '/payment/new' });
  await fireEvent.press(screen.getByText('مش عارف'));
  await act(async () => {});
  expect(resolve).toHaveBeenLastCalledWith(then, {}, { customerId: 'c1', contractId: null });
});

test('navigate outcome calls onNavigate and speaks say once', async () => {
  await toHeard();
  resolve.mockResolvedValue({ kind: 'navigate', path: '/sale/new', say: 'فتحتلك الفاتورة' });
  await fireEvent.press(screen.getByText('تمام'));
  await act(async () => {});
  expect(onNavigate).toHaveBeenCalledWith('/sale/new');
  expect(speak).toHaveBeenCalledTimes(1);
  expect(screen.getByText('اسأل أو سجّل بصوتك')).toBeTruthy();
});

test('resolver failure shows a generic retry message', async () => {
  await toHeard();
  resolve.mockRejectedValue(new Error('db'));
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('حصلت مشكلة، جرّب تاني');
  expect(screen.getByText('جرّب تاني')).toBeTruthy();
});

test('the real parser output reaches resolveIntent (no network step)', async () => {
  parse.mockImplementation(jest.requireActual('../../lib/voice/parse').parseCommand);
  await toHeard('سيد دفع ألفين كاش');
  resolve.mockResolvedValue({ kind: 'message', text: 'تمام يا باشا' });
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('تمام يا باشا');
  expect(resolve).toHaveBeenCalledWith({ type: 'record_payment', customer: 'سيد', amount: 2000, method: 'cash' }, {});
});

test('a phrase the parser does not know goes to the resolver as unknown', async () => {
  parse.mockImplementation(jest.requireActual('../../lib/voice/parse').parseCommand);
  await toHeard('الجو حلو النهارده');
  resolve.mockResolvedValue({ kind: 'message', text: 'مفهمتش' });
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('مفهمتش');
  expect(resolve).toHaveBeenCalledWith({ type: 'unknown' }, {});
});

test('speech errors show their text; cancelled shows nothing', async () => {
  listen.mockReturnValue({ promise: Promise.reject({ code: 'no_speech' }), cancel: jest.fn() });
  await render(<VoicePanel onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await screen.findByText('خطأ صوت');
  await fireEvent.press(screen.getByText('إلغاء'));
  listen.mockReturnValue({ promise: Promise.reject({ code: 'cancelled' }), cancel: jest.fn() });
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await act(async () => {});
  expect(screen.queryByText('خطأ صوت')).toBeNull();
  expect(screen.getByText('اسأل أو سجّل بصوتك')).toBeTruthy();
});

test('empty transcript disables تمام', async () => {
  await toHeard('');
  expect(screen.getByRole('button', { name: 'تمام' }).props.accessibilityState.disabled).toBe(true);
});

test('cancel while listening and unmount cancel the active listen', async () => {
  const cancel = jest.fn();
  listen.mockReturnValue({ promise: new Promise(() => {}), cancel });
  const r = await render(<VoicePanel onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await fireEvent.press(screen.getByText('إلغاء'));
  expect(cancel).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await r.unmount();
  expect(cancel).toHaveBeenCalledTimes(2);
});

function deferred<T>() {
  let resolveFn!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolveFn = r));
  return { promise, resolve: resolveFn };
}

test('answer resolved after cancel is ignored', async () => {
  await toHeard();
  const d = deferred<unknown>();
  resolve.mockReturnValue(d.promise);
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('ثانية واحدة…');
  await fireEvent.press(screen.getByText('إلغاء'));
  d.resolve({ kind: 'navigate', path: '/x', say: 'هيا' });
  await act(async () => {});
  expect(screen.getByText('اسأل أو سجّل بصوتك')).toBeTruthy();
  expect(onNavigate).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});

test('resolveIntent resolved after unmount does nothing', async () => {
  hear('رصيد');
  const r = await render(<VoicePanel onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await screen.findByText('سمعتك بتقول:');
  const d = deferred<unknown>();
  resolve.mockReturnValue(d.promise);
  await fireEvent.press(screen.getByText('تمام'));
  await act(async () => {});
  await r.unmount();
  d.resolve({ kind: 'navigate', path: '/x', say: 'هيا' });
  await act(async () => {});
  expect(onNavigate).not.toHaveBeenCalled();
  expect(speak).not.toHaveBeenCalled();
});

test('a second request supersedes the first', async () => {
  await toHeard('أول');
  const first = deferred<unknown>();
  parse.mockReturnValueOnce({ n: 1 });
  resolve.mockReturnValueOnce(first.promise);
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('ثانية واحدة…');
  await fireEvent.press(screen.getByText('إلغاء'));
  hear('تاني');
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  await screen.findByText('سمعتك بتقول:');
  parse.mockReturnValueOnce({ n: 2 });
  resolve.mockImplementationOnce(async (i: any) => ({ kind: 'message', text: `نتيجة ${i.n}` }));
  await fireEvent.press(screen.getByText('تمام'));
  await screen.findByText('نتيجة 2');
  first.resolve({ kind: 'message', text: 'نتيجة 1' });
  await act(async () => {});
  expect(screen.getByText('نتيجة 2')).toBeTruthy();
  expect(screen.queryByText('نتيجة 1')).toBeNull();
});

test('a synchronous listenOnce throw shows the generic message', async () => {
  listen.mockImplementation(() => {
    throw new Error('boom');
  });
  await render(<VoicePanel onNavigate={onNavigate} />);
  await fireEvent.press(screen.getByRole('button', { name: 'اسأل بصوتك' }));
  expect(screen.getByText('حصلت مشكلة، جرّب تاني')).toBeTruthy();
});

test('unsupported disables the mic and shows the copy', async () => {
  (speechSupported as jest.Mock).mockReturnValue(false);
  await render(<VoicePanel onNavigate={onNavigate} />);
  expect(screen.getByText('مش مدعوم')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'اسأل بصوتك' }).props.accessibilityState.disabled).toBe(true);
});
