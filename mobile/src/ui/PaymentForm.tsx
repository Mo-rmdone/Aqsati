import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PaymentLineInput } from '../api/payments';
import { PAYMENT_METHODS, parseAmount, sanitizeAmount, type PaymentMethod } from '../api/sales';
import { formatEGP } from '../lib/money';
import { validateSplit } from '../lib/split';
import { Button } from './Button';
import { Field } from './Field';
import { colors, font, radius, spacing } from './theme';

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

export function PaymentForm({
  contracts,
  initialAmounts,
  initialMethod = 'cash',
  submitLabel,
  loading,
  onSubmit,
}: {
  contracts: PaymentFormContract[];
  initialAmounts?: Record<string, string>;
  initialMethod?: PaymentMethod;
  submitLabel: string;
  loading: boolean;
  onSubmit: (s: PaymentSubmit) => Promise<void>;
}) {
  const single = contracts.length === 1;
  const sumOf = (m: Record<string, string>) =>
    contracts.reduce((s, c) => s + (parseAmount(m[c.contractId] ?? '') || 0), 0);
  const [total, setTotal] = useState(() => (initialAmounts ? String(Math.round(sumOf(initialAmounts) * 100) / 100) : ''));
  const [amounts, setAmounts] = useState<Record<string, string>>(initialAmounts ?? {});
  const [method, setMethod] = useState<PaymentMethod>(initialMethod);
  const [failure, setFailure] = useState<string | null>(null);

  const rowValue = (c: PaymentFormContract) => (single ? total : amounts[c.contractId] ?? '');
  const lines = contracts.map((c) => ({
    contractId: c.contractId,
    amount: rowValue(c).trim() === '' ? 0 : parseAmount(rowValue(c)),
    remaining: c.remaining,
  }));
  const totalNum = total.trim() === '' ? NaN : parseAmount(total);
  const error = validateSplit(totalNum, lines);
  const sum = lines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0);
  const diff = Math.round(((Number.isFinite(totalNum) ? totalNum : 0) - sum) * 100) / 100;

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
      setFailure(failureMessage(e, 'تعذر حفظ الدفعة، حاول مرة تانية'));
    }
  }

  return (
    <View style={styles.form}>
      <Field
        label="المبلغ الكلي"
        value={total}
        onChangeText={(v) => setTotal(sanitizeAmount(v))}
        keyboardType="decimal-pad"
      />

      <View style={styles.group}>
        <Text style={styles.label}>طريقة الدفع</Text>
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

      <Text style={styles.heading}>التوزيع على العقود</Text>
      {contracts.map((c) => (
        <View key={c.contractId} style={styles.card}>
          <Text style={styles.cardTitle}>{c.title}</Text>
          <Text style={styles.label}>{`الباقي: ${formatEGP(c.remaining)}`}</Text>
          {single ? (
            <Text style={styles.value}>{formatEGP(Number.isFinite(totalNum) ? totalNum : 0)}</Text>
          ) : (
            <Field
              label="المبلغ"
              value={amounts[c.contractId] ?? ''}
              onChangeText={(v) => setAmounts((a) => ({ ...a, [c.contractId]: sanitizeAmount(v) }))}
              keyboardType="decimal-pad"
            />
          )}
        </View>
      ))}

      <View style={[styles.sum, diff === 0 && Number.isFinite(totalNum) ? styles.sumOk : styles.sumOff]} accessibilityLabel="مجموع التوزيع">
        <Text style={styles.sumText}>{`الموزّع ${formatEGP(sum)} من ${formatEGP(Number.isFinite(totalNum) ? totalNum : 0)}`}</Text>
        {diff !== 0 && Number.isFinite(totalNum) ? (
          <Text style={styles.sumText}>{diff > 0 ? `فاضل ${formatEGP(diff)}` : `زيادة ${formatEGP(-diff)}`}</Text>
        ) : null}
      </View>

      {error && total !== '' ? <Text style={styles.error}>{error}</Text> : null}
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      <Button title={submitLabel} loading={loading} disabled={error !== null} onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  group: { gap: spacing.xs },
  label: { fontSize: font.small, color: colors.muted, textAlign: 'right' },
  value: { fontSize: font.body, color: colors.text, textAlign: 'right', writingDirection: 'ltr' },
  heading: { fontSize: font.heading, fontWeight: '700', color: colors.text, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: font.body, color: colors.text },
  chipTextOn: { color: colors.primaryText, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { fontSize: font.body, fontWeight: '600', color: colors.text, textAlign: 'right' },
  sum: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  sumOk: { backgroundColor: colors.successBg },
  sumOff: { backgroundColor: colors.warningBg },
  sumText: { fontSize: font.body, color: colors.text, textAlign: 'right' },
  error: { color: colors.danger, fontSize: font.body, textAlign: 'right' },
});
