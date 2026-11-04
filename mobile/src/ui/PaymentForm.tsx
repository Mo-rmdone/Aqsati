import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PaymentLineInput } from '../api/payments';
import { PAYMENT_METHODS, parseAmount, sanitizeAmount, type PaymentMethod } from '../api/sales';
import { formatEGP } from '../lib/money';
import { autoSplit, totalRemaining, validateSplit } from '../lib/split';
import { Button } from './Button';
import { Field } from './Field';
import { border, colors, radius, size, space, type } from './theme';

export interface PaymentFormContract {
  contractId: string;
  title: string;
  remaining: number;
}

export interface PaymentSubmit {
  method: PaymentMethod;
  lines: PaymentLineInput[];
  /** changes whenever the user-visible inputs change; drives the idempotency id */
  sig: string;
}

/** Arabic server message passes through; anything else becomes a generic retry hint. */
export function failureMessage(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
  return msg && /[؀-ۿ]/.test(msg) ? msg : fallback;
}

/** "سجّل 1,000.00 ج.م من سيد" once the amount is valid; the plain label otherwise. */
export function submitText(base: string, amount: number, valid: boolean, payerName?: string): string {
  if (!valid || !payerName) return base;
  return `سجّل ${formatEGP(amount)} من ${payerName}`;
}

