import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useCustomer, useCustomers } from '../../../api/customers';
import {
  PAYMENT_METHODS,
  derivePreview,
  idForAttempt,
  isValidDate,
  normalizeDigits,
  sanitizeAmount,
  todayISO,
  sanitizeRate,
  useCreateSale,
  validateSaleForm,
  type SaleForm,
} from '../../../api/sales';
import { newId } from '../../../lib/ids';
import { formatEGP } from '../../../lib/money';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { colors, font, radius, spacing } from '../../../ui/theme';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function CustomerPicker({ onPick }: { onPick: (c: { id: string; name: string }) => void }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data } = useCustomers(term);
  return (
    <View style={styles.group}>
      <Field label="العميل" placeholder="ابحث بالاسم أو الموبايل" value={search} onChangeText={setSearch} />
      {(data ?? []).slice(0, 8).map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => onPick(c)} style={styles.row}>
          <Text style={styles.rowName}>{c.name}</Text>
          <Text style={styles.rowPhone}>{c.phone}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function NewSale() {
  const router = useRouter();
  const { customerId: paramCustomerId } = useLocalSearchParams<{ customerId?: string }>();
  // One id per form instance: a double tap or retry re-sends the same sale.
  // Same id for a pure retry; a new one once the form changed after an attempt.
  const attemptRef = useRef<{ id: string; sig: string | null }>({ id: newId(), sig: null });
  const create = useCreateSale();

  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const param = useCustomer(paramCustomerId ?? '');
  const customer = picked ?? (paramCustomerId && param.data ? { id: param.data.id, name: param.data.name } : null);

  const [productDesc, setProductDesc] = useState('');
  const [price, setPrice] = useState('');
  const [saleType, setSaleType] = useState<SaleForm['saleType']>('installment');
  const [down, setDown] = useState('');
  const [rate, setRate] = useState('');
  const [years, setYears] = useState(1);
  const [saleDate, setSaleDate] = useState(todayISO());
  const [invoiceNo, setInvoiceNo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<SaleForm['paymentMethod']>('cash');
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const form: SaleForm = {
    customerId: customer?.id ?? '',
    productDesc,
    price,
    saleType,
    down,
    rate,
    years,
    saleDate,
    invoiceNo,
    paymentMethod,
  };
  const errors = validateSaleForm(form);
  const dateError = isValidDate(saleDate) ? undefined : 'التاريخ غير صحيح (YYYY-MM-DD)';
  const show = <K extends keyof typeof errors>(k: K) => (submitted ? errors[k] : undefined);
  const preview = useMemo(() => derivePreview(form), [form.saleType, price, down, rate, years, saleDate, productDesc]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSubmitted(true);
    setFailure(null);
    if (!customer || Object.keys(errors).length > 0 || dateError) return;
    try {
      attemptRef.current = idForAttempt(attemptRef.current, JSON.stringify(form), newId);
      const id = await create.mutateAsync({ form, id: attemptRef.current.id });
      router.replace(`/contract/${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
      setFailure(msg && /[؀-ۿ]/.test(msg) ? msg : 'تعذر حفظ الفاتورة، حاول مرة تانية');
    }
  }

  return (
    <Screen title="فاتورة جديدة">
      {customer ? (
        <View style={styles.group}>
          <Text style={styles.label}>العميل</Text>
          <View style={styles.row}>
            <Text style={styles.rowName}>{customer.name}</Text>
            {picked || !paramCustomerId ? (
              <Pressable accessibilityRole="button" onPress={() => setPicked(null)}>
                <Text style={styles.link}>تغيير</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : paramCustomerId && param.isLoading ? null : (
        <>
          <CustomerPicker onPick={setPicked} />
          {submitted ? <Text style={styles.error}>اختار العميل الأول</Text> : null}
        </>
      )}

      <Field label="اسم السلعة" value={productDesc} onChangeText={setProductDesc} error={show('productDesc')} />
      <Field
        label="السعر"
        value={price}
        onChangeText={(v) => setPrice(sanitizeAmount(v))}
        keyboardType="decimal-pad"
        error={show('totalPrice')}
      />

      <View style={styles.chips}>
        <Chip label="كاش" selected={saleType === 'cash'} onPress={() => setSaleType('cash')} />
        <Chip label="تقسيط" selected={saleType === 'installment'} onPress={() => setSaleType('installment')} />
      </View>

      {saleType === 'installment' ? (
        <>
          <Field label="المقدم" value={down} onChangeText={(v) => setDown(sanitizeAmount(v))} keyboardType="decimal-pad" error={show('down')} />
          <Field
            label="نسبة الفايدة %"
            value={rate}
            onChangeText={(v) => setRate(sanitizeRate(v))}
            keyboardType="decimal-pad"
            error={show('ratePercent')}
          />
          <View style={styles.group}>
            <Text style={styles.label}>المدة</Text>
            <View style={styles.chips}>
              {[1, 2, 3, 4, 5].map((y) => (
                <Chip key={y} label={`${y} ${y === 1 ? 'سنة' : 'سنين'}`} selected={years === y} onPress={() => setYears(y)} />
              ))}
            </View>
          </View>
        </>
      ) : null}

      <Field
        label="تاريخ البيع (YYYY-MM-DD)"
        value={saleDate}
        onChangeText={(v) => setSaleDate(normalizeDigits(v))}
        autoCapitalize="none"
        error={submitted ? dateError : undefined}
      />

      {preview ? (
        <View style={styles.preview} accessibilityLabel="معاينة الأقساط">
          <PreviewRow label="الباقي" value={<Money value={preview.financed} />} />
          <PreviewRow label="الإجمالي بعد الفايدة" value={<Money value={preview.total} />} />
          <PreviewRow label="القسط الشهري" value={<Money value={preview.monthly} />} />
          <PreviewRow label="عدد الأقساط" value={<Text style={styles.previewValue}>{preview.count}</Text>} />
          <PreviewRow label="أول قسط" value={<Text style={styles.previewValue}>{preview.firstDue}</Text>} />
          {preview.last !== preview.monthly ? (
            <PreviewRow label="القسط الأخير" value={<Text style={styles.previewValue}>{formatEGP(preview.last)}</Text>} />
          ) : null}
        </View>
      ) : null}

      <Field label="رقم الفاتورة الخارجي (اختياري)" value={invoiceNo} onChangeText={setInvoiceNo} />

      <View style={styles.group}>
        <Text style={styles.label}>{saleType === 'cash' ? 'طريقة الدفع' : 'طريقة دفع المقدم'}</Text>
        <View style={styles.chips}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m.value} label={m.label} selected={paymentMethod === m.value} onPress={() => setPaymentMethod(m.value)} />
          ))}
        </View>
      </View>

      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      <Button title="حفظ الفاتورة" loading={create.isPending} onPress={save} />
    </Screen>
  );
}

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      {value}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  label: { fontSize: font.small, color: colors.muted, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  rowName: { fontSize: font.body, color: colors.text, fontWeight: '600' },
  rowPhone: { fontSize: font.small, color: colors.muted },
  link: { color: colors.primary, fontSize: font.body },
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
  preview: {
    backgroundColor: colors.successBg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontSize: font.body, color: colors.muted },
  previewValue: { fontSize: font.body, color: colors.text, writingDirection: 'ltr' },
  error: { color: colors.danger, fontSize: font.body, textAlign: 'right' },
});
