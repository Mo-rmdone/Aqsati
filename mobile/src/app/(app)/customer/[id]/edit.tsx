import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { findCustomerByPhone, useCustomer, useUpdateCustomer } from '../../../../api/customers';
import { normalizeDigits } from '../../../../api/sales';
import { validateCustomer } from '../../../../lib/validation';
import { Button } from '../../../../ui/Button';
import { Field } from '../../../../ui/Field';
import { Screen } from '../../../../ui/Screen';
import { colors, radius, space, type } from '../../../../ui/theme';

export default function EditCustomer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const customer = useCustomer(id);
  const update = useUpdateCustomer();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(`/customers/${id}`));

  const [form, setForm] = useState<{ name: string; phone: string; nationalId: string; address: string; notes: string } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [other, setOther] = useState<{ id: string; name: string } | null>(null);

  // Seed the form once, when the customer first arrives.
  useEffect(() => {
    const c = customer.data;
    if (c && !form) {
      setForm({ name: c.name, phone: c.phone, nationalId: c.national_id ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    }
  }, [customer.data, form]);

  // A phone that already belongs to someone else is a warning, never a blocker.
  const phone = form?.phone ?? '';
  useEffect(() => {
    let live = true;
    setOther(null);
    if (!/^01[0125][0-9]{8}$/.test(phone)) return;
    const t = setTimeout(() => {
      findCustomerByPhone(phone, id)
        .then((dup) => {
          if (live) setOther(dup);
        })
        .catch(() => {});
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone, id]);

  if (customer.isLoading || (customer.data && !form)) {
    return (
      <Screen>
        <ActivityIndicator color={colors.primary} />
      </Screen>
    );
  }
  if (customer.error || !customer.data || !form) {
    return (
      <Screen title="تعديل العميل" onBack={goBack}>
        <Text style={styles.error}>{customer.error ? 'تعذر تحميل العميل' : 'العميل غير موجود'}</Text>
      </Screen>
    );
  }

  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });
  const errors = validateCustomer(form);
  const show = (k: keyof typeof errors) => (submitted ? errors[k] : undefined);

  async function save() {
    if (!form) return;
    setSubmitted(true);
    setFailure(null);
    if (Object.keys(errors).length > 0) return;
    try {
      await update.mutateAsync({ id, ...form });
      goBack();
    } catch {
      setFailure('تعذر حفظ التعديل، حاول مرة تانية');
    }
  }

  return (
    <Screen title="تعديل العميل" onBack={goBack}>
      <Field label="الاسم" value={form.name} onChangeText={(v) => set({ name: v })} error={show('name')} />
      <Field
        label="الموبايل"
        value={form.phone}
        onChangeText={(v) => set({ phone: normalizeDigits(v) })}
        keyboardType="phone-pad"
        error={show('phone')}
      />
      {other ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{`الرقم ده موجود بالفعل عند ${other.name}`}</Text>
        </View>
      ) : null}
      <Field
        label="الرقم القومي (اختياري)"
        value={form.nationalId}
        onChangeText={(v) => set({ nationalId: normalizeDigits(v) })}
        keyboardType="number-pad"
        error={show('nationalId')}
      />
      <Field label="العنوان (اختياري)" value={form.address} onChangeText={(v) => set({ address: v })} />
      <Field
        label="ملاحظات"
        value={form.notes}
        onChangeText={(v) => set({ notes: v })}
        multiline
        style={styles.notesInput}
      />
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      <Button title="حفظ" loading={update.isPending} onPress={save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.dueBg, borderRadius: radius.lg, padding: space[4] },
  bannerText: { ...type.bodyStrong, color: colors.due, textAlign: 'right' },
  notesInput: { minHeight: 120, textAlignVertical: 'top', paddingVertical: space[3] },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
});
