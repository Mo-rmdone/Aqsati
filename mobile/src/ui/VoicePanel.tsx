import { Mic, MicOff } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useVoiceData, useVoiceIntent, VoiceError, voiceErrorText } from '../api/voice';
import { formatEGP } from '../lib/money';
import { cancelSpeak, listenOnce, speak, speechErrorText, speechSupported } from '../lib/speech';
import { resolveIntent } from '../lib/voice/resolve';
import type { CustomerOption, InvoiceOption, Picked, VoiceOutcome } from '../lib/voice/resolve';
import { Button } from './Button';
import { colors, radius, shadow, size, space, type } from './theme';

const MAX_TEXT = 300;
const MAX_OPTIONS = 6;
const GENERIC_ERROR = 'حصلت مشكلة، جرّب تاني';
const UNSUPPORTED = speechErrorText('unsupported');

type Intent = Parameters<typeof resolveIntent>[0];

type Phase =
  | { name: 'idle' }
  | { name: 'listening' }
  | { name: 'heard' }
  | { name: 'thinking' }
  | { name: 'chooseCustomer'; options: CustomerOption[]; then: Intent }
  | { name: 'chooseInvoice'; options: InvoiceOption[]; customerId: string; then: Intent }
  | { name: 'answer'; text: string }
  | { name: 'message'; text: string };

function invoiceLabel(i: InvoiceOption): string {
  const product =
    i.product_desc || (i.external_invoice_no ? `فاتورة ${i.external_invoice_no}` : `فاتورة ${i.contract_no ?? ''}`.trim());
  return `${product} · ${formatEGP(i.remaining)}`;
}

function Ring() {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => alive && setReduced(!!v))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 700, useNativeDriver: false }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      scale.setValue(1);
    };
  }, [reduced, scale]);
  return (
    <Animated.View testID="voice-ring" style={[styles.ring, { transform: [{ scale: reduced ? 1 : scale }] }]}>
      <Mic size={size.iconMd} color={colors.onBrand} />
    </Animated.View>
  );
}

