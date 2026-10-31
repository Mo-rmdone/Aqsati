import { useLocalSearchParams, useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  EMPTY_CUSTOMER,
  findCustomerByPhone,
  prefillFromSearch,
  useCreateCustomer,
  useCustomer,
  useCustomers,
  type NewCustomerForm,
} from '../../../api/customers';
import {
  PAYMENT_METHODS,
  derivePreview,
  saleDateError,
  normalizeDigits,
  sanitizeAmount,
  todayISO,
  sanitizeRate,
  useCreateSale,
  validateSaleForm,
  type SaleForm,
} from '../../../api/sales';
import { useAttempt } from '../../../lib/attempt';
import { formatDateAr } from '../../../lib/date';
import { newId } from '../../../lib/ids';
import { validateCustomer } from '../../../lib/validation';
import { formatEGP } from '../../../lib/money';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Money } from '../../../ui/Money';
import { Screen } from '../../../ui/Screen';
import { colors, radius, shadow, size, space, type } from '../../../ui/theme';

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

function CustomerPicker({
  onPick,
  onNew,
}: {
  onPick: (c: { id: string; name: string }) => void;
  onNew: (prefill: NewCustomerForm) => void;
}) {
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
      {(term.trim() ? (data ?? []) : []).slice(0, 6).map((c) => (
        <Pressable key={c.id} accessibilityRole="button" onPress={() => onPick(c)} style={styles.row}>
          <Text style={styles.rowName}>{c.name}</Text>
          <Text style={styles.rowPhone}>{c.phone}</Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" onPress={() => onNew(prefillFromSearch(search))} style={styles.newRow}>
        <UserPlus size={size.iconMd} color={colors.brand} />
        <Text style={styles.newRowText}>عميل جديد</Text>
      </Pressable>
    </View>
  );
}

export default function NewSale() {
  const router = useRouter();
  const { customerId: paramCustomerId } = useLocalSearchParams<{ customerId?: string }>();
  // One id per form instance: a double tap or retry re-sends the same sale.
  // Same id for a pure retry; a new one once the form changed after an attempt.
  const attempt = useAttempt();
  const create = useCreateSale();

  const createCustomer = useCreateCustomer();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const param = useCustomer(paramCustomerId ?? '');
  // A customer typed in here is created together with the invoice — there is no
  // separate "add customer" step. Its id is fixed per form so a retry never duplicates it.
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm | null>(null);
  const newCustomerId = useRef(newId());
  const [customerErrors, setCustomerErrors] = useState<ReturnType<typeof validateCustomer>>({});
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const customer = newCustomer
    ? { id: newCustomerId.current, name: newCustomer.name }
    : (picked ?? (paramCustomerId && param.data ? { id: param.data.id, name: param.data.name } : null));
  const setNc = (patch: Partial<NewCustomerForm>) => setNewCustomer((c) => ({ ...(c ?? EMPTY_CUSTOMER), ...patch }));

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
  const dateError = saleDateError(saleDate);
  const show = <K extends keyof typeof errors>(k: K) => (submitted ? errors[k] : undefined);
  const preview = useMemo(() => derivePreview(form), [form.saleType, price, down, rate, years, saleDate, productDesc]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm() {
    setPicked(null);
    setNewCustomer(null);
    newCustomerId.current = newId();
    setCustomerErrors({});
    setDuplicate(null);
    setProductDesc('');
    setPrice('');
    setSaleType('installment');
    setDown('');
    setRate('');
    setYears(1);
    setSaleDate(todayISO());
    setInvoiceNo('');
    setPaymentMethod('cash');
    setSubmitted(false);
    setFailure(null);
  }

  async function save(skipDuplicateCheck = false) {
    setSubmitted(true);
    setFailure(null);
    const cErrors = newCustomer ? validateCustomer(newCustomer) : {};
    setCustomerErrors(cErrors);
    if (!customer || Object.keys(cErrors).length > 0 || Object.keys(errors).length > 0 || dateError) return;
    setBusy(true);
    try {
      if (newCustomer) {
        if (!skipDuplicateCheck) {
          const dup = await findCustomerByPhone(newCustomer.phone);
          if (dup && dup.id !== newCustomerId.current) {
            setDuplicate(dup);
            return;
          }
        }
        // Idempotent upsert on the fixed id: safe to repeat if the sale step fails.
        await createCustomer.mutateAsync({ id: newCustomerId.current, ...newCustomer });
      }
      const id = await create.mutateAsync({
        form,
        id: attempt.idFor(JSON.stringify({ form, newCustomer })),
      });
      attempt.reset();
      resetForm();
      router.replace(`/contract/${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : (e as { message?: string } | null)?.message;
      setFailure(msg && /[؀-ۿ]/.test(msg) ? msg : 'تعذر حفظ الفاتورة، حاول مرة تانية');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="فاتورة جديدة">
      {newCustomer ? (
        <View style={styles.newCustomer}>
          <View style={styles.newHead}>
            <Text style={styles.sectionTitle}>عميل جديد</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNewCustomer(null);
                setDuplicate(null);
                setCustomerErrors({});
              }}
            >
              <Text style={styles.link}>اختار عميل موجود</Text>
            </Pressable>
          </View>
          <Field label="اسم العميل" value={newCustomer.name} onChangeText={(v) => setNc({ name: v })} error={customerErrors.name} />
          <Field
            label="رقم الموبايل"
            value={newCustomer.phone}
            onChangeText={(v) => {
              setNc({ phone: normalizeDigits(v) });
              setDuplicate(null);
            }}
            keyboardType="phone-pad"
            error={customerErrors.phone}
          />
          <Field
            label="الرقم القومي (اختياري)"
            value={newCustomer.nationalId}
            onChangeText={(v) => setNc({ nationalId: normalizeDigits(v) })}
            keyboardType="number-pad"
            error={customerErrors.nationalId}
          />
          <Field label="العنوان (اختياري)" value={newCustomer.address} onChangeText={(v) => setNc({ address: v })} />
        </View>
      ) : customer ? (
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
          <CustomerPicker onPick={setPicked} onNew={setNewCustomer} />
          {submitted ? <Text style={styles.error}>اختار العميل أو اضغط "عميل جديد"</Text> : null}
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
          <View style={styles.hero}>
            <Text style={styles.heroLabel}>القسط الشهري</Text>
            <Money value={preview.monthly} style={styles.heroValue} />
            <Text style={styles.heroSub}>{`× ${preview.count} شهر`}</Text>
          </View>
          <PreviewRow label="الباقي بعد المقدم" value={<Money value={preview.financed} />} />
          <PreviewRow label="الإجمالي بعد الفايدة" value={<Money value={preview.total} />} />
          <PreviewRow label="أول قسط" value={<Text style={styles.previewValue}>{formatDateAr(preview.firstDue)}</Text>} />
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

      {duplicate ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{`فيه عميل بنفس الرقم ده: ${duplicate.name}`}</Text>
          <Button
            title={`الفاتورة لـ ${duplicate.name}`}
            onPress={() => {
              setPicked(duplicate);
              setNewCustomer(null);
              setDuplicate(null);
            }}
          />
          <Button title="لأ، ده عميل تاني" variant="secondary" loading={busy} onPress={() => save(true)} />
        </View>
      ) : null}
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      {duplicate ? null : (
        <Button title="حفظ الفاتورة" loading={busy || create.isPending} onPress={() => save()} />
      )}
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
  group: { gap: space[2] },
  label: { ...type.label, color: colors.ink, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: size.tapLg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space[4],
    gap: space[3],
  },
  rowName: { ...type.bodyStrong, color: colors.ink },
  rowPhone: { ...type.helper, color: colors.inkMuted, writingDirection: 'ltr' },
  link: { ...type.label, color: colors.brand, paddingVertical: space[2] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minHeight: size.tapMin,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipText: { ...type.label, color: colors.ink },
  chipTextOn: { color: colors.brand },
  preview: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  // The monthly installment is the loudest thing on this screen.
  hero: {
    backgroundColor: colors.coinSoft,
    borderRadius: radius.md,
    paddingVertical: space[4],
    alignItems: 'center',
    gap: space[1],
  },
  heroLabel: { ...type.label, color: colors.inkMuted },
  heroValue: { ...type.displayMoney, color: colors.brand },
  heroSub: { ...type.bodyStrong, color: colors.ink },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  previewLabel: { ...type.body, color: colors.inkMuted },
  previewValue: { ...type.bodyStrong, color: colors.ink },
  error: { ...type.body, color: colors.error, textAlign: 'right' },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: size.tapLg,
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  newRowText: { ...type.label, color: colors.brand },
  newCustomer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space[4],
    gap: space[3],
    ...shadow.card,
  },
  newHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[3] },
  sectionTitle: { ...type.title3, color: colors.ink },
  banner: { backgroundColor: colors.dueBg, borderRadius: radius.lg, padding: space[4], gap: space[3] },
  bannerText: { ...type.bodyStrong, color: colors.due, textAlign: 'right' },
});