export function PaymentForm({
  contracts,
  initialAmounts,
  initialMethod = 'cash',
  initialTotal,
  submitLabel,
  payerName,
  loading,
  onSubmit,
}: {
  /** In the order money should go when split automatically (oldest first). */
  contracts: PaymentFormContract[];
  /** A given split (an edited payment, a voice command) opens the form in manual mode. */
  initialAmounts?: Record<string, string>;
  /** Seeds the total box once (e.g. from a voice command); auto-split applies as usual. */
  initialTotal?: string;
  initialMethod?: PaymentMethod;
  submitLabel: string;
  /** When given, the save button names the amount and the customer. */
  payerName?: string;
  loading: boolean;
  onSubmit: (s: PaymentSubmit) => Promise<void>;
}) {
  const single = contracts.length === 1;
  const sumOf = (m: Record<string, string>) =>
    contracts.reduce((s, c) => s + (parseAmount(m[c.contractId] ?? '') || 0), 0);
  const [total, setTotal] = useState(() => initialTotal ?? (initialAmounts ? sumOf(initialAmounts).toFixed(2) : ''));
  const [amounts, setAmounts] = useState<Record<string, string>>(initialAmounts ?? {});
  // Auto: the money fills the oldest invoice first. Manual: the merchant types each line.
  const [manual, setManual] = useState(() => !single && !!initialAmounts);
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [failure, setFailure] = useState<string | null>(null);

  const totalNum = total.trim() === '' ? NaN : parseAmount(total);
  const owed = totalRemaining(contracts);
  const auto = manual ? null : autoSplit(totalNum, contracts);
  const lines = contracts.map((c, i) => {
    const raw = amounts[c.contractId] ?? '';
    return {
      contractId: c.contractId,
      amount: auto ? auto[i].amount : raw.trim() === '' ? 0 : parseAmount(raw),
      remaining: c.remaining,
    };
  });
  const tooMuch = !manual && Number.isFinite(totalNum) && Math.round(totalNum * 100) > Math.round(owed * 100);
  const error = tooMuch ? `المبلغ أكبر من اللي عليه (${formatEGP(owed)})` : validateSplit(totalNum, lines);
  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const diff = Math.round(((Number.isFinite(totalNum) ? totalNum : 0) - sum) * 100) / 100;

  function startManual() {
    // Start from the suggested split so the merchant only adjusts it.
    const seed: Record<string, string> = {};
    lines.forEach((l) => {
      if (l.amount > 0) seed[l.contractId] = l.amount.toFixed(2);
    });
    setAmounts(seed);
    setManual(true);
  }

  async function save() {
    if (error) return;
    setFailure(null);
    try {
      await onSubmit({
        method,
        lines: lines.filter((l) => l.amount > 0).map((l) => ({ contractId: l.contractId, amount: l.amount })),
        sig: JSON.stringify({ method, total, lines: lines.map((l) => [l.contractId, l.amount]) }),
      });
    } catch (e) {
      setFailure(failureMessage(e, 'ماتسجلتش الدفعة، جرّب تاني'));
    }
  }

  return (
    <View style={styles.form}>
      <Field
        label="المبلغ اللي دفعه"
        value={total}
        onChangeText={(v) => setTotal(sanitizeAmount(v))}
        keyboardType="decimal-pad"
        helper={`عليه كله ${formatEGP(owed)}`}
      />

      <View style={styles.group}>
        <Text style={styles.label}>دفع إزاي</Text>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((m) => (
            <Pressable
              key={m.value}
              accessibilityRole="button"
              accessibilityState={{ selected: method === m.value }}
              onPress={() => setMethod(m.value)}
              style={[styles.chip, method === m.value && styles.chipOn]}
            >
              <Text style={[styles.chipText, method === m.value && styles.chipTextOn]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.headRow}>
        <Text style={styles.heading}>الفلوس هتتخصم من</Text>
        {!single && !manual ? (
          <Pressable accessibilityRole="button" onPress={startManual} hitSlop={8} style={styles.link}>
            <Text style={styles.linkText}>وزّع بنفسي</Text>
          </Pressable>
        ) : null}
      </View>
      {!single && !manual ? <Text style={styles.hint}>الأقدم الأول. تقدر تغيّر التوزيع لو عاوز.</Text> : null}

      {contracts.map((c, i) => (
        <View key={c.contractId} style={styles.card}>
          <Text style={styles.cardTitle}>{c.title}</Text>
          <Text style={styles.label}>{`الباقي عليها ${formatEGP(c.remaining)}`}</Text>
          {manual ? (
            <Field
              label="هيتخصم منها"
              value={amounts[c.contractId] ?? ''}
              onChangeText={(v) => setAmounts((a) => ({ ...a, [c.contractId]: sanitizeAmount(v) }))}
              keyboardType="decimal-pad"
            />
          ) : (
            <Text style={styles.value}>{`هيتخصم منها ${formatEGP(Number.isFinite(lines[i].amount) ? lines[i].amount : 0)}`}</Text>
          )}
        </View>
      ))}

      {manual ? (
        <View
          style={[styles.sum, diff === 0 && Number.isFinite(totalNum) ? styles.sumOk : styles.sumOff]}
          accessibilityLabel="مجموع التوزيع"
        >
          <Text style={styles.sumText}>{`الموزّع ${formatEGP(sum)} من ${formatEGP(Number.isFinite(totalNum) ? totalNum : 0)}`}</Text>
          {diff !== 0 && Number.isFinite(totalNum) ? (
            <Text style={styles.sumText}>{diff > 0 ? `فاضل ${formatEGP(diff)}` : `زيادة ${formatEGP(-diff)}`}</Text>
          ) : null}
        </View>
      ) : null}

      {error && total !== '' ? <Text style={styles.error}>{error}</Text> : null}
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      <Button
        title={submitText(submitLabel, totalNum, error === null, payerName)}
        loading={loading}
        disabled={error !== null}
        onPress={save}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  group: { gap: space[2] },
  label: { ...type.helper, color: colors.inkMuted, textAlign: 'right' },
  value: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  heading: { ...type.title3, color: colors.ink, textAlign: 'right' },
  hint: { ...type.helper, color: colors.inkMuted, textAlign: 'right', marginTop: -space[2] },
  link: { minHeight: size.tapMin, justifyContent: 'center' },
  linkText: { ...type.label, color: colors.brand, textDecorationLine: 'underline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: border.strong,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  // Selected = black, the system's "this one" mark.
  chipOn: { backgroundColor: colors.inverse, borderColor: colors.inverse },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.onInverse },
  card: {
    backgroundColor: colors.surface,
    borderWidth: border.hairline,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[2],
  },
  cardTitle: { ...type.bodyStrong, color: colors.ink, textAlign: 'right' },
  sum: { borderRadius: radius.md, padding: space[4], gap: space[1] },
  sumOk: { backgroundColor: colors.paidBg },
  sumOff: { backgroundColor: colors.dueBg },
  sumText: { ...type.body, color: colors.ink, textAlign: 'right' },
  error: { ...type.body, color: colors.error, textAlign: 'right' },
});
