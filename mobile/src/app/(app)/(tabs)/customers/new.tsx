import { Link, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { findCustomerByPhone, useCreateCustomer } from '../../../../api/customers';
import { newId } from '../../../../lib/ids';
import { validateCustomer } from '../../../../lib/validation';
import { Button } from '../../../../ui/Button';
import { Field } from '../../../../ui/Field';
import { Screen } from '../../../../ui/Screen';
import { colors, font, radius, spacing } from '../../../../ui/theme';

export default function NewCustomer() {
  const router = useRouter();
  // One id per form instance: a retried save is idempotent server-side.
  const idRef = useRef(newId());
  const create = useCreateCustomer();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<ReturnType<typeof validateCustomer>>({});
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function save(skipDuplicateCheck: boolean) {
    setFailure(null);
    const e = validateCustomer({ name, phone, nationalId });
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      if (!skipDuplicateCheck) {
        const dup = await findCustomerByPhone(phone);
        if (dup) {
          setDuplicate(dup);
          return;
        }
      }
      const id = await create.mutateAsync({ id: idRef.current, name, phone, nationalId, address });
      router.replace(`/customers/${id}`);
    } catch {
      setFailure('تعذر حفظ العميل، حاول مرة تانية');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen title="عميل جديد" onBack={() => (router.canGoBack() ? router.back() : router.replace('/customers'))}>
      <Field label="الاسم" value={name} onChangeText={setName} error={errors.name} />
      <Field
        label="رقم الموبايل"
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setDuplicate(null);
        }}
        keyboardType="phone-pad"
        error={errors.phone}
      />
      <Field
        label="الرقم القومي (اختياري)"
        value={nationalId}
        onChangeText={setNationalId}
        keyboardType="number-pad"
        error={errors.nationalId}
      />
      <Field label="العنوان (اختياري)" value={address} onChangeText={setAddress} />
      {duplicate ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>العميل ده موجود بالفعل: {duplicate.name}</Text>
          <Link href={`/customers/${duplicate.id}`} style={styles.link}>
            فتح ملف العميل
          </Link>
          <Button title="حفظ برضه" variant="secondary" loading={saving} onPress={() => save(true)} />
        </View>
      ) : null}
      {failure ? <Text style={styles.error}>{failure}</Text> : null}
      {duplicate ? null : <Button title="حفظ" loading={saving} onPress={() => save(false)} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warningBg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  bannerText: { color: colors.warning, fontSize: font.body, fontWeight: '600', textAlign: 'right' },
  link: { color: colors.primary, fontSize: font.body, textAlign: 'right' },
  error: { color: colors.danger, fontSize: font.body, textAlign: 'right' },
});