export function VoicePanel({ onNavigate }: { onNavigate: (path: string) => void }) {
  const intentMutation = useVoiceIntent();
  const data = useVoiceData();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [text, setText] = useState('');
  const cancelListen = useRef<(() => void) | null>(null);
  const run = useRef(0);
  const supported = speechSupported();

  const stopAll = useCallback(() => {
    run.current += 1;
    cancelListen.current?.();
    cancelListen.current = null;
    cancelSpeak();
  }, []);

  useEffect(() => stopAll, [stopAll]);

  const handleOutcome = (outcome: VoiceOutcome) => {
    switch (outcome.kind) {
      case 'navigate':
        stopAll();
        setPhase({ name: 'idle' });
        setText('');
        onNavigate(outcome.path);
        if (outcome.say) speak(outcome.say);
        return;
      case 'chooseCustomer':
        setPhase({ name: 'chooseCustomer', options: outcome.options.slice(0, MAX_OPTIONS), then: outcome.then });
        return;
      case 'chooseInvoice':
        setPhase({
          name: 'chooseInvoice',
          options: outcome.options.slice(0, MAX_OPTIONS),
          customerId: outcome.customerId,
          then: outcome.then,
        });
        return;
      case 'answer':
        setPhase({ name: 'answer', text: outcome.text });
        speak(outcome.text);
        return;
      default:
        setPhase({ name: 'message', text: outcome.text });
    }
  };

  const start = () => {
    stopAll();
    const id = run.current;
    setText('');
    setPhase({ name: 'listening' });
    let session: ReturnType<typeof listenOnce>;
    try {
      session = listenOnce();
    } catch {
      setPhase({ name: 'message', text: GENERIC_ERROR });
      return;
    }
    const { promise, cancel } = session;
    cancelListen.current = cancel;
    promise.then(
      (heard) => {
        if (run.current !== id) return;
        cancelListen.current = null;
        setText(heard.slice(0, MAX_TEXT));
        setPhase({ name: 'heard' });
      },
      (e: any) => {
        if (run.current !== id) return;
        cancelListen.current = null;
        const msg = typeof e?.code === 'string' ? speechErrorText(e.code, e.detail) : GENERIC_ERROR;
        setPhase(msg ? { name: 'message', text: msg } : { name: 'idle' });
      },
    );
  };

  const cancel = () => {
    stopAll();
    setPhase({ name: 'idle' });
    setText('');
  };

  const send = async () => {
    const said = text.trim();
    if (!said) return;
    stopAll();
    const id = run.current;
    setPhase({ name: 'thinking' });
    try {
      const intent = await intentMutation.mutateAsync(said);
      if (run.current !== id) return;
      const outcome = await resolveIntent(intent, data);
      if (run.current !== id) return;
      handleOutcome(outcome);
    } catch (e) {
      if (run.current !== id) return;
      setPhase({ name: 'message', text: e instanceof VoiceError ? voiceErrorText(e.code) : GENERIC_ERROR });
    }
  };

  const pick = async (then: Intent, picked: Picked) => {
    stopAll();
    const id = run.current;
    setPhase({ name: 'thinking' });
    try {
      const outcome = await resolveIntent(then, data, picked);
      if (run.current !== id) return;
      handleOutcome(outcome);
    } catch {
      if (run.current !== id) return;
      setPhase({ name: 'message', text: GENERIC_ERROR });
    }
  };

  const close = () => {
    cancelSpeak();
    setPhase({ name: 'idle' });
  };

  let body: React.ReactNode;
  switch (phase.name) {
    case 'idle':
      body = (
        <View style={styles.idle}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="اسأل بصوتك"
            accessibilityState={{ disabled: !supported }}
            disabled={!supported}
            onPress={start}
            style={[styles.micButton, !supported && styles.micDisabled]}
          >
            {supported ? (
              <Mic size={size.iconMd} color={colors.onBrand} />
            ) : (
              <MicOff size={size.iconMd} color={colors.inkMuted} />
            )}
          </Pressable>
          <Text style={styles.caption}>{supported ? 'اسأل أو سجّل بصوتك' : UNSUPPORTED}</Text>
        </View>
      );
      break;
    case 'listening':
      body = (
        <View style={styles.stack}>
          <View style={styles.idle}>
            <Ring />
            <Text style={styles.caption}>بسمعك…</Text>
          </View>
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
      break;
    case 'heard':
      body = (
        <View style={styles.stack}>
          <Text style={styles.label}>سمعتك بتقول:</Text>
          <TextInput
            accessibilityLabel="اللي سمعته"
            multiline
            maxLength={MAX_TEXT}
            value={text}
            onChangeText={setText}
            style={styles.input}
          />
          <Button title="تمام" disabled={!text.trim()} onPress={() => void send()} />
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
      break;
    case 'thinking':
      body = (
        <View style={styles.stack}>
          <View style={styles.idle}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.caption}>بفكّر…</Text>
          </View>
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
      break;
    case 'chooseCustomer':
      body = (
        <View style={styles.stack}>
          <Text style={styles.label}>تقصد مين؟</Text>
          {phase.options.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              onPress={() => void pick(phase.then, { customerId: c.id })}
              style={styles.option}
            >
              <Text style={styles.optionText}>{`${c.name} · ${c.phone} · ${formatEGP(c.remaining)}`}</Text>
            </Pressable>
          ))}
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
      break;
    case 'chooseInvoice':
      body = (
        <View style={styles.stack}>
          <Text style={styles.label}>أنهي فاتورة؟</Text>
          {phase.options.map((i) => (
            <Pressable
              key={i.id}
              accessibilityRole="button"
              onPress={() => void pick(phase.then, { customerId: phase.customerId, contractId: i.id })}
              style={styles.option}
            >
              <Text style={styles.optionText}>{invoiceLabel(i)}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={() => void pick(phase.then, { customerId: phase.customerId, contractId: null })}
            style={styles.option}
          >
            <Text style={styles.optionText}>مش عارف</Text>
          </Pressable>
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
      break;
    case 'answer':
      body = (
        <View style={styles.stack}>
          <Text style={styles.answer}>{phase.text}</Text>
          <Button title="تمام" onPress={close} />
        </View>
      );
      break;
    default:
      body = (
        <View style={styles.stack}>
          <Text style={styles.answer}>{phase.text}</Text>
          <Button title="جرّب تاني" onPress={start} />
          <Button title="إلغاء" variant="secondary" onPress={cancel} />
        </View>
      );
  }

  return <View style={styles.card}>{body}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  idle: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  stack: { gap: space[3] },
  micButton: {
    width: size.tapLg,
    height: size.tapLg,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micDisabled: { backgroundColor: colors.surfaceSunken },
  ring: {
    width: size.tapLg,
    height: size.tapLg,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    borderWidth: 4,
    borderColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: { ...type.body, color: colors.ink, textAlign: 'right', flex: 1 },
  label: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  input: {
    ...type.body,
    color: colors.ink,
    textAlign: 'right',
    minHeight: size.tapLg * 2,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: space[3],
    textAlignVertical: 'top',
  },
  option: {
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: colors.surface,
  },
  optionText: { ...type.body, color: colors.ink, textAlign: 'right' },
  answer: { ...type.body, color: colors.ink, textAlign: 'right' },
});
